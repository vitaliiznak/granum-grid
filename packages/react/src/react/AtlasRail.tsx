import {
  useEffect,
  useMemo,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { clamp, rowToProgress } from '@granum-grid/core/internal';
import { bucketAt, chapterAt } from '@granum-grid/core/internal';
import {
  atlasDomain,
  atlasTicks,
  drawAtlas,
  observeCanvas,
  overviewAccuracy,
  profileValue,
} from '@granum-grid/core/map';
import { formatCompact, formatMetric } from '@granum-grid/core/map';
import {
  FULL_SPEED,
  atlasPeaks,
  beginScrub,
  moveScrub,
  rowAtPointer,
  type Scrub,
} from '@granum-grid/core/map';
import { MarkerLayer } from './MarkerLayer.js';
import type { Marker, RowRange } from '@granum-grid/core/data';
import type { GranumGridState } from './useGranumGrid.js';
import { INTERNAL } from './internal.js';
export interface AtlasRailOptions {
  /** Map configuration does not change the current row or provider. */
  variant?: 'profile' | 'markers';
  layout?: 'auto' | 'expanded' | 'compact';
  axis?: 'chapters' | 'rows';
  axisLabel?: string;
  title?: string;
  showRange?: boolean;
  /** Offer additional provider metrics in a selector above the single chart. */
  showTracks?: boolean;
  /** Maximum axis labels, limited to 2–12 and available height. Default 5. */
  maxAxisTicks?: number;
  /** These layers are visible by default. */
  showMarkers?: boolean;
  showVisibleRange?: boolean;
  showTrail?: boolean;
  showLegend?: boolean;
  markerLabels?: 'label' | 'number' | 'none';
  /** Hover details. Summary mode does not request preview rows. Default rows. */
  preview?: 'rows' | 'summary' | 'none';
  /** Exact rows requested on hover, limited to 1–5. Default 3. */
  previewRows?: number;
  /** Crop of the overview beside hover details; reuses its buckets. Default false. */
  showMagnifier?: boolean;
  /** Slow scrubbing while the pointer moves sideways during a drag. Default true. */
  precision?: boolean;
  /** Snap slow drags to visible provider markers. Default true. */
  snapToMarkers?: boolean;
  /** Attract hover, clicks, and slow full-speed drags to visible chart peaks. Default true. */
  snapToPeaks?: boolean;
  formatValue?(value: number): string;
  /** Host controls displayed beside the map title and help button. */
  actions?: ReactNode;
  /**
   * While true, dragging on the map draws the selection instead of navigating. The host owns
   * this mode, for example from a "Select rows" button.
   */
  selecting?: boolean;
  /** Called with false when a map selection ends or is cancelled. */
  onSelectingChange?(selecting: boolean): void;
}
export interface AtlasRailProps<Row> extends AtlasRailOptions {
  /** The `useGranumGrid` result. */
  grid: GranumGridState<Row>;
  /** Extra places drawn with the markers, such as search results. N/P does not visit them. */
  highlights?: readonly Marker[];
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  renderPreviewRow?(row: Row, index: number): ReactNode;
}
interface HoverTarget {
  index: number;
  y: number;
  peak?: number;
}
/** Default preview: the first three text or number fields of an object row. */
function previewText(row: unknown) {
  return typeof row === 'object' && row !== null
    ? Object.values(row)
        .filter((value) => typeof value === 'string' || typeof value === 'number')
        .slice(0, 3)
        .join(' · ')
    : String(row);
}

const NO_HIGHLIGHTS: readonly Marker[] = [];

/** An element's rendered height, followed while `key` keeps the same element mounted. */
function useElementHeight(
  ref: RefObject<HTMLElement | null>,
  initial: number,
  box: 'clientHeight' | 'offsetHeight',
  key?: unknown,
) {
  const [height, setHeight] = useState(initial);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element[box]));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, box, key]);
  return height;
}

export function AtlasRail<Row>({
  grid,
  highlights = NO_HIGHLIGHTS,
  selecting = false,
  onSelectingChange,
  ariaLabel = 'Dataset position',
  renderPreviewRow,
  className,
  style,
  actions,
  ...options
}: AtlasRailProps<Row>) {
  const helpId = useId();
  const rangeDrag = useRef<{ anchor: number; previous: RowRange | null } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const { engine, session, mapping, reduceMotion } = grid[INTERNAL];
  const { snapshot, provider, selection } = grid;
  const setSelection = grid.api.setSelection;
  const [chart, setChart] = useState<{ session: typeof session; id: string }>();
  const track = useRef<HTMLDivElement>(null);
  const trackHeight = useElementHeight(track, 400, 'clientHeight');
  const canvas = useRef<HTMLCanvasElement>(null);
  const magnifier = useRef<HTMLCanvasElement>(null);
  const previewElement = useRef<HTMLDivElement>(null);
  const [hover, setHoverState] = useState<HoverTarget | null>(null);
  // Pointer moves arrive every frame; keep the same state when the target has not changed.
  const setHover = (next: HoverTarget | null) =>
    setHoverState((current) =>
      current &&
      next &&
      current.index === next.index &&
      current.y === next.y &&
      current.peak === next.peak
        ? current
        : next,
    );
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [precision, setPrecision] = useState<string>(FULL_SPEED);
  const drag = useRef<Scrub | null>(null);
  const [dragging, setDragging] = useState(false);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
  // Release the previous dataset's session as well as resetting its chart choice.
  if (chart && chart.session !== session) setChart(undefined);
  useEffect(() => {
    const controller = engine;
    let previous = controller.getSnapshot().position;
    let settle: ReturnType<typeof setTimeout> | undefined;
    setScrollDirection(null);
    // Row-level movement can be subpixel on a billion-row map. Show activity
    // from actual position changes without exaggerating the global address.
    const unsubscribe = controller.subscribe(() => {
      const position = controller.getSnapshot().position;
      if (position === previous) return;
      setScrollDirection(position > previous ? 'down' : 'up');
      previous = position;
      clearTimeout(settle);
      settle = setTimeout(() => setScrollDirection(null), 220);
    });
    return () => {
      unsubscribe();
      clearTimeout(settle);
    };
  }, [engine]);
  const total = snapshot.rowCount;
  const markers = useMemo(
    () => (highlights.length ? [...grid.markers, ...highlights] : grid.markers),
    [grid.markers, highlights],
  );
  const hasBookmarks = grid.markers.some((marker) => marker.kind === 'bookmark');
  const visibleStart = Math.max(0, mapping.toRow(0));
  const visibleEnd = Math.min(total, mapping.toRow(snapshot.height));
  /** Place a half-open row span on the track. */
  const spanStyle = (start: number, end: number) => ({
    top: `${(start / Math.max(1, total)) * 100}%`,
    height: `${(Math.max(0, end - start) / Math.max(1, total)) * 100}%`,
  });
  const currentChapter = chapterAt(session.chapters, snapshot.position);
  // The rail re-renders on every position change; derive metadata only when it changes.
  const selectedTrack =
    options.showTracks && chart?.session === session
      ? session.tracks.find((item) => item.id === chart.id)
      : undefined;
  const overview = selectedTrack?.buckets ?? session.overview;
  const metric = selectedTrack ? selectedTrack.metric : provider.metric;
  const metricLabel = selectedTrack?.label ?? metric?.label ?? 'Value';
  const metricDomain = metric?.domain;
  const metricKind = metric?.kind;
  const domain = useMemo(
    () => atlasDomain(overview, metricDomain, metricKind),
    [overview, metricDomain, metricKind],
  );
  const kind = metricKind ?? 'value';
  const showProfile = options.variant !== 'markers';
  const showMarkers = options.showMarkers !== false;
  const precisionDrag = options.precision !== false;
  const peakGravity = showProfile && options.snapToPeaks !== false;
  const peaks = useMemo(
    () => (peakGravity ? atlasPeaks(overview, domain, kind) : []),
    [peakGravity, overview, domain, kind],
  );
  const preview = options.preview ?? 'rows';
  const showPreviewRows = preview === 'rows';
  const showMagnifier = preview !== 'none' && options.showMagnifier === true && showProfile;
  const previewVisible = !!hover && !helpOpen && (dragging || preview !== 'none');
  const previewHeight = useElementHeight(previewElement, 180, 'offsetHeight', previewVisible);
  const previewRows = Number.isFinite(options.previewRows)
    ? clamp(Math.floor(options.previewRows!), 1, 5)
    : 3;
  const maxAxisTicks = Number.isFinite(options.maxAxisTicks)
    ? clamp(Math.floor(options.maxAxisTicks!), 2, 12)
    : 5;
  const showRange = !!options.showRange && kind === 'value';
  const axis = options.axis ?? 'chapters';
  const tickLimit = Math.min(maxAxisTicks, Math.max(2, Math.floor(trackHeight / 70)));
  const ticks = useMemo(
    () => atlasTicks(total, session.chapters, axis, tickLimit),
    [total, session.chapters, axis, tickLimit],
  );
  const hasChapterAxis = axis === 'chapters' && session.chapters.length > 0;
  const axisLabel =
    axis === 'chapters' && !hasChapterAxis
      ? 'Row'
      : (options.axisLabel ?? (hasChapterAxis ? 'Position' : 'Row'));
  // The host formatter describes the primary metric, not unrelated track units.
  const formatValue = (value: number) => {
    if (!selectedTrack && options.formatValue) return options.formatValue(value);
    return formatMetric(value, 1, metric?.unit);
  };
  const profileLabel = kind === 'density' ? 'Density' : 'Average';
  const overviewSupported = !!(selectedTrack
    ? provider.fetchOverviewTracks
    : provider.fetchOverview);
  const overviewFailed = !!(selectedTrack
    ? session.metadataErrors.tracks
    : session.metadataErrors.overview);
  const accuracy = useMemo(
    () =>
      overviewAccuracy(overview, kind, {
        supported: overviewSupported,
        failed: overviewFailed,
      }),
    [overview, kind, overviewSupported, overviewFailed],
  );
  const hoverBucket = hover ? bucketAt(overview, hover.index) : undefined;
  const hoverValue = hoverBucket ? profileValue(hoverBucket, kind) : null;
  useEffect(() => {
    if (!canvas.current) return;
    const draw = () =>
      drawAtlas(canvas.current!, showProfile ? overview : [], total, domain, kind, showRange);
    draw();
    return observeCanvas(canvas.current, draw);
  }, [overview, total, showProfile, showRange, domain, kind]);
  const hoverIndex = hover?.index;
  useEffect(() => {
    setPreviewIndex(null);
    if (hoverIndex === undefined || !showPreviewRows || dragging) return;
    const timer = setTimeout(() => setPreviewIndex(hoverIndex), 150);
    return () => clearTimeout(timer);
  }, [hoverIndex, showPreviewRows, dragging]);
  useEffect(() => {
    session.setRange(
      'preview',
      previewIndex ?? 0,
      previewIndex === null || !showPreviewRows || dragging
        ? 0
        : Math.min(previewRows, total - previewIndex),
    );
    return () => session.setRange('preview', 0, 0);
  }, [session, previewIndex, previewRows, total, showPreviewRows, dragging]);
  useEffect(() => {
    if (!magnifier.current || hoverIndex === undefined) return;
    const range = Math.max(1, total * 0.045),
      start = Math.max(0, hoverIndex - range / 2),
      end = Math.min(total, start + range);
    const buckets = overview
      .filter((b) => b.end > start && b.start < end)
      .map((b) => ({
        ...b,
        start: Math.max(start, b.start) - start,
        end: Math.min(end, b.end) - start,
      }));
    drawAtlas(magnifier.current, buckets, end - start, domain, kind, showRange, 'lens');
  }, [hoverIndex, overview, showMagnifier, helpOpen, showRange, domain, kind, total]);
  /** The track's place on screen, for the shared pointer math in `@granum-grid/core/map`. */
  const geometry = () => {
    const rect = track.current!.getBoundingClientRect();
    return { top: rect.top, height: rect.height, rowCount: total };
  };
  const atPointer = (clientY: number, attract = false) =>
    rowAtPointer(clientY, geometry(), attract ? peaks : []);
  const finish = (cancel = false) => {
    if (rangeDrag.current) {
      if (cancel) setSelection(rangeDrag.current.previous);
      rangeDrag.current = null;
      onSelectingChange?.(false);
      setDragging(false);
      return;
    }
    if (drag.current) {
      const state = drag.current;
      if (!state.moved && !cancel) {
        engine.endScrub(true);
        engine.goTo(Math.round(state.destination));
      } else engine.endScrub(cancel);
    }
    drag.current = null;
    setDragging(false);
  };
  return (
    <aside
      className={`gr-rail ${className ?? ''}`}
      style={style}
      data-gr-part="rail"
      aria-label="Dataset scrollbar"
      data-layout={options.layout ?? 'auto'}
      data-variant={showProfile ? 'profile' : 'markers'}
      data-marker-labels={options.markerLabels ?? 'label'}
      data-show-markers={showMarkers}
      data-scrolling={scrollDirection ?? undefined}
      data-scroll-motion={reduceMotion ? 'off' : 'on'}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setHelpOpen(false);
      }}
    >
      <div className="gr-rail-title">
        <strong>
          <span className="gr-map-title">{options.title ?? 'Scrollbar'}</span>
        </strong>
        <div className="gr-rail-actions">
          <button
            type="button"
            className="gr-button gr-map-help-button"
            aria-label="About dataset scrollbar"
            aria-expanded={helpOpen}
            aria-controls={helpId}
            onClick={() => setHelpOpen(!helpOpen)}
          >
            ?
          </button>
          {actions}
        </div>
      </div>
      <div id={helpId} className="gr-map-help" hidden={!helpOpen} role="note" tabIndex={0}>
        <strong>
          {showProfile ? `How to read ${metricLabel.toLowerCase()}` : 'How to use this scrollbar'}
        </strong>
        <p>
          Top to bottom follows row order, from the first row to the last. Click or drag to move.
          {peakGravity &&
            ' Nearby chart peaks gently attract the pointer target. Hold Shift to move freely.'}
        </p>
        {showProfile && (
          <p>
            The chart shows {metricLabel.toLowerCase()}. Each horizontal strip summarizes a group of
            rows. The profile extends toward larger{' '}
            {kind === 'density' ? 'density' : 'average values'} on the horizontal scale. Scale:{' '}
            {formatValue(domain[0])}–{formatValue(domain[1])}. The value describes the whole group,
            not a single row.
            {showRange ? ' The faint band shows the minimum to maximum.' : ''}
          </p>
        )}
        {showProfile && metric?.description && <p>{metric.description}</p>}
        <p>
          Drag the handle on the far right to scroll. The dashed line marks your current row in the
          chart.
          {options.showVisibleRange !== false &&
            ' Shading shows the visible range; very small ranges appear as a thin line.'}
          {showMarkers &&
            ' Diamonds mark incidents, deploys, and other provider markers; stars mark your bookmarks. A circle with +N groups nearby markers under the most severe one; open it to search the list.'}
        </p>
        {showProfile && (
          <p>
            {accuracy[0].toUpperCase() + accuracy.slice(1)} overview
            {overview.length > 0
              ? ` · ${overview.length} groups · about ${Math.round(total / overview.length).toLocaleString()} rows per group`
              : ''}
            . {accuracy === 'sampled' ? 'Summaries use samples, not every row.' : ''}
          </p>
        )}
      </div>
      {selecting && (
        <p className="gr-selection-hint" role="status">
          Drag on the scrollbar to select a range. Escape cancels.
        </p>
      )}
      <p className="gr-map-guide">Whole dataset · click or drag to jump</p>
      {showProfile && (
        <div
          className="gr-map-compact-caption"
          title={`${metricLabel} · higher values to the right`}
        >
          {metricLabel} <span aria-hidden="true">→</span>
        </div>
      )}
      {showProfile && (
        <div className="gr-map-metric">
          {options.showTracks && session.tracks.length > 0 ? (
            <label>
              Chart
              <select
                className="gr-input"
                aria-label="Scrollbar chart"
                value={selectedTrack ? `track:${selectedTrack.id}` : 'primary'}
                onChange={(event) => {
                  setChart(
                    event.target.value === 'primary'
                      ? undefined
                      : { session, id: event.target.value.slice('track:'.length) },
                  );
                  setHover(null);
                }}
              >
                <option value="primary">{provider.metric?.label ?? 'Value'}</option>
                {session.tracks.map((item) => (
                  <option key={item.id} value={`track:${item.id}`}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <strong>{metricLabel}</strong>
          )}
        </div>
      )}
      <div className="gr-map-axis-heading">
        <span>{axisLabel} ↓</span>
        <span>{showProfile ? 'Higher →' : ''}</span>
        {showMarkers && <span className="gr-map-events-heading">Markers</span>}
      </div>
      {showProfile && (
        <div
          className="gr-map-value-axis"
          aria-label={`${metricLabel} scale: ${formatValue(domain[0])} to ${formatValue(domain[1])}`}
        >
          <span>{formatValue(domain[0])}</span>
          <span>{formatValue(domain[1])}</span>
        </div>
      )}
      <div
        ref={track}
        className="gr-track"
        role="group"
        aria-label="Dataset scrollbar navigation"
        tabIndex={-1}
        onPointerDown={(event) => {
          if (event.button !== 0 || !total) return;
          event.preventDefault();
          setHelpOpen(false);
          // Focusing an off-screen handle must not scroll the page under the pointer.
          event.currentTarget
            .querySelector<HTMLElement>('[role=slider]')
            ?.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          const target = atPointer(event.clientY, !event.shiftKey && !selecting);
          if (selecting) {
            rangeDrag.current = { anchor: target.index, previous: selection };
            setSelection({ start: target.index, end: target.index + 1 });
            setDragging(true);
            return;
          }
          engine.beginScrub();
          drag.current = beginScrub(event.clientX, event.clientY, geometry(), {
            current: snapshot.position,
            progress: snapshot.progress,
            peaks,
            free: event.shiftKey,
          });
          setDragging(true);
          setPrecision(FULL_SPEED);
          setHover(target);
        }}
        onPointerMove={(event) => {
          const target = atPointer(event.clientY);
          if (rangeDrag.current) {
            setSelection({
              start: Math.min(target.index, rangeDrag.current.anchor),
              end: Math.max(target.index, rangeDrag.current.anchor) + 1,
            });
            return;
          }
          if (!drag.current) {
            setHover(atPointer(event.clientY, !event.shiftKey && !selecting));
            return;
          }
          const snapToMarkers = showMarkers && options.snapToMarkers !== false;
          const move = moveScrub(drag.current, event.clientX, event.clientY, geometry(), {
            precision: precisionDrag,
            markers: snapToMarkers ? grid.markers : [],
            snapToMarkers,
            peaks,
            free: event.shiftKey,
          });
          setPrecision(move.precision);
          engine.scrub(move.position);
          setHover({ index: Math.round(move.position), y: target.y, peak: move.peak });
        }}
        onPointerUp={(event) => {
          finish();
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => finish(true)}
        onLostPointerCapture={() => {
          if (drag.current || rangeDrag.current) finish(true);
        }}
        onPointerLeave={() => {
          if (!drag.current) setHover(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            finish(true);
            setHover(null);
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            engine.pan(event.key === 'ArrowDown' ? snapshot.rowHeight : -snapshot.rowHeight);
          }
          if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            engine.goTo(event.key === 'Home' ? 0 : Math.max(0, total - 1));
          }
        }}
      >
        <div className="gr-map-plot">
          <canvas
            ref={canvas}
            className="gr-overview-canvas"
            aria-hidden="true"
            data-testid="overview"
          />
          {showProfile && accuracy === 'unavailable' && (
            <span className="gr-map-unavailable">No profile</span>
          )}
        </div>
        {ticks.map((tick) => (
          <div
            key={tick.index}
            className="gr-map-tick"
            style={{
              top: `clamp(0px, calc(${rowToProgress(tick.index, total) * 100}% - 8px), calc(100% - 16px))`,
            }}
            title={`Row ${(tick.index + 1).toLocaleString()}`}
          >
            <span>{tick.label}</span>
          </div>
        ))}
        {showMarkers && (
          <MarkerLayer
            markers={markers}
            total={total}
            height={trackHeight}
            controller={engine}
            labels={options.markerLabels}
          />
        )}
        {options.showVisibleRange !== false && (
          <span
            className="gr-visible-range"
            aria-hidden="true"
            style={spanStyle(visibleStart, visibleEnd)}
          />
        )}
        {selection && (
          <span
            className="gr-map-selection"
            aria-hidden="true"
            style={spanStyle(selection.start, selection.end)}
          />
        )}
        {options.showTrail !== false &&
          snapshot.trail.map((position, i) => (
            <span
              key={i}
              className="gr-trail"
              style={{ top: `${rowToProgress(position, total) * 100}%` }}
            />
          ))}
        <span className="gr-scrollbar-track" aria-hidden="true" />
        <span
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-orientation="vertical"
          aria-describedby={helpId}
          title="Current row — drag here to scroll"
          aria-valuemin={total ? 1 : 0}
          aria-valuemax={total}
          aria-valuenow={total ? (snapshot.activeIndex ?? 0) + 1 : 0}
          aria-valuetext={`Row ${total ? (snapshot.activeIndex ?? 0) + 1 : 0} of ${total}${currentChapter ? `, ${currentChapter.label}` : ''}`}
          className="gr-thumb"
          style={{ top: `clamp(0px, calc(${snapshot.progress * 100}% - 12px), calc(100% - 24px))` }}
        >
          <span className="gr-thumb-direction" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 12V2M3 6l4-4 4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>
        <span className="gr-track-line" style={{ top: `${snapshot.progress * 100}%` }} />
        {hover && !dragging && !selecting && (
          <span
            className="gr-map-hover"
            aria-hidden="true"
            data-attracted={hover.peak !== undefined}
            style={{ top: `${rowToProgress(hover.index, total) * 100}%` }}
          />
        )}
      </div>
      <span className="gr-rail-end">{formatCompact(total)} rows</span>
      {options.showLegend !== false && (showProfile || showMarkers) && (
        <div className="gr-map-legend">
          {showProfile && (
            <span>
              <i className="gr-map-mean-key" />
              {profileLabel}
              {showRange ? ' + min–max' : ''} · {accuracy}
            </span>
          )}
          <span>
            <i className="gr-map-position-key" /> Current row
          </span>
          {showMarkers && (
            <span>◆ Markers{hasBookmarks ? ' · ★ Bookmarks' : ''} · click to jump</span>
          )}
        </div>
      )}
      {hover && previewVisible && (
        <div
          ref={previewElement}
          className="gr-preview"
          style={{ top: clamp(hover.y + 28, 8, Math.max(8, snapshot.height - previewHeight - 8)) }}
          role="note"
        >
          {/* Metric first, then the jump target; scale and provenance live in map help. */}
          {showProfile ? (
            <div className="gr-map-bucket-summary">
              <div className="gr-preview-kicker">
                <strong>{metricLabel}</strong>
                <span>{chapterAt(session.chapters, hover.index)?.label ?? ''}</span>
              </div>
              <div className="gr-map-reading-value">
                {hoverValue === null ? '—' : formatValue(hoverValue)}
                <span>
                  {hoverValue === null
                    ? 'Unavailable'
                    : `${hoverBucket?.accuracy === 'estimated' ? 'Estimated' : 'Exact'} ${profileLabel.toLowerCase()}`}
                </span>
              </div>
              {showRange && hoverBucket && hoverBucket.accuracy !== 'unavailable' && (
                <span>
                  Min–max {hoverBucket.min === null ? '—' : formatValue(hoverBucket.min)}–
                  {hoverBucket.max === null ? '—' : formatValue(hoverBucket.max)}
                </span>
              )}
            </div>
          ) : (
            <div className="gr-preview-kicker">
              {dragging ? 'Moving to row' : 'Jump to row'}{' '}
              <span>{chapterAt(session.chapters, hover.index)?.label ?? ''}</span>
            </div>
          )}
          <div className="gr-preview-detail">
            <span>
              {showProfile && 'Row '}
              <strong className="gr-preview-target">{(hover.index + 1).toLocaleString()}</strong>
            </span>
            {hover.peak !== undefined ? (
              <small>Snapped to peak</small>
            ) : (
              dragging && (
                <small>
                  {precisionDrag && precision === FULL_SPEED
                    ? 'Move left for precision'
                    : precision}
                </small>
              )
            )}
          </div>
          {showMagnifier && (
            <div className="gr-magnifier">
              <canvas ref={magnifier} aria-label={`${metricLabel} near this row`} />
              <span>
                <strong>{metricLabel}</strong>
                <br />
                {profileLabel} near this row
              </span>
            </div>
          )}
          {showPreviewRows && !dragging && previewIndex !== null && (
            <div className="gr-preview-rows">
              {Array.from({ length: Math.min(previewRows, total - previewIndex) }, (_, offset) => {
                const index = previewIndex + offset,
                  row = session.read(index);
                return (
                  <div key={index} className="gr-preview-row">
                    {row !== undefined ? (
                      (renderPreviewRow?.(row, index) ?? <span>{previewText(row)}</span>)
                    ) : (
                      <span>{session.error(index) ? 'Preview unavailable' : 'Fetching rows…'}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

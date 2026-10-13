import {
  useEffect,
  useMemo,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { clamp, progressToRow, rowToProgress } from '../core/mappings.js';
import {
  atlasDomain,
  atlasTicks,
  drawAtlas,
  observeCanvas,
  overviewAccuracy,
  profileValue,
} from '../visuals/atlas.js';
import { formatCompact, formatDecimal } from '../visuals/format.js';
import { OverviewTracks } from './OverviewTracks.js';
import { MarkerLayer } from './MarkerLayer.js';
import type { RowRange } from '../data/types.js';
import type { DeepScrollState } from './useDeepScroll.js';
export interface AtlasRailOptions {
  /** Map configuration does not change the current row or provider. */
  variant?: 'profile' | 'markers';
  layout?: 'auto' | 'expanded' | 'compact';
  axis?: 'chapters' | 'rows';
  axisLabel?: string;
  title?: string;
  showRange?: boolean;
  showTracks?: boolean;
  /** Maximum axis labels, limited to 2–12 and available height. Default 5. */
  maxAxisTicks?: number;
  /** These layers are visible by default. Feature flags still take precedence. */
  showMarkers?: boolean;
  showVisibleRange?: boolean;
  showTrail?: boolean;
  showLegend?: boolean;
  markerLabels?: 'label' | 'number' | 'none';
  /** Hover details. Summary mode does not request preview rows. Default rows. */
  preview?: 'rows' | 'summary' | 'none';
  /** Exact rows requested on hover, limited to 1–5. Default 3. */
  previewRows?: number;
  showMagnifier?: boolean;
  /** Snap slow drags to visible provider events. Default true. */
  snapToMarkers?: boolean;
  formatValue?(value: number): string;
}
export interface AtlasRailProps<Row> {
  scroll: DeepScrollState<Row>;
  options?: AtlasRailOptions;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  /** Host controls displayed beside the map title and help button. */
  headerActions?: ReactNode;
  renderPreviewRow?(row: Row, index: number): ReactNode;
}
export function AtlasRail<Row>({
  scroll,
  ariaLabel = 'Dataset position',
  renderPreviewRow,
  className,
  style,
  headerActions,
  options = {},
}: AtlasRailProps<Row>) {
  const helpId = useId();
  const rangeDrag = useRef<{ anchor: number; previous: RowRange | null } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [trackHeight, setTrackHeight] = useState(400);
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const magnifier = useRef<HTMLCanvasElement>(null);
  const previewElement = useRef<HTMLDivElement>(null);
  const [previewHeight, setPreviewHeight] = useState(180);
  const [hover, setHover] = useState<{ index: number; y: number } | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [precision, setPrecision] = useState('Full speed');
  const drag = useRef<{
    x: number;
    y: number;
    origin: number;
    position: number;
    moved: boolean;
    snapped?: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
  const { session, snapshot, features } = scroll;
  useEffect(() => {
    const controller = scroll.controller;
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
  }, [scroll.controller]);
  const total = snapshot.rowCount;
  const markers = useMemo(
    () => [...session.markers, ...scroll.searchMarkers],
    [session.markers, scroll.searchMarkers],
  );
  const visibleStart = Math.max(0, scroll.mapping.toRow(0));
  const visibleEnd = Math.min(total, scroll.mapping.toRow(snapshot.height));
  const chapterAt = (index: number) =>
    session.chapters.find((chapter) => index >= chapter.start && index < chapter.end);
  // The rail re-renders on every position change; derive metadata only when it changes.
  const metricDomain = scroll.provider.metric?.domain;
  const metricKind = scroll.provider.metric?.kind;
  const domain = useMemo(
    () => atlasDomain(session.overview, metricDomain, metricKind),
    [session.overview, metricDomain, metricKind],
  );
  const kind = scroll.provider.metric?.kind ?? 'value';
  const showProfile = options.variant !== 'markers' && features.overview;
  const showMarkers = options.showMarkers !== false && features.markers;
  const preview = options.preview ?? 'rows';
  const showPreviewRows = preview === 'rows' && features.preview;
  const showMagnifier =
    preview !== 'none' && options.showMagnifier !== false && features.magnifier && showProfile;
  const previewVisible =
    !!hover && !helpOpen && (dragging || preview === 'summary' || showPreviewRows || showMagnifier);
  const previewRows = Number.isFinite(options.previewRows)
    ? clamp(Math.floor(options.previewRows!), 1, 5)
    : 3;
  const maxAxisTicks = Number.isFinite(options.maxAxisTicks)
    ? clamp(Math.floor(options.maxAxisTicks!), 2, 12)
    : 5;
  const showRange = !!options.showRange && kind === 'value';
  const axis = options.axis ?? 'chapters';
  const tickLimit = Math.min(maxAxisTicks, Math.max(2, Math.floor(trackHeight / 70)));
  const tickChapters = features.chapters ? session.chapters : null;
  const ticks = useMemo(
    () => atlasTicks(total, tickChapters ?? [], axis, tickLimit),
    [total, tickChapters, axis, tickLimit],
  );
  const hasChapterAxis = axis === 'chapters' && features.chapters && session.chapters.length > 0;
  const axisLabel =
    axis === 'chapters' && !hasChapterAxis
      ? 'Row'
      : (options.axisLabel ?? (hasChapterAxis ? 'Position' : 'Row'));
  const formatValue =
    options.formatValue ??
    ((value: number) => formatDecimal(value, 1));
  const profileLabel = kind === 'density' ? 'Density' : 'Average';
  const overviewSupported = !!scroll.provider.fetchOverview;
  const overviewFailed = !!session.metadataErrors.overview;
  const accuracy = useMemo(
    () =>
      overviewAccuracy(session.overview, kind, {
        supported: overviewSupported,
        failed: overviewFailed,
      }),
    [session.overview, kind, overviewSupported, overviewFailed],
  );
  const hoverBucket = hover
    ? session.overview.find((b) => hover.index >= b.start && hover.index < b.end)
    : undefined;
  const hoverValue = hoverBucket ? profileValue(hoverBucket, kind) : null;
  useEffect(() => {
    if (!track.current) return;
    const observer = new ResizeObserver(() => setTrackHeight(track.current?.clientHeight ?? 400));
    observer.observe(track.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!canvas.current) return;
    const draw = () =>
      drawAtlas(
        canvas.current!,
        showProfile ? session.overview : [],
        total,
        domain,
        kind,
        showRange,
      );
    draw();
    return observeCanvas(canvas.current, draw);
  }, [
    session.overview,
    total,
    showProfile,
    showRange,
    domain[0],
    domain[1],
    scroll.provider.metric?.kind,
  ]);
  useEffect(() => {
    setPreviewIndex(null);
    if (!hover || !showPreviewRows || dragging) return;
    const timer = setTimeout(() => setPreviewIndex(hover.index), 150);
    return () => clearTimeout(timer);
  }, [hover?.index, showPreviewRows, dragging]);
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
    const element = previewElement.current;
    if (!element) return;
    const resize = new ResizeObserver(() => setPreviewHeight(element.offsetHeight));
    resize.observe(element);
    return () => resize.disconnect();
  }, [previewVisible]);
  useEffect(() => {
    if (!magnifier.current || !hover) return;
    const range = Math.max(1, total * 0.045),
      start = Math.max(0, hover.index - range / 2),
      end = Math.min(total, start + range);
    const buckets = session.overview
      .filter((b) => b.end > start && b.start < end)
      .map((b) => ({
        ...b,
        start: Math.max(start, b.start) - start,
        end: Math.min(end, b.end) - start,
      }));
    drawAtlas(magnifier.current, buckets, end - start, domain, kind, showRange);
  }, [hover, session.overview, showMagnifier, helpOpen, showRange, domain[0], domain[1], kind]);
  const atPointer = (clientY: number) => {
    const rect = track.current!.getBoundingClientRect();
    return {
      index: Math.round(progressToRow((clientY - rect.top) / rect.height, total)),
      y: clamp(clientY - rect.top, 0, rect.height),
    };
  };
  const finish = (cancel = false) => {
    if (rangeDrag.current) {
      if (cancel) scroll.setSelection(rangeDrag.current.previous);
      rangeDrag.current = null;
      scroll.setSelectionMode(false);
      setDragging(false);
      return;
    }
    if (drag.current) {
      const state = drag.current;
      if (!state.moved && !cancel) {
        scroll.controller.endScrub(true);
        scroll.controller.goTo(Math.round(state.position));
      } else scroll.controller.endScrub(cancel);
    }
    drag.current = null;
    setDragging(false);
  };
  return (
    <aside
      className={`ds-rail ${className ?? ''}`}
      style={style}
      data-ds-part="rail"
      data-layout={options.layout ?? 'auto'}
      data-variant={showProfile ? 'profile' : 'markers'}
      data-has-tracks={(options.showTracks && session.tracks.length > 0) || undefined}
      data-marker-labels={options.markerLabels ?? 'label'}
      data-show-markers={showMarkers}
      data-scrolling={scrollDirection ?? undefined}
      data-scroll-motion={!scroll.reduceMotion && features.transitions ? 'on' : 'off'}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setHelpOpen(false);
      }}
    >
      <div className="ds-rail-title">
        <strong>
          <span className="ds-map-title">{options.title ?? 'Dataset map'}</span>
          <span className="ds-map-title-compact">Map</span>
        </strong>
        <div className="ds-rail-actions">
          <button
            type="button"
            className="ds-button ds-map-help-button"
            aria-label="About dataset map"
            aria-expanded={helpOpen}
            aria-controls={helpId}
            onClick={() => setHelpOpen(!helpOpen)}
          >
            ?
          </button>
          {headerActions}
        </div>
      </div>
      <div id={helpId} className="ds-map-help" hidden={!helpOpen} role="note" tabIndex={0}>
        <strong>How to read this map</strong>
        <p>
          Top to bottom follows row order, from the first row to the last. Click or drag to move.
        </p>
        {showProfile && (
          <p>
            Each horizontal strip summarizes a group of rows. The profile extends toward larger{' '}
            {kind === 'density' ? 'density' : 'average values'} on the horizontal scale.
            {showRange ? ' The faint band shows the minimum to maximum.' : ''}
          </p>
        )}
        <p>
          The position line marks your current row.
          {options.showVisibleRange !== false &&
            ' Shading shows the visible range; very small ranges appear as a thin line.'}
          {showMarkers && ' Diamonds mark events; numbered groups open a searchable event list.'}
        </p>
        {showProfile && (
          <p>
            {accuracy[0].toUpperCase() + accuracy.slice(1)} overview
            {session.overview.length > 0
              ? ` · ${session.overview.length} groups · about ${Math.round(total / session.overview.length).toLocaleString()} rows per group`
              : ''}
            . {accuracy === 'sampled' ? 'Summaries use samples, not every row.' : ''}
          </p>
        )}
      </div>
      {scroll.selectionMode && (
        <p className="ds-selection-hint" role="status">
          Drag on the map to select a range. Escape cancels.
        </p>
      )}
      <div className="ds-map-axis-heading">
        <span>{axisLabel} ↓</span>
        <span>
          {showProfile
            ? `${scroll.provider.metric?.label ?? 'Value'} →`
            : showMarkers
              ? 'Events'
              : ''}
        </span>
      </div>
      {showProfile && (
        <div
          className="ds-map-value-axis"
          aria-label={`${scroll.provider.metric?.label ?? 'Value'} scale: ${formatValue(domain[0])} to ${formatValue(domain[1])} ${scroll.provider.metric?.unit ?? ''}`}
        >
          <span>{formatValue(domain[0])}</span>
          <span>
            {formatValue(domain[1])}
            {scroll.provider.metric?.unit ? ` ${scroll.provider.metric.unit}` : ''}
          </span>
        </div>
      )}
      <div
        ref={track}
        className="ds-track"
        role="group"
        aria-label="Dataset map navigation"
        tabIndex={-1}
        onPointerDown={(event) => {
          if (event.button !== 0 || !total) return;
          event.preventDefault();
          setHelpOpen(false);
          event.currentTarget.querySelector<HTMLElement>('[role=slider]')?.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          const target = atPointer(event.clientY),
            rect = track.current!.getBoundingClientRect();
          const nearThumb = Math.abs(target.y - snapshot.progress * rect.height) <= 14;
          if (scroll.selectionMode) {
            rangeDrag.current = { anchor: target.index, previous: scroll.selection };
            scroll.setSelection({ start: target.index, end: target.index + 1 });
            setDragging(true);
            return;
          }
          scroll.controller.beginScrub();
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            origin: snapshot.position,
            position: nearThumb ? snapshot.position : target.index,
            moved: false,
          };
          setDragging(true);
          setPrecision('Full speed');
          setHover(target);
        }}
        onPointerMove={(event) => {
          const target = atPointer(event.clientY);
          if (rangeDrag.current) {
            scroll.setSelection({
              start: Math.min(target.index, rangeDrag.current.anchor),
              end: Math.max(target.index, rangeDrag.current.anchor) + 1,
            });
            return;
          }
          if (!drag.current) {
            setHover(target);
            return;
          }
          const state = drag.current,
            rect = track.current!.getBoundingClientRect();
          const away = features.precision ? Math.abs(event.clientX - state.x) : 0;
          const rate = away > 208 ? 0.05 : away > 112 ? 0.25 : away > 48 ? 0.5 : 1;
          setPrecision(
            rate === 1
              ? 'Full speed'
              : rate === 0.5
                ? '½ speed'
                : rate === 0.25
                  ? '¼ speed'
                  : 'Fine · 1/20 speed',
          );
          const delta = event.clientY - state.y;
          state.position = clamp(
            state.position + (delta / rect.height) * Math.max(0, total - 1) * rate,
            0,
            Math.max(0, total - 1),
          );
          state.y = event.clientY;
          state.moved ||= Math.abs(delta) > 0;
          let position = state.position;
          if (
            delta !== 0 &&
            features.magnetism &&
            showMarkers &&
            options.snapToMarkers !== false &&
            !event.shiftKey &&
            Math.abs(delta) < 40
          ) {
            const nearby = session.markers
              .filter(
                (marker) =>
                  (Math.abs(marker.index - position) / Math.max(1, total - 1)) * rect.height <
                  (state.snapped === marker.index ? 10 : 6),
              )
              .sort((a, b) => Math.abs(a.index - position) - Math.abs(b.index - position))[0];
            state.snapped = nearby?.index;
            if (nearby) position = nearby.index;
          }
          scroll.controller.scrub(position);
          setHover({ index: Math.round(position), y: target.y });
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
            scroll.controller.pan(
              event.key === 'ArrowDown' ? snapshot.rowHeight : -snapshot.rowHeight,
            );
          }
          if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            scroll.controller.goTo(event.key === 'Home' ? 0 : Math.max(0, total - 1));
          }
        }}
      >
        {options.showTracks && session.tracks.length > 0 && (
          <OverviewTracks tracks={session.tracks} total={total} />
        )}
        <div className="ds-map-plot">
          <canvas
            ref={canvas}
            className="ds-overview-canvas"
            aria-hidden="true"
            data-testid="overview"
          />
          {showProfile && accuracy === 'unavailable' && (
            <span className="ds-map-unavailable">No profile</span>
          )}
        </div>
        {ticks.map((tick) => (
          <div
            key={tick.index}
            className="ds-map-tick"
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
            controller={scroll.controller}
            labels={options.markerLabels}
          />
        )}
        {options.showVisibleRange !== false && (
          <span
            className="ds-visible-range"
            aria-hidden="true"
            style={{
              top: `${(visibleStart / Math.max(1, total)) * 100}%`,
              height: `${(Math.max(0, visibleEnd - visibleStart) / Math.max(1, total)) * 100}%`,
            }}
          />
        )}
        {scroll.selection && (
          <span
            className="ds-map-selection"
            aria-hidden="true"
            style={{
              top: `${(scroll.selection.start / Math.max(1, total)) * 100}%`,
              height: `${((scroll.selection.end - scroll.selection.start) / Math.max(1, total)) * 100}%`,
            }}
          />
        )}
        {features.trail &&
          options.showTrail !== false &&
          snapshot.trail.map((position, i) => (
            <span
              key={i}
              className="ds-trail"
              style={{ top: `${rowToProgress(position, total) * 100}%` }}
            />
          ))}
        <span
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-orientation="vertical"
          aria-describedby={helpId}
          title="Current row — drag to navigate"
          aria-valuemin={total ? 1 : 0}
          aria-valuemax={total}
          aria-valuenow={total ? (snapshot.activeIndex ?? 0) + 1 : 0}
          aria-valuetext={`Row ${total ? (snapshot.activeIndex ?? 0) + 1 : 0} of ${total}${chapterAt(snapshot.position) ? `, ${chapterAt(snapshot.position)!.label}` : ''}`}
          className="ds-thumb"
          style={{ top: `clamp(0px, calc(${snapshot.progress * 100}% - 12px), calc(100% - 24px))` }}
        >
          <span className="ds-thumb-direction" aria-hidden="true">
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
        <span className="ds-track-line" style={{ top: `${snapshot.progress * 100}%` }} />
      </div>
      <span className="ds-rail-end">
        {formatCompact(total)} rows
      </span>
      {options.showLegend !== false && (showProfile || showMarkers) && (
        <div className="ds-map-legend">
          {showProfile && (
            <span>
              <i className="ds-map-mean-key" />
              {profileLabel}
              {showRange ? ' + min–max' : ''} · {accuracy}
            </span>
          )}
          {showMarkers && <span>◆ Events · click to jump</span>}
        </div>
      )}
      {hover && previewVisible && (
        <div
          ref={previewElement}
          className="ds-preview"
          style={{ top: clamp(hover.y + 28, 8, Math.max(8, snapshot.height - previewHeight - 8)) }}
          role="note"
        >
          <div className="ds-preview-kicker">
            {dragging ? 'Moving to row' : 'At this row'}{' '}
            <span>{chapterAt(hover.index)?.label ?? ''}</span>
          </div>
          <strong>{(hover.index + 1).toLocaleString()}</strong>
          <div className="ds-preview-detail">
            {dragging ? precision : 'Row address'}
            {dragging && features.precision && <small>Move left for precision</small>}
          </div>
          {showProfile && hoverBucket && (
            <div className="ds-map-bucket-summary">
              <span>
                {hoverBucket.accuracy === 'estimated'
                  ? 'Sampled group'
                  : hoverBucket.accuracy === 'exact'
                    ? 'Exact group'
                    : 'Unavailable group'}{' '}
                · rows {(hoverBucket.start + 1).toLocaleString()}–{hoverBucket.end.toLocaleString()}
              </span>
              <strong>
                {profileLabel}:{' '}
                {hoverValue === null
                  ? 'Unavailable'
                  : `${formatValue(hoverValue)} ${scroll.provider.metric?.unit ?? ''}`}
              </strong>
              {showRange && hoverBucket.accuracy !== 'unavailable' && (
                <span>
                  Min–max: {hoverBucket.min === null ? '—' : formatValue(hoverBucket.min)}–
                  {hoverBucket.max === null ? '—' : formatValue(hoverBucket.max)}
                </span>
              )}
            </div>
          )}
          {showMagnifier && (
            <div className="ds-magnifier">
              <canvas ref={magnifier} aria-label="Magnified overview region" />
              <span>Local overview · coarse</span>
            </div>
          )}
          {showPreviewRows &&
            !dragging &&
            previewIndex !== null &&
            Array.from({ length: Math.min(previewRows, total - previewIndex) }, (_, offset) => {
              const index = previewIndex + offset,
                row = session.read(index);
              return (
                <div key={index} className="ds-preview-row">
                  <span>#{(index + 1).toLocaleString()}</span>
                  {row !== undefined ? (
                    (renderPreviewRow?.(row, index) ?? (
                      <span>
                        {typeof row === 'object' && row !== null
                          ? Object.values(row)
                              .filter(
                                (value) => typeof value === 'string' || typeof value === 'number',
                              )
                              .slice(0, 3)
                              .join(' · ')
                          : String(row)}
                      </span>
                    ))
                  ) : (
                    <span>{session.error(index) ? 'Preview unavailable' : 'Fetching rows…'}</span>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </aside>
  );
}

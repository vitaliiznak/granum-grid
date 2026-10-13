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
import { atlasDomain, atlasTicks, drawAtlas, profileValue } from '../visuals/atlas.js';
import { OverviewTracks } from './OverviewTracks.js';
import { MarkerLayer } from './MarkerLayer.js';
import type { RowRange } from '../data/types.js';
import type { DeepScrollState } from './useDeepScroll.js';
export interface AtlasRailOptions {
  /** Presentation only; the navigation and provider stay the same. */
  variant?: 'profile' | 'markers';
  layout?: 'auto' | 'expanded' | 'compact';
  axis?: 'chapters' | 'rows';
  axisLabel?: string;
  title?: string;
  showRange?: boolean;
  showTracks?: boolean;
  markerLabels?: 'label' | 'number' | 'none';
  formatValue?(value: number): string;
}
export interface AtlasRailProps<Row> {
  scroll: DeepScrollState<Row>;
  options?: AtlasRailOptions;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  renderPreviewRow?(row: Row, index: number): ReactNode;
}
export function AtlasRail<Row>({
  scroll,
  ariaLabel = 'Dataset position',
  renderPreviewRow,
  className,
  style,
  options = {},
}: AtlasRailProps<Row>) {
  const helpId = useId();
  const rangeDrag = useRef<{ anchor: number; previous: RowRange | null } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [trackHeight, setTrackHeight] = useState(400);
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const magnifier = useRef<HTMLCanvasElement>(null);
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
  const { session, snapshot, features } = scroll;
  const total = snapshot.rowCount;
  const markers = useMemo(
    () => [...session.markers, ...scroll.searchMarkers],
    [session.markers, scroll.searchMarkers],
  );
  const visibleStart = Math.max(0, scroll.mapping.toRow(0));
  const visibleEnd = Math.min(total, scroll.mapping.toRow(snapshot.height));
  const chapterAt = (index: number) =>
    session.chapters.find((chapter) => index >= chapter.start && index < chapter.end);
  const domain = atlasDomain(
    session.overview,
    scroll.provider.metric?.domain,
    scroll.provider.metric?.kind,
  );
  const kind = scroll.provider.metric?.kind ?? 'value';
  const showProfile = options.variant !== 'markers' && features.overview;
  const showRange = !!options.showRange && kind === 'value';
  const axis = options.axis ?? 'chapters';
  const ticks = atlasTicks(
    total,
    features.chapters ? session.chapters : [],
    axis,
    Math.min(5, Math.max(2, Math.floor(trackHeight / 70))),
  );
  const hasChapterAxis = axis === 'chapters' && features.chapters && session.chapters.length > 0;
  const axisLabel =
    axis === 'chapters' && !hasChapterAxis
      ? 'Row'
      : (options.axisLabel ?? (hasChapterAxis ? 'Position' : 'Row'));
  const formatValue =
    options.formatValue ??
    ((value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 }));
  const profileLabel = kind === 'density' ? 'Density' : 'Average';
  const accuracy =
    !scroll.provider.fetchOverview ||
    session.metadataErrors.overview ||
    (session.overview.length && session.overview.every((b) => profileValue(b, kind) === null))
      ? 'Unavailable'
      : !session.overview.length
        ? 'Loading'
        : session.overview.some((b) => b.accuracy === 'estimated')
          ? 'Sampled'
          : 'Exact';
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
    const resize = new ResizeObserver(draw);
    resize.observe(canvas.current);
    const theme = new MutationObserver(draw);
    theme.observe(canvas.current.closest('.ds-root') ?? canvas.current, { attributes: true });
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', draw);
    return () => {
      resize.disconnect();
      theme.disconnect();
      media.removeEventListener('change', draw);
    };
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
    if (!hover || !features.preview || dragging) return;
    const timer = setTimeout(() => setPreviewIndex(hover.index), 150);
    return () => clearTimeout(timer);
  }, [hover?.index, features.preview, dragging]);
  useEffect(() => {
    if (!hover || !features.preview) setPreviewIndex(null);
  }, [!!hover, features.preview]);
  useEffect(() => {
    session.setRange('preview', previewIndex ?? 0, previewIndex === null ? 0 : 3);
    return () => session.setRange('preview', 0, 0);
  }, [session, previewIndex]);
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
  }, [hover, session.overview, features.magnifier, showRange, domain[0], domain[1], kind]);
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
      onKeyDown={(event) => {
        if (event.key === 'Escape') setHelpOpen(false);
      }}
    >
      <div className="ds-rail-title">
        <strong>
          <span className="ds-map-title">{options.title ?? 'Dataset map'}</span>
          <span className="ds-map-title-compact">Map</span>
        </strong>
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
          The blue line is your current row. Shading shows the visible range; very small ranges
          appear as a thin line. Diamonds mark events; numbered groups open a searchable event list.
        </p>
        {showProfile && (
          <p>
            {accuracy} overview
            {session.overview.length > 0
              ? ` · ${session.overview.length} groups · about ${Math.round(total / session.overview.length).toLocaleString()} rows per group`
              : ''}
            . {accuracy === 'Sampled' ? 'Summaries use samples, not every row.' : ''}
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
        <span>{showProfile ? `${scroll.provider.metric?.label ?? 'Value'} →` : 'Events'}</span>
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
            features.markers &&
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
          {showProfile && accuracy === 'Unavailable' && (
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
        {features.markers && (
          <MarkerLayer
            markers={markers}
            total={total}
            height={trackHeight}
            controller={scroll.controller}
            labels={options.markerLabels}
          />
        )}
        <span
          className="ds-visible-range"
          aria-hidden="true"
          style={{
            top: `${(visibleStart / Math.max(1, total)) * 100}%`,
            height: `${(Math.max(0, visibleEnd - visibleStart) / Math.max(1, total)) * 100}%`,
          }}
        />
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
        />
        <span className="ds-track-line" style={{ top: `${snapshot.progress * 100}%` }} />
      </div>
      <div className="ds-map-position">
        <span>
          <i />
          You are here
        </span>
        <strong>{(snapshot.progress * 100).toFixed(2)}%</strong>
      </div>
      <span className="ds-rail-end">
        {Intl.NumberFormat('en', { notation: 'compact' }).format(total)} rows
      </span>
      <div className="ds-map-legend">
        {showProfile && (
          <span>
            <i className="ds-map-mean-key" />
            {profileLabel}
            {showRange ? ' + min–max' : ''} · {accuracy.toLowerCase()}
          </span>
        )}
        {features.markers && <span>◆ Events · click to jump</span>}
      </div>
      {hover && !helpOpen && (dragging || features.preview || features.magnifier) && (
        <div
          className="ds-preview"
          style={{ top: clamp(hover.y + 28, 30, Math.max(30, snapshot.height - 180)) }}
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
          {features.magnifier && showProfile && (
            <div className="ds-magnifier">
              <canvas ref={magnifier} aria-label="Magnified overview region" />
              <span>Local overview · coarse</span>
            </div>
          )}
          {features.preview &&
            !dragging &&
            previewIndex !== null &&
            Array.from({ length: Math.min(3, total - previewIndex) }, (_, offset) => {
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

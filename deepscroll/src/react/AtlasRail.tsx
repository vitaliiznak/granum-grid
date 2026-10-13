import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clamp, progressToRow, rowToProgress } from '../core/mappings.js';
import { drawAtlas } from '../visuals/atlas.js';
import type { DeepScrollState } from './useDeepScroll.js';
export function AtlasRail<Row>({
  scroll,
  ariaLabel = 'Dataset position',
  renderPreviewRow,
}: {
  scroll: DeepScrollState<Row>;
  ariaLabel?: string;
  renderPreviewRow?(row: Row, index: number): ReactNode;
}) {
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
  const chapterAt = (index: number) =>
    session.chapters.find((chapter) => index >= chapter.start && index < chapter.end);
  const domain: readonly [number, number] =
    scroll.provider.metric?.domain ??
    (scroll.provider.metric?.kind === 'density'
      ? [0, 1]
      : [
          Math.min(0, ...session.overview.map((b) => b.min ?? 0)),
          Math.max(1, ...session.overview.map((b) => b.max ?? 1)),
        ]);
  useEffect(() => {
    if (!canvas.current) return;
    const draw = () =>
      drawAtlas(
        canvas.current!,
        features.overview ? session.overview : [],
        total,
        domain,
        scroll.provider.metric?.kind,
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
    features.overview,
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
    drawAtlas(magnifier.current, buckets, end - start, domain, scroll.provider.metric?.kind);
  }, [hover, session.overview, features.magnifier]);
  const atPointer = (clientY: number) => {
    const rect = track.current!.getBoundingClientRect();
    return {
      index: Math.round(progressToRow((clientY - rect.top) / rect.height, total)),
      y: clamp(clientY - rect.top, 0, rect.height),
    };
  };
  const finish = (cancel = false) => {
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
    <aside className="ds-rail">
      <div className="ds-rail-title">
        ATLAS <span>↕</span>
      </div>
      <div
        ref={track}
        className="ds-track"
        role="group"
        aria-label="Atlas timeline"
        tabIndex={-1}
        onPointerDown={(event) => {
          if (event.button !== 0 || !total) return;
          event.preventDefault();
          event.currentTarget.querySelector<HTMLElement>('[role=slider]')?.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          const target = atPointer(event.clientY),
            rect = track.current!.getBoundingClientRect();
          const nearThumb = Math.abs(target.y - snapshot.progress * rect.height) <= 14;
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
          if (drag.current) finish(true);
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
        <canvas
          ref={canvas}
          className="ds-overview-canvas"
          aria-hidden="true"
          data-testid="overview"
        />
        {features.chapters &&
          session.chapters.map((chapter, i) => (
            <div
              key={chapter.id}
              title={chapter.label}
              className="ds-chapter"
              style={{ top: `${rowToProgress(chapter.start, total) * 100}%` }}
            >
              {i % 5 === 0 && <span>{chapter.label}</span>}
            </div>
          ))}
        {features.markers &&
          [...session.markers, ...scroll.searchMarkers].map((marker, index) => (
            <button
              key={marker.id}
              className="ds-marker"
              aria-label={marker.label}
              title={`${marker.label} · Row ${(marker.index + 1).toLocaleString()}`}
              style={{ top: `${rowToProgress(marker.index, total) * 100}%`, color: marker.color }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                scroll.controller.goTo(marker.index, { reason: 'marker' });
              }}
              onFocus={() =>
                setHover({
                  index: marker.index,
                  y: rowToProgress(marker.index, total) * (track.current?.clientHeight ?? 400),
                })
              }
              onBlur={() => setHover(null)}
            >
              ◆<span>{index + 1}</span>
            </button>
          ))}
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
          aria-valuemin={total ? 1 : 0}
          aria-valuemax={total}
          aria-valuenow={total ? (snapshot.activeIndex ?? 0) + 1 : 0}
          aria-valuetext={`Row ${total ? (snapshot.activeIndex ?? 0) + 1 : 0} of ${total}${chapterAt(snapshot.position) ? `, ${chapterAt(snapshot.position)!.label}` : ''}`}
          className="ds-thumb"
          style={{ top: `clamp(0px, calc(${snapshot.progress * 100}% - 12px), calc(100% - 24px))` }}
        />
        <span className="ds-track-line" style={{ top: `${snapshot.progress * 100}%` }} />
      </div>
      <span className="ds-rail-end">
        {Intl.NumberFormat('en', { notation: 'compact' }).format(total)} rows
      </span>
      {hover && (dragging || features.preview || features.magnifier) && (
        <div
          className="ds-preview"
          style={{ top: clamp(hover.y + 28, 30, Math.max(30, snapshot.height - 180)) }}
          role="note"
        >
          <div className="ds-preview-kicker">
            {dragging ? 'SCRUBBING' : 'AT THIS POSITION'}{' '}
            <span>{chapterAt(hover.index)?.label ?? ''}</span>
          </div>
          <strong>{(hover.index + 1).toLocaleString()}</strong>
          <div className="ds-preview-detail">
            {dragging ? precision : 'Row address'}
            {dragging && features.precision && <small>Move left for precision</small>}
          </div>
          {features.magnifier && (
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

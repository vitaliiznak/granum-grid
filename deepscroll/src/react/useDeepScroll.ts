import { useEffect, useId, useMemo, useState, useSyncExternalStore, type CSSProperties, type HTMLAttributes } from 'react';
import { createEngine, createLensMapping, createZoomMapping, clamp, wheelPixels, type NavigationEvent, type View } from '../core/index.js';
import { DataSession } from '../data/session.js';
import { defaultFeatures, type Features } from '../features.js';
import type { CacheOptions, DataProvider, Marker, RowSlot } from '../data/types.js';
export interface UseDeepScrollOptions<Row> { provider: DataProvider<Row>; rowHeight?: number; initialIndex?: number; initialView?: View; cache?: CacheOptions<Row>; features?: Partial<Features>; reducedMotion?: 'system' | boolean; onNavigate?(event: NavigationEvent): void }
export function useDeepScroll<Row>({ provider, rowHeight = 32, initialIndex = 0, initialView = 'rows', cache, features: overrides, reducedMotion = 'system', onNavigate }: UseDeepScrollOptions<Row>) {
  const features = { ...defaultFeatures, ...overrides };
  const id = useId();
  const [systemMotion, setSystemMotion] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [searchMarkers, setSearchMarkers] = useState<Marker[]>([]);
  const [jumpOpen, setJumpOpen] = useState(false);
  const reduceMotion = reducedMotion === 'system' ? systemMotion : reducedMotion;
  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const change = () => setSystemMotion(media.matches); change(); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []);
  const engine = useMemo(() => createEngine({ rowCount: provider.rowCount, rowHeight, initialIndex, initialView }), [provider.id, provider.revision, provider.rowCount, rowHeight]);
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const session = useMemo(() => new DataSession(provider, cache), [provider, cache?.maxBytes, cache?.pageSize, cache?.estimateRowBytes]);
  useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => { session.start(); return () => session.stop(); }, [session]);
  useEffect(() => { engine.setMetadata(session.markers, session.chapters); }, [engine, session.markers, session.chapters]);
  useEffect(() => { engine.setMotion(!reduceMotion && features.flight); }, [engine, reduceMotion, features.flight]);
  useEffect(() => engine.onNavigate(event => { const chapter = session.chapters.find(c => event.to.position >= c.start && event.to.position < c.end); setAnnouncement(`Jumped to row ${(Math.floor(event.to.position) + 1).toLocaleString()}${chapter ? `, ${chapter.label}` : ''}`); onNavigate?.(event); }), [engine, session, onNavigate]);
  useEffect(() => {
    if (!snapshot.moving) return;
    let frame = requestAnimationFrame(function animate(time) { if (engine.step(time)) frame = requestAnimationFrame(animate); });
    return () => cancelAnimationFrame(frame);
  }, [engine, snapshot.moving]);
  const aggregateMode = snapshot.flightSpan > snapshot.height / rowHeight * 3 || (snapshot.view === 'zoom' && snapshot.rowsPerPixel > 1 / 22);
  const mapping = useMemo(() => {
    if (snapshot.flightSpan > snapshot.height / rowHeight * 3) return createZoomMapping(snapshot.position, snapshot.height, Math.max(1 / rowHeight, snapshot.flightSpan / snapshot.height));
    if (snapshot.view === 'lens') return createLensMapping(snapshot.position, snapshot.rowCount, snapshot.height, rowHeight);
    if (snapshot.view === 'zoom') return createZoomMapping(snapshot.position, snapshot.height, snapshot.rowsPerPixel);
    return { toPixel: (row: number) => (row - snapshot.position) * rowHeight, toRow: (pixel: number) => snapshot.position + pixel / rowHeight };
  }, [snapshot.position, snapshot.view, snapshot.height, snapshot.rowsPerPixel, snapshot.flightSpan, snapshot.rowCount, rowHeight]);
  const start = aggregateMode ? Math.floor(snapshot.position) : snapshot.view === 'lens' ? Math.max(0, Math.floor(snapshot.position) - 3) : Math.max(0, Math.floor(mapping.toRow(0)));
  const count = aggregateMode ? 0 : Math.max(0, Math.min(provider.rowCount - start, snapshot.view === 'lens' ? 7 : Math.min(256, Math.ceil(mapping.toRow(snapshot.height)) - start + 2)));
  const aggregateStart = Math.max(0, Math.floor(mapping.toRow(0)));
  const aggregateEnd = Math.min(provider.rowCount, Math.ceil(mapping.toRow(snapshot.height)) + 1);
  useEffect(() => {
    if ((!aggregateMode && snapshot.view !== 'lens') || snapshot.moving || aggregateEnd <= aggregateStart) { session.requestAggregates(); return; }
    const timer = setTimeout(() => session.requestAggregates({ start: aggregateStart, end: aggregateEnd, buckets: 160 }), 120);
    return () => { clearTimeout(timer); session.requestAggregates(); };
  }, [session, aggregateStart, aggregateEnd, aggregateMode, snapshot.view, snapshot.moving]);
  useEffect(() => {
    if (!viewport) return;
    const observer = new ResizeObserver(() => engine.setViewport(viewport.clientHeight));
    observer.observe(viewport);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey) { viewport.focus({ preventScroll: true }); const state = engine.getSnapshot(); engine.setZoom(state.rowsPerPixel * Math.exp(event.deltaY * .008), event.clientY - viewport.getBoundingClientRect().top); }
      else engine.pan(wheelPixels(event.deltaY, event.deltaMode, viewport.clientHeight, rowHeight));
    };
    const touches = new Map<number, { x: number; y: number }>();
    let distance = 0;
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || (event.target as HTMLElement).closest('button,input,a')) return;
      viewport.setPointerCapture(event.pointerId); touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 2) { const [a, b] = [...touches.values()]; distance = Math.hypot(a.x - b.x, a.y - b.y); }
    };
    const move = (event: PointerEvent) => {
      const previous = touches.get(event.pointerId); if (!previous) return;
      event.preventDefault(); touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 2) {
        const [a, b] = [...touches.values()], nextDistance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance > 0 && nextDistance > 0) engine.setZoom(engine.getSnapshot().rowsPerPixel * distance / nextDistance, (a.y + b.y) / 2 - viewport.getBoundingClientRect().top);
        distance = nextDistance;
      } else engine.pan(previous.y - event.clientY);
    };
    const up = (event: PointerEvent) => { touches.delete(event.pointerId); distance = 0; };
    viewport.addEventListener('wheel', wheel, { passive: false });
    viewport.addEventListener('pointerdown', down); viewport.addEventListener('pointermove', move, { passive: false }); viewport.addEventListener('pointerup', up); viewport.addEventListener('pointercancel', up);
    return () => { observer.disconnect(); viewport.removeEventListener('wheel', wheel); viewport.removeEventListener('pointerdown', down); viewport.removeEventListener('pointermove', move); viewport.removeEventListener('pointerup', up); viewport.removeEventListener('pointercancel', up); };

  }, [viewport, engine, rowHeight]);
  useEffect(() => { session.setRange('visible', start, count); }, [session, start, count]);
  const rows: RowSlot<Row>[] = Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    const common = { index, y: mapping.toPixel(index), height: snapshot.view === 'zoom' ? 1 / snapshot.rowsPerPixel : rowHeight };
    const row = session.read(index);
    const error = session.error(index);
    const estimate = features.progressiveEstimates ? session.overview.find(bucket => index >= bucket.start && index < bucket.end) : undefined;
    return row !== undefined ? { ...common, status: 'ready', row } : { ...common, status: error ? 'error' : 'loading', error, estimate };
  });
  const getViewportProps = (props: HTMLAttributes<HTMLDivElement> = {}) => ({
    ...props, ref: setViewport, role: 'grid', tabIndex: 0, 'aria-rowcount': provider.rowCount,
    className: `ds-viewport ${props.className ?? ''}`,
    onClick: (event: React.MouseEvent<HTMLDivElement>) => { props.onClick?.(event); if (event.defaultPrevented || (event.target as HTMLElement).closest('button,a,input')) return; if (snapshot.view === 'lens' || aggregateMode) { const index = Math.round(clamp(mapping.toRow(event.clientY - event.currentTarget.getBoundingClientRect().top), 0, Math.max(0, provider.rowCount - 1))); engine.goTo(index, { reason: 'lens' }); } },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      props.onKeyDown?.(event);
      if (event.defaultPrevented || (event.target as HTMLElement).closest('input,textarea,select,button,a,[contenteditable=true]')) return;
      if (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) { event.preventDefault(); setJumpOpen(true); return; }
      if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) { event.preventDefault(); event.key === 'ArrowLeft' ? engine.back() : engine.forward(); return; }
      if ((event.metaKey || event.ctrlKey) && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); event.key === 'ArrowUp' ? engine.previousChapter() : engine.nextChapter(); return; }
      if (event.key.toLowerCase() === 'n' || event.key.toLowerCase() === 'p') { event.preventDefault(); event.key.toLowerCase() === 'n' ? engine.nextMarker() : engine.previousMarker(); return; }
      if (event.key === 'Escape') { engine.cancel(); return; }
      const movement: Record<string, number> = { ArrowDown: rowHeight, ArrowUp: -rowHeight, PageDown: snapshot.height - rowHeight, PageUp: -snapshot.height + rowHeight };
      if (event.key in movement) { event.preventDefault(); engine.pan(movement[event.key]); }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); engine.goTo(event.key === 'Home' ? 0 : Math.max(0, provider.rowCount - 1), { reason: 'keyboard' }); }
    },
  });
  return {
    id, controller: engine, snapshot, rows, provider, session, stats: session.getStats(), features, reduceMotion, announcement, searchMarkers, setSearchMarkers, jumpOpen, setJumpOpen, mapping, aggregateMode,
    getViewportProps,
    getRowProps: (slot: RowSlot<Row>) => ({ role: 'row', 'aria-rowindex': slot.index + 1, id: `${id}-row-${slot.index}`, className: 'ds-row', style: { height: slot.height, transform: `translateY(${slot.y}px)` } as CSSProperties }),
    getAnnouncementProps: () => ({ className: 'ds-sr', 'aria-live': 'polite' as const, children: announcement }),
  };
}
export type DeepScrollState<Row> = ReturnType<typeof useDeepScroll<Row>>;

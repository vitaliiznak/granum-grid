import { useEffect, useId, useMemo, useState, useSyncExternalStore, type CSSProperties, type HTMLAttributes } from 'react';
import { createEngine, wheelPixels, type View } from '../core/index.js';
import { DataSession } from '../data/session.js';
import type { CacheOptions, DataProvider, RowSlot } from '../data/types.js';
export interface UseDeepScrollOptions<Row> { provider: DataProvider<Row>; rowHeight?: number; initialIndex?: number; initialView?: View; cache?: CacheOptions<Row> }
export function useDeepScroll<Row>({ provider, rowHeight = 32, initialIndex = 0, initialView = 'rows', cache }: UseDeepScrollOptions<Row>) {
  const id = useId();
  const engine = useMemo(() => createEngine({ rowCount: provider.rowCount, rowHeight, initialIndex, initialView }), [provider.id, provider.revision, provider.rowCount, rowHeight]);
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const session = useMemo(() => new DataSession(provider, cache), [provider, cache?.maxBytes, cache?.pageSize, cache?.estimateRowBytes]);
  useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => { session.start(); return () => session.stop(); }, [session]);
  const start = Math.floor(snapshot.position);
  const count = Math.min(provider.rowCount - start, Math.ceil(snapshot.height / rowHeight) + 2);
  useEffect(() => {
    if (!viewport) return;
    const observer = new ResizeObserver(() => engine.setViewport(viewport.clientHeight));
    observer.observe(viewport);
    const wheel = (event: WheelEvent) => { event.preventDefault(); engine.pan(wheelPixels(event.deltaY, event.deltaMode, viewport.clientHeight, rowHeight)); };
    viewport.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); viewport.removeEventListener('wheel', wheel); };
  }, [viewport, engine, rowHeight]);
  useEffect(() => { session.setRange('visible', start, count); }, [session, start, count]);
  const rows: RowSlot<Row>[] = Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    const common = { index, y: (index - snapshot.position) * rowHeight, height: rowHeight };
    const row = session.read(index);
    const error = session.error(index);
    const estimate = session.overview.find(bucket => index >= bucket.start && index < bucket.end);
    return row !== undefined ? { ...common, status: 'ready', row } : { ...common, status: error ? 'error' : 'loading', error, estimate };
  });
  const getViewportProps = (props: HTMLAttributes<HTMLDivElement> = {}) => ({
    ...props, ref: setViewport, role: 'grid', tabIndex: 0, 'aria-rowcount': provider.rowCount,
    className: `ds-viewport ${props.className ?? ''}`,
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      props.onKeyDown?.(event);
      if (event.defaultPrevented || event.target !== event.currentTarget) return;
      const movement: Record<string, number> = { ArrowDown: rowHeight, ArrowUp: -rowHeight, PageDown: snapshot.height - rowHeight, PageUp: -snapshot.height + rowHeight };
      if (event.key in movement) { event.preventDefault(); engine.pan(movement[event.key]); }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); engine.goTo(event.key === 'Home' ? 0 : Math.max(0, provider.rowCount - 1)); }
    },
  });
  return {
    id, controller: engine, snapshot, rows, provider, session, stats: session.getStats(),
    getViewportProps,
    getRowProps: (slot: RowSlot<Row>) => ({ role: 'row', 'aria-rowindex': slot.index + 1, id: `${id}-row-${slot.index}`, className: 'ds-row', style: { height: slot.height, transform: `translateY(${slot.y}px)` } as CSSProperties }),
    getAnnouncementProps: () => ({ className: 'ds-sr', 'aria-live': 'polite' as const }),
  };
}
export type DeepScrollState<Row> = ReturnType<typeof useDeepScroll<Row>>;

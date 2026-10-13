import { clamp, rowToProgress } from './mappings.js';
export type View = 'rows' | 'lens' | 'zoom';
export interface NavigationLocation { position: number; view: View; rowsPerPixel: number }
export interface NavigationSnapshot extends NavigationLocation {
  rowCount: number; activeIndex: number | null; progress: number; moving: boolean;
  canGoBack: boolean; canGoForward: boolean; height: number; rowHeight: number;
}
export interface EngineOptions { rowCount: number; rowHeight?: number; initialIndex?: number; initialView?: View }
export function createEngine(options: EngineOptions) {
  if (!Number.isSafeInteger(options.rowCount) || options.rowCount < 0) throw new RangeError('rowCount must be a nonnegative safe integer');
  const rowHeight = options.rowHeight ?? 32;
  if (!Number.isFinite(rowHeight) || rowHeight < 1) throw new RangeError('rowHeight must be positive');
  const listeners = new Set<() => void>();
  let snapshot: NavigationSnapshot = {
    position: 0, view: options.initialView ?? 'rows', rowsPerPixel: 1 / rowHeight,
    rowCount: options.rowCount, activeIndex: options.rowCount ? 0 : null, progress: 0,
    moving: false, canGoBack: false, canGoForward: false, height: 480, rowHeight,
  };
  function update(patch: Partial<NavigationSnapshot>) {
    const next = { ...snapshot, ...patch };
    next.position = clamp(next.position, 0, Math.max(0, next.rowCount - 1));
    next.activeIndex = next.rowCount ? Math.floor(next.position) : null;
    next.progress = rowToProgress(next.position, next.rowCount);
    if (Object.keys(next).every(key => next[key as keyof NavigationSnapshot] === snapshot[key as keyof NavigationSnapshot])) return;
    snapshot = next;
    listeners.forEach(listener => listener());
  }
  const engine = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setViewport: (height: number) => { if (Number.isFinite(height) && height > 0) update({ height }); },
    goTo: (index: number) => {
      if (!Number.isSafeInteger(index)) throw new RangeError('index must be a safe integer');
      update({ position: index });
    },
    pan: (pixels: number) => { if (Number.isFinite(pixels)) update({ position: snapshot.position + pixels / rowHeight }); },
    scrub: (position: number) => { if (Number.isFinite(position)) update({ position }); },
    setView: (view: View) => update({ view }),
    destroy: () => listeners.clear(),
  };
  engine.goTo(options.initialIndex ?? 0);
  return engine;
}
export type DeepScrollEngine = ReturnType<typeof createEngine>;

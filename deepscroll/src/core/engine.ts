import { clamp, rowToProgress } from './mappings.js';
import type { Chapter, Marker } from '../data/types.js';
export type View = 'rows' | 'lens' | 'zoom';
export interface NavigationLocation {
  position: number;
  view: View;
  rowsPerPixel: number;
}
export interface NavigationEvent {
  from: NavigationLocation;
  to: NavigationLocation;
  reason: 'jump' | 'scrub' | 'marker' | 'chapter' | 'history' | 'keyboard' | 'lens';
}
export interface NavigationSnapshot extends NavigationLocation {
  rowCount: number;
  activeIndex: number | null;
  progress: number;
  moving: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  height: number;
  rowHeight: number;
  flightSpan: number;
  trail: readonly number[];
}
export interface EngineOptions {
  rowCount: number;
  rowHeight?: number;
  initialIndex?: number;
  initialView?: View;
}
export function createEngine(options: EngineOptions) {
  if (!Number.isSafeInteger(options.rowCount) || options.rowCount < 0)
    throw new RangeError('rowCount must be a nonnegative safe integer');
  const rowHeight = options.rowHeight ?? 32;
  if (!Number.isFinite(rowHeight) || rowHeight < 1)
    throw new RangeError('rowHeight must be positive');
  const listeners = new Set<() => void>(),
    navigationListeners = new Set<(event: NavigationEvent) => void>();
  const backStack: NavigationLocation[] = [],
    forwardStack: NavigationLocation[] = [];
  let markers: Marker[] = [],
    chapters: Chapter[] = [];
  let animate = false;
  let scrubOrigin: NavigationLocation | undefined;
  let flight:
    | {
        from: NavigationLocation;
        to: NavigationLocation;
        reason: NavigationEvent['reason'];
        start?: number;
        duration: number;
      }
    | undefined;
  let snapshot: NavigationSnapshot = {
    position: 0,
    view: options.initialView ?? 'rows',
    rowsPerPixel: 1 / rowHeight,
    rowCount: options.rowCount,
    activeIndex: options.rowCount ? 0 : null,
    progress: 0,
    moving: false,
    canGoBack: false,
    canGoForward: false,
    height: 480,
    rowHeight,
    flightSpan: 0,
    trail: [],
  };
  const location = (): NavigationLocation => ({
    position: snapshot.position,
    view: snapshot.view,
    rowsPerPixel: snapshot.rowsPerPixel,
  });
  function update(patch: Partial<NavigationSnapshot>) {
    const next = {
      ...snapshot,
      ...patch,
      canGoBack: backStack.length > 0,
      canGoForward: forwardStack.length > 0,
    };
    next.position = clamp(next.position, 0, Math.max(0, next.rowCount - 1));
    next.activeIndex = next.rowCount ? Math.floor(next.position) : null;
    next.progress = rowToProgress(next.position, next.rowCount);
    if (
      Object.keys(next).every(
        (key) =>
          next[key as keyof NavigationSnapshot] === snapshot[key as keyof NavigationSnapshot],
      )
    )
      return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
  function notify(from: NavigationLocation, reason: NavigationEvent['reason']) {
    const to = location();
    if (
      from.position === to.position &&
      from.view === to.view &&
      from.rowsPerPixel === to.rowsPerPixel
    )
      return;
    const trail = [...snapshot.trail];
    for (const position of [from.position, to.position])
      if (!trail.some((p) => Math.abs(p - position) < Math.max(1, snapshot.rowCount / 1000)))
        trail.push(position);
    update({ trail: trail.slice(-100) });
    navigationListeners.forEach((listener) => listener({ from, to, reason }));
  }
  function interrupt() {
    flight = undefined;
    update({ moving: false, flightSpan: 0 });
  }
  function travel(to: NavigationLocation, reason: NavigationEvent['reason'], motion = true) {
    interrupt();
    const from = location();
    if (
      animate &&
      motion &&
      Math.abs(to.position - from.position) > (2 * snapshot.height) / rowHeight
    ) {
      flight = { from, to, reason, duration: 420 };
      update({ moving: true });
    } else {
      update(to);
      notify(from, reason);
    }
  }
  function record(from: NavigationLocation) {
    backStack.push(from);
    if (backStack.length > 100) backStack.shift();
    forwardStack.length = 0;
  }
  function goTo(
    index: number,
    config: {
      motion?: 'auto' | 'instant';
      history?: 'record' | 'skip';
      reason?: NavigationEvent['reason'];
    } = {},
  ) {
    if (!Number.isSafeInteger(index)) throw new RangeError('index must be a safe integer');
    interrupt();
    index = clamp(index, 0, Math.max(0, options.rowCount - 1));
    if (index === snapshot.position) return;
    if (config.history !== 'skip') record(location());
    travel(
      { ...location(), position: index },
      config.reason ?? 'jump',
      config.motion !== 'instant',
    );
  }
  const engine = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onNavigate: (listener: (event: NavigationEvent) => void) => {
      navigationListeners.add(listener);
      return () => {
        navigationListeners.delete(listener);
      };
    },
    setViewport: (height: number) => {
      if (Number.isFinite(height) && height > 0) update({ height });
    },
    setMotion: (enabled: boolean) => {
      animate = enabled;
      if (!enabled && flight) {
        const pending = flight;
        flight = undefined;
        update({ ...pending.to, moving: false, flightSpan: 0 });
        notify(pending.from, pending.reason);
      }
    },
    setMetadata: (nextMarkers: Marker[], nextChapters: Chapter[]) => {
      markers = nextMarkers;
      chapters = nextChapters;
    },
    goTo,
    pan: (pixels: number) => {
      if (!Number.isFinite(pixels)) return;
      interrupt();
      update({
        position:
          snapshot.position +
          pixels * (snapshot.view === 'zoom' ? snapshot.rowsPerPixel : 1 / rowHeight),
      });
    },
    beginScrub: () => {
      interrupt();
      scrubOrigin = location();
    },
    scrub: (position: number) => {
      if (Number.isFinite(position)) {
        interrupt();
        update({ position });
      }
    },
    endScrub: (cancel = false) => {
      const origin = scrubOrigin;
      scrubOrigin = undefined;
      if (!origin) return;
      if (cancel) update(origin);
      else if (origin.position !== snapshot.position) {
        record(origin);
        update({});
        notify(origin, 'scrub');
      }
    },
    setView: (view: View) => {
      interrupt();
      update({ view });
    },
    setZoom: (rowsPerPixel: number, anchorY = snapshot.height / 2) => {
      if (!Number.isFinite(rowsPerPixel) || rowsPerPixel <= 0) return;
      interrupt();
      const next = clamp(
        rowsPerPixel,
        1 / rowHeight,
        Math.max(1 / rowHeight, options.rowCount / snapshot.height),
      );
      const old = snapshot.view === 'zoom' ? snapshot.rowsPerPixel : 1 / rowHeight;
      const anchorOffset = anchorY - (snapshot.view === 'rows' ? 0 : snapshot.height / 2);
      const anchorRow = snapshot.position + anchorOffset * old;
      update({
        position: anchorRow - (anchorY - snapshot.height / 2) * next,
        rowsPerPixel: next,
        view: 'zoom',
      });
    },
    nextMarker: (kind?: Marker['kind']) => {
      const marker = markers.find((m) => m.index > snapshot.position && (!kind || m.kind === kind));
      if (marker) goTo(marker.index, { reason: 'marker' });
    },
    previousMarker: (kind?: Marker['kind']) => {
      const marker = markers.findLast(
        (m) => m.index < snapshot.position && (!kind || m.kind === kind),
      );
      if (marker) goTo(marker.index, { reason: 'marker' });
    },
    nextChapter: () => {
      const chapter = chapters.find((c) => c.start > snapshot.position);
      if (chapter) goTo(chapter.start, { reason: 'chapter' });
    },
    previousChapter: () => {
      const chapter = chapters.findLast((c) => c.start < snapshot.position);
      if (chapter) goTo(chapter.start, { reason: 'chapter' });
    },
    back: () => {
      const to = backStack.pop();
      if (!to) return;
      forwardStack.push(location());
      travel(to, 'history');
    },
    forward: () => {
      const to = forwardStack.pop();
      if (!to) return;
      backStack.push(location());
      travel(to, 'history');
    },
    cancel: () => {
      interrupt();
      if (scrubOrigin) engine.endScrub(true);
    },
    visit: () => {
      if (
        !snapshot.rowCount ||
        snapshot.trail.some(
          (position) =>
            Math.abs(position - snapshot.position) < Math.max(1, snapshot.rowCount / 1000),
        )
      )
        return;
      update({ trail: [...snapshot.trail, snapshot.position].slice(-100) });
    },
    step: (time: number) => {
      if (!flight) return false;
      flight.start ??= time;
      const current = flight,
        t = clamp((time - current.start!) / current.duration, 0, 1),
        ease = t * t * (3 - 2 * t);
      update({
        position: current.from.position + (current.to.position - current.from.position) * ease,
        flightSpan: Math.abs(current.to.position - current.from.position) * Math.sin(Math.PI * t),
      });
      if (t === 1) {
        flight = undefined;
        update({ ...current.to, moving: false, flightSpan: 0 });
        notify(current.from, current.reason);
      }
      return !!flight;
    },
    destroy: () => {
      interrupt();
      listeners.clear();
      navigationListeners.clear();
    },
  };
  engine.goTo(options.initialIndex ?? 0, { history: 'skip' });
  return engine;
}
export type DeepScrollEngine = ReturnType<typeof createEngine>;

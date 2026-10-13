import { clamp, rowToProgress, createLensMapping, createMeasuredLensMapping } from './mappings.js';
import type { Chapter, Marker } from '../data/types.js';
import { RowSizes, type RowMeasurement } from './rowSizes.js';
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
  layoutVersion: number;
  measuredRows: number;
  /** Destination exposed for fetching during an animated jump. */
  targetIndex: number | null;
  backLocation: NavigationLocation | null;
}
export type ScrollAlignment = 'start' | 'center' | 'end' | 'auto';
export interface ScrollToOptions {
  align?: ScrollAlignment;
  history?: 'record' | 'skip';
  reason?: NavigationEvent['reason'];
}
export interface GoToOptions extends ScrollToOptions {
  motion?: 'auto' | 'instant';
}
export interface EngineOptions {
  rowCount: number;
  rowHeight?: number;
  initialIndex?: number;
  initialView?: View;
  initialLocation?: NavigationLocation;
  dynamicRowHeight?: boolean;
  maxMeasuredRows?: number;
}
export function createEngine(options: EngineOptions) {
  if (!Number.isSafeInteger(options.rowCount) || options.rowCount < 0)
    throw new RangeError('rowCount must be a nonnegative safe integer');
  const rowHeight = options.rowHeight ?? 32;
  if (!Number.isFinite(rowHeight) || rowHeight < 1)
    throw new RangeError('rowHeight must be positive');
  const rowSizes = new RowSizes(options.rowCount, rowHeight, options.maxMeasuredRows);
  let alignment: { index: number; align: Exclude<ScrollAlignment, 'auto'> } | undefined;
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
    layoutVersion: 0,
    measuredRows: 0,
    targetIndex: null,
    backLocation: null,
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
      backLocation: backStack.at(-1) ?? null,
    };
    const last = Math.max(0, next.rowCount - 1);
    const maxPosition =
      options.dynamicRowHeight && next.view === 'rows'
        ? last + Math.max(0, 1 - next.height / rowSizes.size(last))
        : last;
    next.position = clamp(next.position, 0, maxPosition);
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
    update({ moving: false, flightSpan: 0, targetIndex: null });
  }
  function alignedPosition(index: number, align: Exclude<ScrollAlignment, 'auto'>) {
    const height = rowSizes.size(index);
    const offset =
      align === 'start'
        ? 0
        : align === 'center'
          ? Math.max(0, (snapshot.height - height) / 2)
          : Math.max(0, snapshot.height - height);
    return clamp(rowSizes.advance(index, -offset), 0, Math.max(0, options.rowCount - 1));
  }
  function changeMeasurements(change: () => boolean) {
    const index = Math.floor(snapshot.position);
    const offset = (snapshot.position - index) * rowSizes.size(index);
    if (!change()) return;
    update({
      position: alignment
        ? alignedPosition(alignment.index, alignment.align)
        : index +
          Math.min(offset / rowSizes.size(index), 1 - Number.EPSILON * Math.max(1, index) * 2),
      layoutVersion: snapshot.layoutVersion + 1,
      measuredRows: rowSizes.measuredCount,
    });
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
      update({ moving: true, targetIndex: Math.floor(to.position) });
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
  function goTo(index: number, config: GoToOptions = {}) {
    if (config.align) return engine.scrollToIndex(index, config);
    if (!Number.isSafeInteger(index)) throw new RangeError('index must be a safe integer');
    interrupt();
    alignment = undefined;
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
    rowSizes,
    /** Append-only count updates preserve addresses, measurements, and history. */
    appendRows: (rowCount: number, follow = false) => {
      if (!Number.isSafeInteger(rowCount) || rowCount < options.rowCount)
        throw new RangeError('Append count must not decrease');
      if (rowCount === options.rowCount) return;
      const nearEnd =
        snapshot.view === 'rows' &&
        rowSizes.distance(snapshot.position, options.rowCount) <= snapshot.height + 1;
      options.rowCount = rowCount;
      rowSizes.rowCount = rowCount;
      update({ rowCount });
      if (follow && nearEnd && rowCount)
        engine.scrollToIndex(rowCount - 1, { align: 'end', history: 'skip' });
    },
    getLocation: location,
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
      if (Number.isFinite(height) && height > 0) {
        update({ height });
        if (alignment) update({ position: alignedPosition(alignment.index, alignment.align) });
      }
    },
    setMotion: (enabled: boolean) => {
      animate = enabled;
      if (!enabled && flight) {
        const pending = flight;
        flight = undefined;
        update({ ...pending.to, moving: false, flightSpan: 0, targetIndex: null });
        notify(pending.from, pending.reason);
      }
    },
    setMetadata: (nextMarkers: Marker[], nextChapters: Chapter[]) => {
      markers = nextMarkers;
      chapters = nextChapters;
    },
    goTo,
    /** Align a row in the Rows view; new measurements keep the target aligned until input. */
    scrollToIndex: (index: number, config: ScrollToOptions = {}) => {
      if (!Number.isSafeInteger(index)) throw new RangeError('index must be a safe integer');
      index = clamp(index, 0, Math.max(0, options.rowCount - 1));
      let align = config.align ?? 'auto';
      if (align === 'auto') {
        const top = rowSizes.distance(snapshot.position, index);
        const bottom = top + rowSizes.size(index);
        if (
          snapshot.view === 'rows' &&
          ((top >= 0 && bottom <= snapshot.height) || (top <= 0 && bottom >= snapshot.height))
        )
          return;
        align = top < 0 || rowSizes.size(index) > snapshot.height ? 'start' : 'end';
      }
      interrupt();
      const from = location();
      alignment = { index, align };
      const position = alignedPosition(index, align);
      if (config.history !== 'skip' && (position !== from.position || from.view !== 'rows'))
        record(from);
      // Measurements can change the target during travel, so aligned navigation is immediate.
      update({ position, view: 'rows' });
      notify(from, config.reason ?? 'jump');
    },
    restore: (to: NavigationLocation) => {
      if (
        !Number.isFinite(to.position) ||
        !Number.isFinite(to.rowsPerPixel) ||
        to.rowsPerPixel <= 0 ||
        !(['rows', 'lens', 'zoom'] as const).includes(to.view)
      )
        throw new RangeError('Invalid navigation location');
      interrupt();
      alignment = undefined;
      update({
        position: to.position,
        view: to.view,
        rowsPerPixel: clamp(
          to.rowsPerPixel,
          1 / rowHeight,
          Math.max(1 / rowHeight, options.rowCount / snapshot.height),
        ),
      });
    },
    measureRows: (rows: readonly RowMeasurement[], retained: readonly number[] = []) => {
      if (options.dynamicRowHeight)
        changeMeasurements(() => rowSizes.measure(rows, snapshot.position, retained));
    },
    resetMeasurements: () => changeMeasurements(() => rowSizes.clear()),
    pan: (pixels: number) => {
      if (!Number.isFinite(pixels)) return;
      interrupt();
      alignment = undefined;
      const from = snapshot.position;
      const measured =
        options.dynamicRowHeight && (snapshot.view !== 'zoom' || snapshot.rowsPerPixel <= 1 / 22);
      const scale = snapshot.view === 'zoom' ? snapshot.rowsPerPixel : 1 / rowHeight;
      const origin = from + (measured && snapshot.view !== 'rows' ? 0.5 : 0);
      update({
        position: measured
          ? rowSizes.advance(origin, pixels) - (origin - from)
          : from + pixels * scale,
      });
      return (
        pixels -
        (measured
          ? rowSizes.distance(origin, snapshot.position + (origin - from))
          : (snapshot.position - from) / scale)
      );
    },
    beginScrub: () => {
      interrupt();
      alignment = undefined;
      scrubOrigin = location();
    },
    scrub: (position: number) => {
      if (Number.isFinite(position)) {
        interrupt();
        alignment = undefined;
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
      alignment = undefined;
      update({ view });
    },
    setZoom: (rowsPerPixel: number, anchorY = snapshot.height / 2) => {
      if (!Number.isFinite(rowsPerPixel) || rowsPerPixel <= 0) return;
      interrupt();
      alignment = undefined;
      const next = clamp(
        rowsPerPixel,
        1 / rowHeight,
        Math.max(1 / rowHeight, options.rowCount / snapshot.height),
      );
      const old = snapshot.view === 'zoom' ? snapshot.rowsPerPixel : 1 / rowHeight;
      const anchorOffset = anchorY - (snapshot.view === 'rows' ? 0 : snapshot.height / 2);
      let anchorRow = snapshot.position + anchorOffset * old;
      if (snapshot.view === 'lens') {
        anchorRow = (
          options.dynamicRowHeight
            ? createMeasuredLensMapping(
                snapshot.position,
                snapshot.rowCount,
                snapshot.height,
                rowHeight,
                rowSizes,
              )
            : createLensMapping(snapshot.position, snapshot.rowCount, snapshot.height, rowHeight)
        ).toRow(anchorY);
      } else if (options.dynamicRowHeight && (snapshot.view === 'rows' || old <= 1 / 22)) {
        const origin = snapshot.position + (snapshot.view === 'rows' ? 0 : 0.5);
        anchorRow = rowSizes.advance(origin, anchorOffset) - 0.5;
      }
      const position =
        options.dynamicRowHeight && next <= 1 / 22
          ? rowSizes.advance(anchorRow + 0.5, -(anchorY - snapshot.height / 2)) - 0.5
          : anchorRow - (anchorY - snapshot.height / 2) * next;
      update({
        position,
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
      alignment = undefined;
      const to = backStack.pop();
      if (!to) return;
      forwardStack.push(location());
      travel(to, 'history');
    },
    forward: () => {
      alignment = undefined;
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
        update({ ...current.to, moving: false, flightSpan: 0, targetIndex: null });
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
  if (options.initialLocation) engine.restore(options.initialLocation);
  return engine;
}
export type DeepScrollEngine = ReturnType<typeof createEngine>;

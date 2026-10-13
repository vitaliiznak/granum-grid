import { clamp, rowToProgress, ROW_DETAIL_MAX_ROWS_PER_PIXEL } from './mappings.js';
import type { Chapter, Marker, RowRange } from '../data/types.js';
import { validRange } from '../data/bounds.js';
import { RowSizes, type RowMeasurement, type RowSizeReader } from './rowSizes.js';
export type View = 'rows' | 'zoom';
/** Every view, in menu order. */
export const VIEWS: readonly View[] = ['rows', 'zoom'];
export interface NavigationLocation {
  position: number;
  view: View;
  rowsPerPixel: number;
}
export interface NavigationEvent {
  from: NavigationLocation;
  to: NavigationLocation;
  reason: 'jump' | 'scrub' | 'marker' | 'chapter' | 'history' | 'keyboard';
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
/**
 * Navigation for host integrations, such as custom controls and `apiRef`. An explicit interface
 * keeps the published API independent of the implementation.
 */
export interface NavigationController {
  /** Append-only count updates preserve addresses, measurements, and history. */
  appendRows(rowCount: number, follow?: boolean): void;
  getLocation(): NavigationLocation;
  /** Immutable snapshot; identity changes only when a value changes. */
  getSnapshot(): NavigationSnapshot;
  subscribe(listener: () => void): () => void;
  /** Committed jumps (not continuous panning). */
  onNavigate(listener: (event: NavigationEvent) => void): () => void;
  /** Jump to a row, animating long distances unless `motion: 'instant'`. */
  goTo(index: number, config?: GoToOptions): void;
  /** Fit a half-open range in Overview, recording the previous location once. */
  zoomToRange(range: RowRange): void;
  /** Align a row in the Rows view; new measurements keep the target aligned until input. */
  scrollToIndex(index: number, config?: ScrollToOptions): void;
  restore(to: NavigationLocation): void;
  setView(view: View): void;
  /** Rows per CSS pixel, keeping the row under `anchorY` in place. */
  setZoom(rowsPerPixel: number, anchorY?: number): void;
  nextMarker(kind?: Marker['kind']): void;
  previousMarker(kind?: Marker['kind']): void;
  nextChapter(): void;
  previousChapter(): void;
  /** Return to the previous location, including its view and zoom. */
  back(): void;
  /** Revisit the location left by `back`. */
  forward(): void;
  /** Stop a flight or cancel a scrub in progress. */
  cancel(): void;
  /** Discard measured heights, for example after offscreen content or typography changes. */
  resetMeasurements(): void;
}
/** The full engine: navigation plus the input, measurement, and animation adapter methods. */
export interface GranumGridEngine extends NavigationController {
  /** Sparse measured row heights (dynamic row height mode). Read-only; use `measureRows`. */
  readonly rowSizes: RowSizeReader;
  /** Adapter: move by CSS pixels; returns the pixels left over at either end. */
  pan(pixels: number): number | undefined;
  /** Adapter: start, move, and finish a drag that records one history entry. */
  beginScrub(): void;
  scrub(position: number): void;
  endScrub(cancel?: boolean): void;
  /** Adapter: report the viewport height in CSS pixels. */
  setViewport(height: number): void;
  /** Adapter: enable animated flights (disabled for reduced motion). */
  setMotion(enabled: boolean): void;
  /** Adapter: markers and chapters used by marker and chapter navigation. */
  setMetadata(markers: Marker[], chapters: Chapter[]): void;
  /** Adapter: report rendered row heights; `retained` rows survive measurement eviction. */
  measureRows(rows: readonly RowMeasurement[], retained?: readonly number[]): void;
  /** Adapter: record the settled position in the visited trail. */
  visit(): void;
  /** Adapter: advance a flight to `time`; returns whether it is still moving. */
  step(time: number): boolean;
  destroy(): void;
}
const sameLocation = (a: NavigationLocation, b: NavigationLocation) =>
  a.position === b.position && a.view === b.view && a.rowsPerPixel === b.rowsPerPixel;
export function createEngine(options: EngineOptions): GranumGridEngine {
  if (!Number.isSafeInteger(options.rowCount) || options.rowCount < 0)
    throw new RangeError('rowCount must be a nonnegative safe integer');
  const rowHeight = options.rowHeight ?? 32;
  if (!Number.isFinite(rowHeight) || rowHeight < 1)
    throw new RangeError('rowHeight must be positive');
  const rowSizes = new RowSizes(options.rowCount, rowHeight, options.maxMeasuredRows);
  // Zoom runs from one row per row height to the whole dataset in the viewport.
  const minRowsPerPixel = 1 / rowHeight;
  const maxRowsPerPixel = () => Math.max(minRowsPerPixel, options.rowCount / snapshot.height);
  const lastIndex = () => Math.max(0, options.rowCount - 1);
  /** Validate a host-supplied row index and clamp it to the dataset. */
  const clampIndex = (index: number) => {
    if (!Number.isSafeInteger(index)) throw new RangeError('index must be a safe integer');
    return clamp(index, 0, lastIndex());
  };
  let fittedRange: RowRange | undefined;
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
    rowsPerPixel: minRowsPerPixel,
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
    if (sameLocation(from, to)) return;
    addToTrail([from.position, to.position]);
    navigationListeners.forEach((listener) => listener({ from, to, reason }));
  }
  function interrupt() {
    flight = undefined;
    update({ moving: false, flightSpan: 0, targetIndex: null });
  }
  /** Keep the latest 100 visited positions, skipping any within 0.1% of one already kept. */
  function addToTrail(positions: readonly number[]) {
    const near = Math.max(1, snapshot.rowCount / 1000);
    const trail = [...snapshot.trail];
    for (const position of positions)
      if (!trail.some((p) => Math.abs(p - position) < near)) trail.push(position);
    if (trail.length !== snapshot.trail.length) update({ trail: trail.slice(-100) });
  }
  /** New input replaces any flight, pending alignment, and fitted range. */
  function takeOver() {
    interrupt();
    alignment = undefined;
    fittedRange = undefined;
  }
  function alignedPosition(index: number, align: Exclude<ScrollAlignment, 'auto'>) {
    const height = rowSizes.size(index);
    const offset =
      align === 'start'
        ? 0
        : align === 'center'
          ? Math.max(0, (snapshot.height - height) / 2)
          : Math.max(0, snapshot.height - height);
    return clamp(rowSizes.advance(index, -offset), 0, lastIndex());
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
  /** Back or forward: move the current location onto the opposite stack. */
  function revisit(from: NavigationLocation[], to: NavigationLocation[]) {
    alignment = undefined;
    fittedRange = undefined;
    const target = from.pop();
    if (!target) return;
    to.push(location());
    travel(target, 'history');
  }
  function goTo(index: number, config: GoToOptions = {}) {
    if (config.align) return engine.scrollToIndex(index, config);
    index = clampIndex(index);
    takeOver();
    if (index === snapshot.position) return;
    if (config.history !== 'skip') record(location());
    travel(
      { ...location(), position: index },
      config.reason ?? 'jump',
      config.motion !== 'instant',
    );
  }
  const engine: GranumGridEngine = {
    rowSizes,
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
        if (fittedRange)
          update({
            rowsPerPixel: Math.max(minRowsPerPixel, (fittedRange.end - fittedRange.start) / height),
          });
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
    zoomToRange: (range: RowRange) => {
      if (!validRange(range, snapshot.rowCount)) throw new RangeError('Invalid navigation range');
      takeOver();
      const from = location();
      const to: NavigationLocation = {
        position: Math.min(snapshot.rowCount - 1, range.start + (range.end - range.start) / 2),
        view: 'zoom',
        rowsPerPixel: Math.max(minRowsPerPixel, (range.end - range.start) / snapshot.height),
      };
      fittedRange = { ...range };
      if (sameLocation(from, to)) return;
      record(from);
      travel(to, 'jump', false);
    },
    scrollToIndex: (index: number, config: ScrollToOptions = {}) => {
      index = clampIndex(index);
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
      fittedRange = undefined;
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
        !VIEWS.includes(to.view)
      )
        throw new RangeError('Invalid navigation location');
      takeOver();
      update({
        position: to.position,
        view: to.view,
        rowsPerPixel: clamp(to.rowsPerPixel, minRowsPerPixel, maxRowsPerPixel()),
      });
    },
    measureRows: (rows: readonly RowMeasurement[], retained: readonly number[] = []) => {
      if (options.dynamicRowHeight)
        changeMeasurements(() => rowSizes.measure(rows, snapshot.position, retained));
    },
    resetMeasurements: () => changeMeasurements(() => rowSizes.clear()),
    pan: (pixels: number) => {
      if (!Number.isFinite(pixels)) return;
      takeOver();
      const from = snapshot.position;
      const measured =
        options.dynamicRowHeight &&
        (snapshot.view !== 'zoom' || snapshot.rowsPerPixel <= ROW_DETAIL_MAX_ROWS_PER_PIXEL);
      const scale = snapshot.view === 'zoom' ? snapshot.rowsPerPixel : minRowsPerPixel;
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
      takeOver();
      scrubOrigin = location();
    },
    scrub: (position: number) => {
      if (Number.isFinite(position)) {
        takeOver();
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
      takeOver();
      update({ view });
    },
    setZoom: (rowsPerPixel: number, anchorY = snapshot.height / 2) => {
      if (!Number.isFinite(rowsPerPixel) || rowsPerPixel <= 0) return;
      takeOver();
      const next = clamp(rowsPerPixel, minRowsPerPixel, maxRowsPerPixel());
      const old = snapshot.view === 'zoom' ? snapshot.rowsPerPixel : minRowsPerPixel;
      const anchorOffset = anchorY - (snapshot.view === 'rows' ? 0 : snapshot.height / 2);
      let anchorRow = snapshot.position + anchorOffset * old;
      if (
        options.dynamicRowHeight &&
        (snapshot.view === 'rows' || old <= ROW_DETAIL_MAX_ROWS_PER_PIXEL)
      ) {
        const origin = snapshot.position + (snapshot.view === 'rows' ? 0 : 0.5);
        anchorRow = rowSizes.advance(origin, anchorOffset) - 0.5;
      }
      const position =
        options.dynamicRowHeight && next <= ROW_DETAIL_MAX_ROWS_PER_PIXEL
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
    back: () => revisit(backStack, forwardStack),
    forward: () => revisit(forwardStack, backStack),
    cancel: () => {
      interrupt();
      if (scrubOrigin) engine.endScrub(true);
    },
    visit: () => {
      if (snapshot.rowCount) addToTrail([snapshot.position]);
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

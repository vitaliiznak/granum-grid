import { clamp, rowToProgress } from './mappings.js';
import type { Chapter, Marker } from '../data/types.js';
import { RowSizes, type RowMeasurement, type RowSizeReader } from './rowSizes.js';
export interface NavigationLocation {
  position: number;
}
export interface NavigationEvent {
  from: NavigationLocation;
  to: NavigationLocation;
  reason: 'jump' | 'scrub' | 'marker' | 'chapter' | 'history' | 'keyboard';
}
export interface NavigationSnapshot extends NavigationLocation {
  rowCount: number;
  /**
   * The current row: the first visible row, or the row a jump asked for when it lies below
   * `maxPosition` and so cannot reach the top.
   */
  activeIndex: number | null;
  progress: number;
  /** The largest position: the end of the last row meets the bottom of the viewport. */
  maxPosition: number;
  canGoBack: boolean;
  canGoForward: boolean;
  height: number;
  rowHeight: number;
  trail: readonly number[];
  layoutVersion: number;
  measuredRows: number;
  backLocation: NavigationLocation | null;
}
export type ScrollAlignment = 'start' | 'center' | 'end' | 'auto';
export interface ScrollToOptions {
  align?: ScrollAlignment;
  history?: 'record' | 'skip';
  reason?: NavigationEvent['reason'];
}
/** Jumps are instant: the map shows where the reader went, and Back returns. */
export type GoToOptions = ScrollToOptions;
export interface EngineOptions {
  rowCount: number;
  rowHeight?: number;
  initialIndex?: number;
  initialLocation?: NavigationLocation;
  dynamicRowHeight?: boolean;
  maxMeasuredRows?: number;
}
/**
 * Framework-independent navigation. React hosts use `GranumGridApi`, which adds selection,
 * saved views, and search, and replaces `getLocation`/`restore` with validated views.
 */
export interface NavigationController {
  getLocation(): NavigationLocation;
  /** Immutable snapshot; identity changes only when a value changes. */
  getSnapshot(): NavigationSnapshot;
  subscribe(listener: () => void): () => void;
  /** Committed jumps (not continuous panning). */
  onNavigate(listener: (event: NavigationEvent) => void): () => void;
  /** Jump to a row. */
  goTo(index: number, config?: GoToOptions): void;
  /** Align a row in the viewport; new measurements keep the target aligned until input. */
  scrollToIndex(index: number, config?: ScrollToOptions): void;
  restore(to: NavigationLocation): void;
  nextMarker(kind?: Marker['kind']): void;
  previousMarker(kind?: Marker['kind']): void;
  nextChapter(): void;
  previousChapter(): void;
  /** Return to the previous location, including its row offset. */
  back(): void;
  /** Revisit the location left by `back`. */
  forward(): void;
  /**
   * Start, move, and finish a drag, such as from an external scrollbar. Moves are not
   * announced; a finished drag records one history entry and one `scrub` navigation.
   */
  beginScrub(): void;
  /** Show a float row address during a drag. */
  scrub(position: number): void;
  endScrub(cancel?: boolean): void;
  /** Cancel a scrub in progress, returning to where it started. */
  cancel(): void;
  /** Discard measured heights, for example after offscreen content or typography changes. */
  resetMeasurements(): void;
}
/** The full engine: navigation plus the input, measurement, and animation adapter methods. */
export interface GranumGridEngine extends NavigationController {
  /** Sparse measured row heights (dynamic row height mode). Read-only; use `measureRows`. */
  readonly rowSizes: RowSizeReader;
  /** Adapter: append-only count updates preserve addresses, measurements, and history. */
  appendRows(rowCount: number, follow?: boolean): void;
  /** Adapter: move by CSS pixels; returns the pixels left over at either end. */
  pan(pixels: number): number | undefined;
  /** Adapter: report the viewport height in CSS pixels. */
  setViewport(height: number): void;
  /** Adapter: change the row height or measuring mode; the current row and history stay. */
  setRowLayout(rowHeight: number, dynamicRowHeight: boolean): void;
  /** Adapter: markers and chapters used by marker and chapter navigation. */
  setMetadata(markers: Marker[], chapters: Chapter[]): void;
  /** Adapter: report rendered row heights; `retained` rows survive measurement eviction. */
  measureRows(rows: readonly RowMeasurement[], retained?: readonly number[]): void;
  /** Adapter: record the settled position in the visited trail. */
  visit(): void;
  destroy(): void;
}
/** Whether the end of the last row is in view, within one pixel. Internal to the library. */
export function atEnd(
  rowSizes: RowSizeReader,
  { position, rowCount, height }: Pick<NavigationSnapshot, 'position' | 'rowCount' | 'height'>,
) {
  return rowSizes.distance(position, rowCount) <= height + 1;
}
export function createEngine(options: EngineOptions): GranumGridEngine {
  if (!Number.isSafeInteger(options.rowCount) || options.rowCount < 0)
    throw new RangeError('rowCount must be a nonnegative safe integer');
  let rowHeight = options.rowHeight ?? 32;
  if (!Number.isFinite(rowHeight) || rowHeight < 1)
    throw new RangeError('rowHeight must be positive');
  let dynamic = !!options.dynamicRowHeight;
  const rowSizes = new RowSizes(options.rowCount, rowHeight, options.maxMeasuredRows);
  /** The last row's end meets the viewport's bottom, so scrolling never leaves blank rows. */
  const endPosition = (rowCount: number, height: number) =>
    !rowCount
      ? 0
      : dynamic
        ? clamp(rowSizes.advance(rowCount, -height), 0, rowCount)
        : Math.max(0, rowCount - height / rowHeight);
  /**
   * A row a jump asked for that lies below `maxPosition`. It stays the active row, and the
   * viewport stays at the end, until the reader moves.
   */
  let activeRow: number | undefined;
  const lastIndex = () => Math.max(0, options.rowCount - 1);
  /** Validate a host-supplied row index and clamp it to the dataset. */
  const clampIndex = (index: number) => {
    if (!Number.isSafeInteger(index)) throw new RangeError('index must be a safe integer');
    return clamp(index, 0, lastIndex());
  };
  let alignment: { index: number; align: Exclude<ScrollAlignment, 'auto'> } | undefined;
  const listeners = new Set<() => void>(),
    navigationListeners = new Set<(event: NavigationEvent) => void>();
  const backStack: NavigationLocation[] = [],
    forwardStack: NavigationLocation[] = [];
  let markers: Marker[] = [],
    chapters: Chapter[] = [];
  let scrubOrigin: NavigationLocation | undefined;
  let snapshot: NavigationSnapshot = {
    position: 0,
    rowCount: options.rowCount,
    activeIndex: options.rowCount ? 0 : null,
    progress: 0,
    maxPosition: endPosition(options.rowCount, 480),
    canGoBack: false,
    canGoForward: false,
    height: 480,
    rowHeight,
    trail: [],
    layoutVersion: 0,
    measuredRows: 0,
    backLocation: null,
  };
  const location = (): NavigationLocation => ({
    position: snapshot.position,
  });
  function update(patch: Partial<NavigationSnapshot>) {
    const next = {
      ...snapshot,
      ...patch,
      canGoBack: backStack.length > 0,
      canGoForward: forwardStack.length > 0,
      backLocation: backStack.at(-1) ?? null,
    };
    next.maxPosition = endPosition(next.rowCount, next.height);
    next.position = clamp(next.position, 0, next.maxPosition);
    if (activeRow !== undefined && activeRow < Math.floor(next.position)) activeRow = undefined;
    next.activeIndex = next.rowCount ? (activeRow ?? Math.floor(next.position)) : null;
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
    if (from.position === to.position) return;
    addToTrail([from.position, to.position]);
    navigationListeners.forEach((listener) => listener({ from, to, reason }));
  }
  /** Settle at a jump's destination; a row below the end clamp stays the active row. */
  function arrive(patch: Partial<NavigationSnapshot> & NavigationLocation, row?: number) {
    activeRow =
      patch.position > endPosition(snapshot.rowCount, snapshot.height)
        ? (row ?? Math.floor(patch.position))
        : undefined;
    update(patch);
  }
  /** Keep the latest 100 visited positions, skipping any within 0.1% of one already kept. */
  function addToTrail(positions: readonly number[]) {
    const near = Math.max(1, snapshot.rowCount / 1000);
    const trail = [...snapshot.trail];
    for (const position of positions)
      if (!trail.some((p) => Math.abs(p - position) < near)) trail.push(position);
    if (trail.length !== snapshot.trail.length) update({ trail: trail.slice(-100) });
  }
  /** New input replaces any pending alignment. */
  function takeOver() {
    alignment = undefined;
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
  function changeMeasurements(change: () => boolean, patch: Partial<NavigationSnapshot> = {}) {
    const index = Math.floor(snapshot.position);
    const offset = (snapshot.position - index) * rowSizes.size(index);
    if (!change()) return;
    update({
      ...patch,
      position: alignment
        ? alignedPosition(alignment.index, alignment.align)
        : activeRow !== undefined
          ? activeRow
          : index +
            Math.min(offset / rowSizes.size(index), 1 - Number.EPSILON * Math.max(1, index) * 2),
      layoutVersion: snapshot.layoutVersion + 1,
      measuredRows: rowSizes.measuredCount,
    });
  }
  function travel(to: NavigationLocation, reason: NavigationEvent['reason']) {
    activeRow = undefined;
    const from = location();
    arrive(to);
    notify(from, reason);
  }
  function record(from: NavigationLocation) {
    backStack.push(from);
    if (backStack.length > 100) backStack.shift();
    forwardStack.length = 0;
  }
  /** Back or forward: move the current location onto the opposite stack. */
  function revisit(from: NavigationLocation[], to: NavigationLocation[]) {
    alignment = undefined;
    const target = from.pop();
    if (!target) return;
    to.push(location());
    travel(target, 'history');
  }
  function goTo(index: number, config: GoToOptions = {}) {
    if (config.align) return engine.scrollToIndex(index, config);
    index = clampIndex(index);
    takeOver();
    // Already in view at the end: the row becomes current without moving or a history entry.
    if (Math.min(index, snapshot.maxPosition) === snapshot.position)
      return arrive({ position: index });
    if (config.history !== 'skip') record(location());
    travel({ position: index }, config.reason ?? 'jump');
  }
  const engine: GranumGridEngine = {
    rowSizes,
    appendRows: (rowCount: number, follow = false) => {
      if (!Number.isSafeInteger(rowCount) || rowCount < options.rowCount)
        throw new RangeError('Append count must not decrease');
      if (rowCount === options.rowCount) return;
      const nearEnd = atEnd(rowSizes, snapshot);
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
        else if (activeRow !== undefined) update({ position: activeRow });
      }
    },
    setRowLayout: (height: number, dynamicRowHeight: boolean) => {
      if (!Number.isFinite(height) || height < 1)
        throw new RangeError('rowHeight must be positive');
      if (height === rowHeight && dynamicRowHeight === dynamic) return;
      rowHeight = height;
      dynamic = dynamicRowHeight;
      changeMeasurements(
        () => {
          rowSizes.setEstimate(height);
          // Fixed heights ignore measurements, so alignment must not read stale ones.
          if (!dynamic) rowSizes.clear();
          return true;
        },
        { rowHeight },
      );
    },
    setMetadata: (nextMarkers: Marker[], nextChapters: Chapter[]) => {
      markers = nextMarkers;
      chapters = nextChapters;
    },
    goTo,
    scrollToIndex: (index: number, config: ScrollToOptions = {}) => {
      index = clampIndex(index);
      let align = config.align ?? 'auto';
      if (align === 'auto') {
        const top = rowSizes.distance(snapshot.position, index);
        const bottom = top + rowSizes.size(index);
        if ((top >= 0 && bottom <= snapshot.height) || (top <= 0 && bottom >= snapshot.height))
          return;
        align = top < 0 || rowSizes.size(index) > snapshot.height ? 'start' : 'end';
      }
      activeRow = undefined;
      const from = location();
      alignment = { index, align };
      const position = alignedPosition(index, align);
      if (config.history !== 'skip' && position !== from.position) record(from);
      // Later measurements keep the target aligned until new input (see `alignment`).
      arrive({ position }, index);
      notify(from, config.reason ?? 'jump');
    },
    restore: (to: NavigationLocation) => {
      if (!Number.isFinite(to.position)) throw new RangeError('Invalid navigation location');
      takeOver();
      activeRow = undefined;
      update({ position: to.position });
    },
    measureRows: (rows: readonly RowMeasurement[], retained: readonly number[] = []) => {
      if (dynamic) changeMeasurements(() => rowSizes.measure(rows, snapshot.position, retained));
    },
    resetMeasurements: () => changeMeasurements(() => rowSizes.clear()),
    pan: (pixels: number) => {
      if (!Number.isFinite(pixels)) return;
      takeOver();
      const from = snapshot.position;
      const position = dynamic ? rowSizes.advance(from, pixels) : from + pixels / rowHeight;
      if (clamp(position, 0, snapshot.maxPosition) !== from) activeRow = undefined;
      update({ position });
      return (
        pixels -
        (dynamic
          ? rowSizes.distance(from, snapshot.position)
          : (snapshot.position - from) * rowHeight)
      );
    },
    beginScrub: () => {
      takeOver();
      scrubOrigin = location();
    },
    scrub: (position: number) => {
      if (Number.isFinite(position)) {
        takeOver();
        activeRow = undefined;
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
      if (scrubOrigin) engine.endScrub(true);
    },
    visit: () => {
      if (snapshot.rowCount) addToTrail([snapshot.position]);
    },
    destroy: () => {
      listeners.clear();
      navigationListeners.clear();
    },
  };
  engine.goTo(options.initialIndex ?? 0, { history: 'skip' });
  if (options.initialLocation) engine.restore(options.initialLocation);
  return engine;
}

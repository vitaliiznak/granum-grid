import {
  useEffect,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type HTMLAttributes,
} from 'react';
import {
  createEngine,
  pixelToRow,
  rowToPixel,
  type CoordinateMapping,
  type NavigationEvent,
  type NavigationSnapshot,
} from '../core/index.js';
import { clamp } from '../core/mappings.js';
import { validRange } from '../data/bounds.js';
import { createGranumGridApi, type GranumGridApi } from '../core/api.js';
import { readView, type SavedView } from '../core/exploration.js';
import { INTERNAL, type GridInternals } from './internal.js';
import { useRowMeasurements } from './useRowMeasurements.js';
import { bindScroll } from '../dom/scroll.js';
import { isControl, ownsKeys } from '../dom/targets.js';
import { useKeyed } from './useKeyed.js';
import { useReducedMotion } from './useReducedMotion.js';
import { useLatest } from './useLatest.js';
import { useClientLayoutEffect } from './useClientLayoutEffect.js';
import { useFollowOutput } from './useFollowOutput.js';
import { useRowRequests } from './useRowRequests.js';
import { handleViewportKey } from '../dom/keyboard.js';
import { bucketAt, chapterAt } from '../core/navigation.js';
import { DataSession, sessionKey } from '../data/session.js';
import { defaultFeatures, type Features } from '../features.js';
import type {
  CacheOptions,
  Chapter,
  DataProvider,
  Marker,
  RowSlot,
  RowRange,
} from '../data/types.js';
export interface ScrollStats {
  cachedRows: number;
  cachedBytes: number;
  budgetOverage: number;
  activeRequests: number;
  abortedRequests: number;
  completedFetches: number;
  measuredRows: number;
}
export interface RowActivationContext<Row> {
  row: Row;
  /** Zero-based address in the current provider. */
  index: number;
  /** One-based display number. */
  rowNumber: number;
}
export interface UseGranumGridOptions<Row> {
  provider: DataProvider<Row>;
  /** `page` scrolls the document instead of an embedded viewport; mount one per page. */
  layout?: 'embedded' | 'page';
  /**
   * `snapshot` (default) rebuilds on any count change. `append` accepts a growing count
   * with the same rows and addresses; `follow` also stays at the end while already there.
   */
  dataMode?: 'snapshot' | 'append' | 'follow';
  cache?: CacheOptions<Row>;
  /** Row height in CSS pixels, or the estimate for unmeasured rows with `dynamicRowHeight`. */
  rowHeight?: number;
  /** Automatically measure loaded row content; rowHeight becomes the estimate. */
  dynamicRowHeight?: boolean;
  /** Extra rows on each side in the rows view. Default: 2. */
  overscan?: number;
  /** First row shown when there is no matching `initialView`. Default: 0. */
  initialIndex?: number;
  /**
   * A saved location and selection to start from, such as a decoded link. Ignored when it
   * belongs to another dataset or revision. Initial value, not a controlled prop.
   */
  initialView?: SavedView | null;
  /** Controlled half-open selection. Omit it to let the explorer own the selection. */
  selection?: RowRange | null;
  onSelectionChange?(range: RowRange | null): void;
  /**
   * Host places, such as saved bookmarks, added to the provider's markers for N/P and
   * marker snapping. They belong to the current provider; keep the array stable between renders.
   */
  markers?: readonly Marker[];
  /**
   * Open the host's search UI. `/`, Ctrl/Cmd+K, and `api.openSearch(query)` call it;
   * without it they do nothing.
   */
  onOpenSearch?(query: string): void;
  /** Click or Enter on a loaded row. The host owns the action; activation does not navigate. */
  onRowActivate?(context: RowActivationContext<Row>): void;
  /** Committed jumps, not every animation frame. */
  onNavigate?(event: NavigationEvent): void;
  /** Cache and request counts and measured rows. */
  onStats?(stats: ScrollStats): void;
  /** Motion and data behavior; see `defaultFeatures`. */
  features?: Partial<Features>;
  reducedMotion?: 'system' | boolean;
}
// Keep React's DOM attributes as a named type. Inferred object spreads otherwise
// bake the build-time React version's event handlers into the published .d.ts.
interface ViewportElementProps extends HTMLAttributes<HTMLDivElement> {
  ref: (element: HTMLDivElement | null) => void;
  'data-ds-part': 'viewport';
}
interface RowElementProps extends HTMLAttributes<HTMLDivElement> {
  ref: ((element: HTMLDivElement | null) => void) | undefined;
  'data-ds-part': 'row';
  'data-status': RowSlot<unknown>['status'];
  'data-selected': boolean | undefined;
  'data-focused': boolean | undefined;
  'data-activatable': boolean | undefined;
}
interface LayerElementProps extends HTMLAttributes<HTMLDivElement> {
  ref: (element: HTMLDivElement | null) => void;
  'data-ds-part': 'layer';
}
interface AnnouncementProps {
  className: string;
  style: CSSProperties;
  'aria-live': 'polite';
  children: string;
}
/** What `useGranumGrid` returns. Declared explicitly so published types never follow internals. */
export interface GranumGridState<Row> {
  /** The imperative handle: navigation, selection, saved views, search, and retry. */
  api: GranumGridApi<Row>;
  provider: DataProvider<Row>;
  /** Position, progress, row count, and history availability. Changes while moving. */
  snapshot: NavigationSnapshot;
  /** Bounded row slots to render: ready rows or placeholders. */
  rows: RowSlot<Row>[];
  /** Rows in view as a half-open range. */
  visibleRange: RowRange;
  /** Keyboard row focus, independent of the scroll anchor when row activation is enabled. */
  focusedIndex: number | null;
  selection: RowRange | null;
  /** Provider markers and the host's `markers` in row order, used by the map, N/P, and search. */
  markers: Marker[];
  /** The provider chapter containing the current row, for a breadcrumb. */
  chapter: Chapter | null;
  stats: ScrollStats;
  /** Rows appended while the reader was away from the end (`dataMode: 'follow'`). */
  unseenRows: number;
  /** The scroll container: it scrolls natively and holds the rows layer. */
  getViewportProps: (props?: HTMLAttributes<HTMLDivElement>) => ViewportElementProps;
  /**
   * The element inside the viewport that holds the rows. It is kept at the scroll offset, so
   * rows placed at `slot.y` (viewport pixels) scroll natively with the content.
   */
  getLayerProps: (props?: HTMLAttributes<HTMLDivElement>) => LayerElementProps;
  getRowProps: (slot: RowSlot<Row>, props?: HTMLAttributes<HTMLDivElement>) => RowElementProps;
  getAnnouncementProps: () => AnnouncementProps;
  /** Read by the library's widgets; not part of the public API. */
  readonly [INTERNAL]: GridInternals<Row>;
}
export function useGranumGrid<Row>({
  provider,
  layout = 'embedded',
  dataMode = 'snapshot',
  selection: controlledSelection,
  onSelectionChange,
  onRowActivate,
  markers: hostMarkers,
  onOpenSearch,
  rowHeight = 32,
  dynamicRowHeight = false,
  overscan = 2,
  initialView,
  initialIndex = 0,
  cache,
  features: overrides,
  reducedMotion = 'system',
  onNavigate,
  onStats,
}: UseGranumGridOptions<Row>): GranumGridState<Row> {
  if (dataMode !== 'snapshot' && dataMode !== 'append' && dataMode !== 'follow')
    throw new RangeError('dataMode must be "snapshot", "append", or "follow"');
  const append = dataMode !== 'snapshot';
  const followOutput = append ? dataMode === 'follow' : undefined;
  const windowScroll = layout === 'page';
  // Hosts may pass a fresh view on every render, such as `api.getView()`; the selection keeps
  // one identity while its bounds are unchanged. The location is read only by a new engine.
  const initial = initialView ? readView(initialView, provider) : null;
  const initialStart = initial?.selection?.start;
  const initialEnd = initial?.selection?.end;
  const initialSelection = useMemo(
    () =>
      initialStart === undefined || initialEnd === undefined
        ? null
        : { start: initialStart, end: initialEnd },
    [initialStart, initialEnd],
  );
  if (!Number.isSafeInteger(overscan) || overscan < 0 || overscan > 1000)
    throw new RangeError('overscan must be an integer from 0 to 1000');
  // An embedded explorer sits inside a page, so its edges stop like a plain scroller's; a
  // page explorer owns the document and springs back at its ends.
  const features = { ...defaultFeatures, ...overrides };
  const id = useId();
  const velocity = useRef(0);
  const [announcement, setAnnouncement] = useState('');
  const reduceMotion = useReducedMotion(reducedMotion);
  // Reduced motion turns off every animated or momentum behavior; resolve it once here.
  const engine = useKeyed(
    () =>
      createEngine({
        rowCount: provider.rowCount,
        rowHeight,
        initialIndex,
        dynamicRowHeight,
        initialLocation: initial?.location,
      }),
    [
      provider.id,
      provider.revision,
      // Append mode keeps the engine across count changes; snapshots rebuild it.
      append ? null : provider.rowCount,
      append,
    ],
  );
  // Row addresses do not depend on row height, so a new height keeps the place and history.
  useClientLayoutEffect(
    () => engine.setRowLayout(rowHeight, dynamicRowHeight),
    [engine, rowHeight, dynamicRowHeight],
  );
  const [selectionState, setSelectionState] = useState({ engine, value: initialSelection });
  const candidate =
    controlledSelection !== undefined
      ? controlledSelection
      : selectionState.engine === engine
        ? selectionState.value
        : initialSelection;
  const selection = candidate && validRange(candidate, provider.rowCount) ? candidate : null;
  const latestSelection = useLatest(selection);
  // Host callbacks are read at call time, so inline functions do not rebuild `api` or effects.
  const latestOnSelectionChange = useLatest(onSelectionChange);
  const latestOnNavigate = useLatest(onNavigate);
  const latestOnStats = useLatest(onStats);
  const latestOnOpenSearch = useLatest(onOpenSearch);
  const latestSession = useRef<DataSession<Row> | null>(null);
  const uncontrolledSelection = controlledSelection === undefined;
  const setSelection = useCallback(
    (value: RowRange | null) => {
      if (value && !validRange(value, provider.rowCount))
        throw new RangeError('Invalid selected range');
      const next = value ? { ...value } : null;
      if (uncontrolledSelection) latestSelection.current = next;
      setSelectionState({ engine, value: next });
      latestOnSelectionChange.current?.(value);
    },
    [engine, provider.rowCount, uncontrolledSelection, latestSelection, latestOnSelectionChange],
  );
  // Rows in view, read by `api.getVisibleRange()` without re-rendering on scroll.
  const latestVisibleRange = useRef<RowRange>({ start: 0, end: 0 });
  const api = useMemo(
    () =>
      createGranumGridApi(provider, engine, {
        getSelection: () => latestSelection.current,
        setSelection,
        getVisibleRange: () => latestVisibleRange.current,
        openSearch: (query) => latestOnOpenSearch.current?.(query),
        retry: () => latestSession.current?.retry(),
      }),
    [provider, engine, setSelection, latestOnOpenSearch, latestSelection],
  );
  const measurements = useRowMeasurements(engine);
  const sizes = engine.rowSizes;
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  useEffect(() => {
    if (dynamicRowHeight && snapshot.measuredRows === 0) measurements.measure();
  }, [dynamicRowHeight, measurements, snapshot.layoutVersion, snapshot.measuredRows]);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const session = useKeyed(
    () => new DataSession(provider, cache),
    [
      ...sessionKey(provider, append),
      append,
      cache?.maxBytes,
      cache?.pageSize,
      cache?.estimateRowBytes,
      cache?.requestTimeoutMs,
    ],
  );
  const [rowFocus, setRowFocus] = useState<{
    session: DataSession<Row>;
    position: number;
    index: number;
  } | null>(null);
  const currentFocus = rowFocus?.session === session && rowFocus.position === snapshot.position;
  // A scroll or provider replacement discards pointer focus, even if the reader later returns.
  if (rowFocus && !currentFocus) setRowFocus(null);
  const focusedIndex = onRowActivate && currentFocus ? rowFocus.index : snapshot.activeIndex;
  const unseenRows = useFollowOutput(engine, session, provider, followOutput, snapshot);
  // A provider object rebuilt during render with the same key keeps the session and its cache.
  useEffect(() => {
    if (!append) session.updateAppendProvider(provider);
  }, [append, session, provider]);
  useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    latestSession.current = session;
    session.start();
    return () => session.stop();
  }, [session]);
  const markers = useMemo(() => {
    const own = hostMarkers?.filter((marker) => marker.index < provider.rowCount) ?? [];
    return own.length
      ? [...session.markers, ...own].sort((a, b) => a.index - b.index)
      : session.markers;
  }, [session.markers, hostMarkers, provider.rowCount]);
  useEffect(() => {
    engine.setMetadata(markers, session.chapters);
  }, [engine, markers, session.chapters]);
  useEffect(
    () =>
      engine.onNavigate((event) => {
        const chapter = chapterAt(session.chapters, event.to.position);
        // A jump below the end clamp names the requested row, not the first visible one.
        const row = engine.getSnapshot().activeIndex ?? Math.floor(event.to.position);
        setAnnouncement(
          `Jumped to row ${(row + 1).toLocaleString()}${chapter ? `, ${chapter.label}` : ''}`,
        );
        latestOnNavigate.current?.(event);
      }),
    [engine, session, latestOnNavigate],
  );
  const mapping = useMemo(() => {
    if (dynamicRowHeight) {
      const origin = snapshot.position;
      return {
        toPixel: (row: number) => sizes.distance(origin, row),
        toRow: (pixel: number) => sizes.advance(origin, pixel),
      };
    }
    return {
      toPixel: (row: number) => rowToPixel(row, snapshot.position, rowHeight),
      toRow: (pixel: number) => pixelToRow(pixel, snapshot.position, rowHeight),
    };
    // `sizes` mutates in place; layoutVersion is the signal that its measurements changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    snapshot.position,
    snapshot.height,
    snapshot.rowCount,
    rowHeight,
    dynamicRowHeight,
    sizes,
    snapshot.layoutVersion,
  ]);
  const start = Math.max(0, Math.floor(mapping.toRow(0)) - overscan);
  const count = Math.max(
    0,
    Math.min(
      provider.rowCount - start,
      Math.ceil(mapping.toRow(snapshot.height)) - start + overscan,
    ),
  );
  const visibleStart = Math.max(0, Math.floor(mapping.toRow(0)));
  const visibleEnd = Math.min(provider.rowCount, Math.ceil(mapping.toRow(snapshot.height)));
  const visibleRange = { start: visibleStart, end: visibleEnd };
  useClientLayoutEffect(() => {
    latestVisibleRange.current = visibleRange;
  });
  useEffect(() => {
    if (!viewport) return;
    let width = viewport.clientWidth;
    const observer = new ResizeObserver(() => {
      engine.setViewport(viewport.clientHeight);
      if (dynamicRowHeight && viewport.clientWidth !== width) {
        width = viewport.clientWidth;
        engine.resetMeasurements();
        measurements.measure();
      }
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewport, engine, dynamicRowHeight, measurements]);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const onVelocity = (value: number) => {
      velocity.current = value;
    };
    // The page layout scrolls the document; the embedded viewport scrolls itself.
    if (windowScroll) return bindScroll(window, engine, { onVelocity });
    if (!viewport) return;
    return bindScroll(viewport, engine, { layer, onVelocity });
  }, [viewport, layer, windowScroll, engine]);
  useRowRequests(engine, session, { start, count, prefetch: features.prefetch, velocity });
  // Session statistics include searches started through `session.search`.
  const stats: ScrollStats = {
    ...session.getStats(),
    measuredRows: snapshot.measuredRows,
  };
  const reportsStats = onStats !== undefined;
  useEffect(() => {
    if (reportsStats) latestOnStats.current?.(stats);
    // A new stats object is built on every render; report only when a value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    reportsStats,
    stats.cachedRows,
    stats.cachedBytes,
    stats.budgetOverage,
    stats.activeRequests,
    stats.abortedRequests,
    stats.completedFetches,
    stats.measuredRows,
  ]);
  const rows: RowSlot<Row>[] = Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    const common = {
      index,
      y: mapping.toPixel(index),
      height: dynamicRowHeight ? sizes.size(index) : rowHeight,
    };
    const row = session.read(index);
    const error = session.error(index);
    const estimate = features.progressiveEstimates ? bucketAt(session.overview, index) : undefined;
    return session.has(index)
      ? { ...common, status: 'ready', row: row as Row }
      : { ...common, status: error ? 'error' : 'loading', error, estimate };
  });
  const activateRow = (slot: RowSlot<Row>) => {
    if (!onRowActivate || slot.status !== 'ready') return;
    setRowFocus({ session, position: snapshot.position, index: slot.index });
    viewport?.focus({ preventScroll: true });
    onRowActivate({ row: slot.row, index: slot.index, rowNumber: slot.index + 1 });
  };
  const getViewportProps = (props: HTMLAttributes<HTMLDivElement> = {}): ViewportElementProps => ({
    ...props,
    ref: setViewport,
    id: `${id}-viewport`,
    role: 'grid',
    tabIndex: 0,
    'aria-rowcount': provider.rowCount,
    'aria-activedescendant': rows.some((row) => row.index === focusedIndex)
      ? `${id}-row-${focusedIndex}`
      : undefined,
    'aria-description':
      props['aria-description'] ??
      (onRowActivate ? 'Press Enter to inspect the focused row.' : undefined),
    className: `ds-viewport ${props.className ?? ''}`,
    'data-ds-part': 'viewport',
    style: {
      position: 'relative',
      overflowX: 'hidden',
      // The page layout scrolls the document instead, with this viewport fixed in place.
      overflowY: windowScroll ? 'hidden' : 'auto',
      // Rows are replaced as they scroll; the browser must not shift the offset to keep one.
      overflowAnchor: 'none',
      minWidth: 0,
      flex: 1,
      ...props.style,
    } as CSSProperties,
    onClick: (event: React.MouseEvent<HTMLDivElement>) => {
      props.onClick?.(event);
      if (event.defaultPrevented || isControl(event.target)) return;
      if (
        onRowActivate &&
        event.target === event.currentTarget &&
        event.button === 0 &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        event.currentTarget.ownerDocument.getSelection()?.isCollapsed !== false
      ) {
        // Touch pointer capture retargets a tap to the viewport instead of its row.
        const index = Math.floor(
          mapping.toRow(event.clientY - event.currentTarget.getBoundingClientRect().top),
        );
        const slot = rows.find((row) => row.index === index);
        if (slot) activateRow(slot);
      }
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      props.onKeyDown?.(event);
      if (event.defaultPrevented || ownsKeys(event.target)) return;
      if (onRowActivate && !event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
        if (event.key === 'Enter') {
          const slot = rows.find((row) => row.index === focusedIndex);
          if (slot?.status === 'ready') {
            event.preventDefault();
            if (!event.repeat) activateRow(slot);
          }
          return;
        }
        if (focusedIndex !== null && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          event.preventDefault();
          const index = clamp(
            focusedIndex + (event.key === 'ArrowDown' ? 1 : -1),
            0,
            provider.rowCount - 1,
          );
          engine.scrollToIndex(index, { align: 'auto', history: 'skip', reason: 'keyboard' });
          setRowFocus({ session, position: engine.getSnapshot().position, index });
          setAnnouncement(`Row ${index + 1}`);
          return;
        }
      }
      handleViewportKey(event, {
        engine,
        openSearch: latestOnOpenSearch.current && (() => latestOnOpenSearch.current?.('')),
        announce: setAnnouncement,
      });
    },
  });
  return {
    api,
    provider,
    snapshot,
    rows,
    visibleRange,
    focusedIndex,
    selection,
    markers,
    chapter: chapterAt(session.chapters, snapshot.position) ?? null,
    stats,
    unseenRows,
    [INTERNAL]: {
      id,
      engine,
      session,
      mapping,
      features,
      reduceMotion,
      append,
    },
    getViewportProps,
    getLayerProps: (props: HTMLAttributes<HTMLDivElement> = {}): LayerElementProps => ({
      ...props,
      ref: setLayer,
      role: 'rowgroup',
      className: `ds-view-layer ${props.className ?? ''}`.trim(),
      'data-ds-part': 'layer',
      style: {
        ...props.style,
        // The scroll binding owns `transform`; rows outside the viewport are clipped.
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
      } as CSSProperties,
    }),
    getRowProps: (
      slot: RowSlot<Row>,
      props: HTMLAttributes<HTMLDivElement> = {},
    ): RowElementProps => {
      const selected = selection
        ? slot.index >= selection.start && slot.index < selection.end
        : undefined;
      return {
        ...props,
        ref: dynamicRowHeight && slot.status === 'ready' ? measurements.ref(slot.index) : undefined,
        role: 'row',
        'aria-rowindex': slot.index + 1,
        id: `${id}-row-${slot.index}`,
        className:
          `ds-row${dynamicRowHeight ? ' ds-row-dynamic' : ''} ${props.className ?? ''}`.trim(),
        'data-ds-part': 'row',
        'data-status': slot.status,
        'aria-selected': selected,
        'data-selected': selected || undefined,
        'data-focused': slot.index === focusedIndex || undefined,
        'data-activatable': (!!onRowActivate && slot.status === 'ready') || undefined,
        onClick: (event: React.MouseEvent<HTMLDivElement>) => {
          props.onClick?.(event);
          if (
            !onRowActivate ||
            slot.status !== 'ready' ||
            event.defaultPrevented ||
            ownsKeys(event.target) ||
            event.button !== 0 ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            viewport?.ownerDocument.getSelection()?.isCollapsed === false
          )
            return;
          activateRow(slot);
        },
        style: {
          ...props.style,
          position: 'absolute',
          boxSizing: 'border-box',
          top: 0,
          left: 0,
          right: 0,
          height: dynamicRowHeight && slot.status === 'ready' ? 'auto' : slot.height,
          minHeight: dynamicRowHeight ? 1 : undefined,
          transform: `translateY(${slot.y}px)`,
        } as CSSProperties,
      };
    },
    getAnnouncementProps: () => ({
      className: 'ds-sr',
      style: {
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        overflow: 'hidden',
        clipPath: 'inset(50%)',
        whiteSpace: 'nowrap',
        border: 0,
      } as CSSProperties,
      'aria-live': 'polite' as const,
      children: announcement,
    }),
  };
}

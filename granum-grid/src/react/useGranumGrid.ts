import {
  useEffect,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type Dispatch,
  type HTMLAttributes,
  type SetStateAction,
} from 'react';
import {
  createEngine,
  createZoomMapping,
  pixelToRow,
  rowToPixel,
  type CoordinateMapping,
  type GranumGridEngine,
  type NavigationEvent,
  type NavigationSnapshot,
  type View,
  type NavigationLocation,
} from '../core/index.js';
import { clamp, ROW_DETAIL_MAX_ROWS_PER_PIXEL } from '../core/mappings.js';
import { validRange } from '../data/bounds.js';
import { createGranumGridApi, type GranumGridApi } from '../core/api.js';
import { useWindowScroll } from './useWindowScroll.js';
import { useRowMeasurements } from './useRowMeasurements.js';
import { bindInputs } from './input.js';
import { isControl } from './dom.js';
import { useFrameRate } from './useFrameRate.js';
import { useKeyed } from './useKeyed.js';
import { useReducedMotion } from './useReducedMotion.js';
import { useLatest } from './useLatest.js';
import { useFollowOutput } from './useFollowOutput.js';
import { useRowRequests } from './useRowRequests.js';
import { handleViewportKey } from './keyboard.js';
import { chapterAt } from '../core/navigation.js';
import { DataSession } from '../data/session.js';
import { defaultFeatures, type Features } from '../features.js';
import type { CacheOptions, DataProvider, Marker, RowSlot, RowRange } from '../data/types.js';
export interface ScrollStats {
  cachedRows: number;
  cachedBytes: number;
  budgetOverage: number;
  activeRequests: number;
  abortedRequests: number;
  completedFetches: number;
  fps: number | null;
  measuredRows: number;
}
export interface UseGranumGridOptions<Row> {
  provider: DataProvider<Row>;
  scrollMode?: 'embedded' | 'window';
  /** Snapshot by default. Append allows increasing counts without changing existing rows. */
  dataMode?: 'snapshot' | 'append';
  /** With `dataMode="append"`, follow new rows when already at the end. */
  followOutput?: boolean;
  selection?: RowRange | null;
  initialSelection?: RowRange | null;
  onSelectionChange?(range: RowRange | null): void;
  rowHeight?: number;
  /** Automatically measure loaded row content; rowHeight becomes the estimate. */
  dynamicRowHeight?: boolean;
  maxMeasuredRows?: number;
  /** Extra rows on each side in Rows/detail Zoom views. Default: 2. */
  overscan?: number;
  /** Target summary band height in pixels; controls bounded aggregate resolution. */
  aggregateRowHeight?: number;
  initialLocation?: NavigationLocation;
  initialIndex?: number;
  initialView?: View;
  cache?: CacheOptions<Row>;
  features?: Partial<Features>;
  reducedMotion?: 'system' | boolean;
  onNavigate?(event: NavigationEvent): void;
  onStats?(stats: ScrollStats): void;
  /**
   * Sample frame delivery while moving for `stats.fps`; each sample re-renders the explorer.
   * Default: true when `onStats` is provided, otherwise `stats.fps` is null.
   */
  measureFrameRate?: boolean;
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
}
interface AnnouncementProps {
  className: string;
  style: CSSProperties;
  'aria-live': 'polite';
  children: string;
}
/** What `useGranumGrid` returns. Declared explicitly so published types never follow internals. */
export interface GranumGridState<Row> {
  /** Prefix for element ids within this explorer. */
  id: string;
  /** Mounted provider and controller for host integrations. */
  api: GranumGridApi<Row>;
  controller: GranumGridEngine;
  provider: DataProvider<Row>;
  /** Row pages, metadata, and requests for the current provider revision. */
  session: DataSession<Row>;
  snapshot: NavigationSnapshot;
  /** Bounded row slots to render: ready rows or placeholders. */
  rows: RowSlot<Row>[];
  mapping: CoordinateMapping;
  /** Rows in view as a half-open range. */
  visibleRange: RowRange;
  /** The latest visible range, for event handlers that should not re-render on scroll. */
  getVisibleRange: () => RowRange;
  aggregateMode: boolean;
  aggregateBuckets: number;
  scrollMode: 'embedded' | 'window';
  dataMode: 'snapshot' | 'append';
  features: Features;
  reduceMotion: boolean;
  stats: ScrollStats;
  /** Rows appended while the reader was away from the end (`followOutput`). */
  unseenRows: number;
  selection: RowRange | null;
  setSelection: (value: RowRange | null) => void;
  selectionMode: boolean;
  setSelectionMode: Dispatch<SetStateAction<boolean>>;
  /** Whether the search dialog is open. Custom toolbars open it with `setJumpOpen(true)`. */
  jumpOpen: boolean;
  setJumpOpen: Dispatch<SetStateAction<boolean>>;
  /** Search dialog state shared with `JumpBar` and the map; not needed by custom rows. */
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  searchMarkers: Marker[];
  setSearchMarkers: Dispatch<SetStateAction<Marker[]>>;
  /** Provider markers and saved bookmarks in row order, used by the map, N/P, and search. */
  markers: Marker[];
  /** Show saved places as `bookmark` markers; `ExplorerTools` publishes its bookmarks here. */
  setBookmarkMarkers: (markers: Marker[]) => void;
  setSearchBusy: Dispatch<SetStateAction<boolean>>;
  /** Polite screen reader announcement for the latest navigation. */
  announcement: string;
  /** Edge elasticity offset in pixels. */
  edgeOffset: number;
  getViewportProps: (props?: HTMLAttributes<HTMLDivElement>) => ViewportElementProps;
  getRowProps: (slot: RowSlot<Row>, props?: HTMLAttributes<HTMLDivElement>) => RowElementProps;
  getAnnouncementProps: () => AnnouncementProps;
}
export function useGranumGrid<Row>({
  provider,
  scrollMode = 'embedded',
  followOutput: requestedFollowOutput,
  dataMode,
  selection: controlledSelection,
  initialSelection = null,
  onSelectionChange,
  rowHeight = 32,
  dynamicRowHeight = false,
  maxMeasuredRows = 4096,
  overscan = 2,
  aggregateRowHeight = 4,
  initialLocation,
  initialIndex = 0,
  initialView = 'rows',
  cache,
  features: overrides,
  reducedMotion = 'system',
  onNavigate,
  onStats,
  measureFrameRate = onStats !== undefined,
}: UseGranumGridOptions<Row>): GranumGridState<Row> {
  const append = dataMode === 'append';
  if (!append && requestedFollowOutput !== undefined)
    throw new Error('followOutput requires dataMode="append"');
  const followOutput = append ? (requestedFollowOutput ?? false) : undefined;
  if (!Number.isSafeInteger(overscan) || overscan < 0 || overscan > 1000)
    throw new RangeError('overscan must be an integer from 0 to 1000');
  if (!Number.isFinite(aggregateRowHeight) || aggregateRowHeight < 1)
    throw new RangeError('aggregateRowHeight must be positive');
  const features = { ...defaultFeatures, ...overrides };
  const id = useId();
  const [speedSpan, setSpeedSpan] = useState(0);
  const [edgeOffset, setEdgeOffset] = useState(0);
  const velocity = useRef(0);
  const [searchBusy, setSearchBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [searchMarkers, setSearchMarkers] = useState<Marker[]>([]);
  const reduceMotion = useReducedMotion(reducedMotion);
  // Reduced motion turns off every animated or momentum behavior; resolve it once here.
  const flight = !reduceMotion && features.flight;
  const inertia = !reduceMotion && features.inertia;
  const elasticity = !reduceMotion && features.edgeElasticity;
  const automaticAggregation = !reduceMotion && features.automaticAggregation;
  const engine = useKeyed(
    () =>
      createEngine({
        rowCount: provider.rowCount,
        rowHeight,
        initialIndex,
        initialView,
        dynamicRowHeight,
        maxMeasuredRows,
        initialLocation,
      }),
    [
      provider.id,
      provider.revision,
      // Append mode keeps the engine across count changes; snapshots rebuild it.
      append ? null : provider.rowCount,
      append,
      rowHeight,
      dynamicRowHeight,
      maxMeasuredRows,
    ],
  );
  const [searchState, setSearchState] = useState({ engine, open: false, query: '' });
  const jumpOpen = searchState.engine === engine && searchState.open;
  const searchQuery = searchState.engine === engine ? searchState.query : '';
  const setJumpOpen = useCallback<Dispatch<SetStateAction<boolean>>>(
    (value) => {
      setSearchState((current) => {
        const wasOpen = current.engine === engine && current.open;
        const open = typeof value === 'function' ? value(wasOpen) : value;
        return { engine, open, query: open && !wasOpen ? '' : current.query };
      });
    },
    [engine],
  );
  const setSearchQuery = useCallback<Dispatch<SetStateAction<string>>>(
    (value) => {
      setSearchState((current) => ({
        engine,
        open: current.engine === engine && current.open,
        query:
          typeof value === 'function'
            ? value(current.engine === engine ? current.query : '')
            : value,
      }));
    },
    [engine],
  );
  const openSearch = useCallback(
    (query: string) => {
      setSearchState({ engine, open: true, query });
    },
    [engine],
  );
  useWindowScroll(engine, scrollMode === 'window');
  const [selectionState, setSelectionState] = useState({ engine, value: initialSelection });
  const [selectionMode, setSelectionMode] = useState(false);
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
  const api = useMemo(
    () =>
      createGranumGridApi(provider, engine, {
        getSelection: () => latestSelection.current,
        setSelection,
        openSearch,
      }),
    [provider, engine, setSelection, openSearch, latestSelection],
  );
  useEffect(() => setSelectionMode(false), [engine]);
  const measurements = useRowMeasurements(engine);
  const sizes = engine.rowSizes;
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  useEffect(() => {
    if (dynamicRowHeight && snapshot.measuredRows === 0) measurements.measure();
  }, [dynamicRowHeight, measurements, snapshot.layoutVersion, snapshot.measuredRows]);
  const fps = useFrameRate(snapshot.position, measureFrameRate);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const session = useKeyed(
    () => new DataSession(provider, cache),
    [
      append ? provider.id : provider,
      append,
      provider.id,
      provider.revision,
      append ? null : provider.rowCount,
      cache?.maxBytes,
      cache?.pageSize,
      cache?.estimateRowBytes,
      cache?.requestTimeoutMs,
    ],
  );
  const unseenRows = useFollowOutput(engine, session, provider, followOutput, snapshot);
  useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);
  const identity = `${provider.id}:${provider.revision}`;
  // Keyed by dataset so a provider switch never shows the previous dataset's bookmarks.
  const [bookmarks, setBookmarks] = useState({ identity, markers: [] as Marker[] });
  const setBookmarkMarkers = useCallback(
    (markers: Marker[]) => setBookmarks({ identity, markers }),
    [identity],
  );
  const markers = useMemo(() => {
    const saved =
      bookmarks.identity === identity
        ? bookmarks.markers.filter((marker) => marker.index < provider.rowCount)
        : [];
    return saved.length
      ? [...session.markers, ...saved].sort((a, b) => a.index - b.index)
      : session.markers;
  }, [session.markers, bookmarks, identity, provider.rowCount]);
  useEffect(() => {
    engine.setMetadata(markers, session.chapters);
  }, [engine, markers, session.chapters]);
  useEffect(() => {
    engine.setMotion(flight);
  }, [engine, flight]);
  useEffect(
    () =>
      engine.onNavigate((event) => {
        const chapter = chapterAt(session.chapters, event.to.position);
        setAnnouncement(
          `Jumped to row ${(Math.floor(event.to.position) + 1).toLocaleString()}${chapter ? `, ${chapter.label}` : ''}`,
        );
        latestOnNavigate.current?.(event);
      }),
    [engine, session, latestOnNavigate],
  );
  useEffect(() => {
    if (!snapshot.moving) return;
    let frame = requestAnimationFrame(function animate(time) {
      if (engine.step(time)) frame = requestAnimationFrame(animate);
    });
    return () => cancelAnimationFrame(frame);
  }, [engine, snapshot.moving]);
  const temporarySpan = Math.max(snapshot.flightSpan, automaticAggregation ? speedSpan : 0);
  // Long flights and fast flings show the overview instead of rows they would skip past.
  const traveling = temporarySpan > (snapshot.height / rowHeight) * 3;
  const aggregateMode =
    traveling ||
    (snapshot.view === 'zoom' && snapshot.rowsPerPixel > ROW_DETAIL_MAX_ROWS_PER_PIXEL);
  const mapping = useMemo(() => {
    if (traveling)
      return createZoomMapping(
        snapshot.position,
        snapshot.height,
        Math.max(1 / rowHeight, temporarySpan / snapshot.height),
      );
    if (dynamicRowHeight && !aggregateMode) {
      const origin = snapshot.position + (snapshot.view === 'zoom' ? 0.5 : 0);
      const offset = snapshot.view === 'zoom' ? snapshot.height / 2 : 0;
      return {
        toPixel: (row: number) => offset + sizes.distance(origin, row),
        toRow: (pixel: number) => sizes.advance(origin, pixel - offset),
      };
    }
    if (snapshot.view === 'zoom')
      return createZoomMapping(snapshot.position, snapshot.height, snapshot.rowsPerPixel);
    return {
      toPixel: (row: number) => rowToPixel(row, snapshot.position, rowHeight),
      toRow: (pixel: number) => pixelToRow(pixel, snapshot.position, rowHeight),
    };
    // `sizes` mutates in place; layoutVersion is the signal that its measurements changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    snapshot.position,
    snapshot.view,
    snapshot.height,
    snapshot.rowsPerPixel,
    temporarySpan,
    traveling,
    snapshot.rowCount,
    rowHeight,
    dynamicRowHeight,
    aggregateMode,
    sizes,
    snapshot.layoutVersion,
  ]);
  const start = aggregateMode
    ? Math.floor(snapshot.position)
    : Math.max(0, Math.floor(mapping.toRow(0)) - overscan);
  const count = aggregateMode
    ? 0
    : Math.max(
        0,
        Math.min(
          provider.rowCount - start,
          Math.ceil(mapping.toRow(snapshot.height)) - start + overscan,
        ),
      );
  const aggregateStart = Math.max(0, Math.floor(mapping.toRow(0)));
  const aggregateEnd = Math.min(provider.rowCount, Math.ceil(mapping.toRow(snapshot.height)));
  const visibleRange = { start: aggregateStart, end: aggregateEnd };
  // Actions read the latest range without making their components render on every frame.
  const latestVisibleRange = useLatest(visibleRange);
  const getVisibleRange = useCallback(
    (): RowRange => latestVisibleRange.current,
    [latestVisibleRange],
  );
  // At either endpoint, only part of the centered viewport contains data.
  // Size summary bands for that occupied area so their actions remain readable.
  const aggregateHeight = Math.max(
    0,
    Math.min(snapshot.height, mapping.toPixel(aggregateEnd)) -
      Math.max(0, mapping.toPixel(aggregateStart)),
  );
  const aggregateBuckets = Math.max(
    1,
    Math.min(160, Math.floor(aggregateHeight / aggregateRowHeight)),
  );
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
  useEffect(() => {
    if (!viewport) return;
    return bindInputs(viewport, engine, {
      windowScroll: scrollMode === 'window',
      inertia,
      elasticity,
      automaticAggregation,
      onSpeed: setSpeedSpan,
      onEdge: setEdgeOffset,
      onVelocity: (value) => {
        velocity.current = value;
      },
    });
  }, [viewport, scrollMode, engine, inertia, elasticity, automaticAggregation]);
  useRowRequests(engine, session, snapshot.moving, snapshot.targetIndex, {
    start,
    count,
    destinationCount: Math.ceil(snapshot.height / rowHeight) + overscan,
    prefetch: features.prefetch,
    velocity,
    aggregates:
      aggregateMode && !snapshot.moving && aggregateEnd > aggregateStart
        ? { start: aggregateStart, end: aggregateEnd, buckets: aggregateBuckets }
        : null,
  });
  const sessionStats = session.getStats();
  const stats: ScrollStats = {
    ...sessionStats,
    activeRequests: sessionStats.activeRequests + (searchBusy ? 1 : 0),
    fps,
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
    fps,
    stats.measuredRows,
  ]);
  const rows: RowSlot<Row>[] = Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    const common = {
      index,
      y: mapping.toPixel(index),
      height: dynamicRowHeight
        ? sizes.size(index)
        : snapshot.view === 'zoom'
          ? 1 / snapshot.rowsPerPixel
          : rowHeight,
    };
    const row = session.read(index);
    const error = session.error(index);
    const estimate = features.progressiveEstimates
      ? session.overview.find((bucket) => index >= bucket.start && index < bucket.end)
      : undefined;
    return session.has(index)
      ? { ...common, status: 'ready', row: row as Row }
      : { ...common, status: error ? 'error' : 'loading', error, estimate };
  });
  const getViewportProps = (props: HTMLAttributes<HTMLDivElement> = {}): ViewportElementProps => ({
    ...props,
    ref: setViewport,
    id: `${id}-viewport`,
    role: 'grid',
    tabIndex: 0,
    'aria-rowcount': provider.rowCount,
    'aria-activedescendant': rows.some((row) => row.index === snapshot.activeIndex)
      ? `${id}-row-${snapshot.activeIndex}`
      : undefined,
    className: `ds-viewport ${props.className ?? ''}`,
    'data-ds-part': 'viewport',
    style: {
      position: 'relative',
      overflow: 'hidden',
      minWidth: 0,
      flex: 1,
      touchAction: 'none',
      ...props.style,
    } as CSSProperties,
    onClick: (event: React.MouseEvent<HTMLDivElement>) => {
      props.onClick?.(event);
      if (event.defaultPrevented || isControl(event.target)) return;
      if (aggregateMode) {
        const index = Math.round(
          clamp(
            mapping.toRow(event.clientY - event.currentTarget.getBoundingClientRect().top),
            0,
            Math.max(0, provider.rowCount - 1),
          ),
        );
        engine.goTo(index, { reason: 'jump' });
      }
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      props.onKeyDown?.(event);
      if (event.defaultPrevented || isControl(event.target)) return;
      handleViewportKey(event, {
        engine,
        openJump: () => setJumpOpen(true),
        announce: setAnnouncement,
      });
    },
  });
  return {
    id,
    api,
    unseenRows,
    selection,
    setSelection,
    selectionMode,
    setSelectionMode,
    scrollMode,
    dataMode: append ? 'append' : 'snapshot',
    controller: engine,
    snapshot,
    rows,
    provider,
    session,
    stats,
    features,
    reduceMotion,
    announcement,
    searchMarkers,
    setSearchMarkers,
    markers,
    setBookmarkMarkers,
    jumpOpen,
    setJumpOpen,
    searchQuery,
    setSearchQuery,
    mapping,
    aggregateMode,
    visibleRange,
    getVisibleRange,
    aggregateBuckets,
    edgeOffset,
    setSearchBusy,
    getViewportProps,
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
        'data-focused': slot.index === snapshot.activeIndex || undefined,
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

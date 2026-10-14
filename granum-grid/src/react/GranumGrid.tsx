import {
  memo,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type Key,
} from 'react';
import type { GranumGridApi } from '../core/api.js';
import { useGranumGrid, type UseGranumGridOptions, type GranumGridState } from './useGranumGrid.js';
import { partProps, type GranumGridAppearance } from './styling.js';
import { ContextHints } from './ContextHints.js';
import { ViewCanvas } from './ViewCanvas.js';
import { JumpBar } from './JumpBar.js';
import { AtlasRail, type AtlasRailOptions, type AtlasRailProps } from './AtlasRail.js';
import { ExplorerTools } from './ExplorerTools.js';
import { Footer, RowPlaceholder, Toolbar, type ToolbarOptions } from './ExplorerChrome.js';
import { CompareRanges } from './CompareRanges.js';
import { INTERNAL } from './internal.js';
import { overviewAccuracy } from '../visuals/atlas.js';
import { chapterName, rangeAddress } from '../visuals/format.js';
import { isTextEntry, isWithin } from './dom.js';
import { isSearchShortcut } from './keyboard.js';
import { useClientLayoutEffect } from './useClientLayoutEffect.js';
import { useOwnedState } from './useOwnedState.js';
import type { Marker, PendingRowSlot, RowRange } from '../data/types.js';
export type { ToolbarOptions };
export interface RowRenderContext<Row> {
  row: Row;
  /** Zero-based address in the current provider. */
  index: number;
  /** One-based display number. */
  rowNumber: number;
  focused: boolean;
}
/** Configure the selection, bookmark, and comparison tools through the `tools` prop. */
export interface ToolsOptions {
  /** Persist bookmarks in localStorage under this key. Default: only while mounted. */
  storageKey?: string;
  /** Describe a half-open range in domain units, such as elapsed time or base pairs. */
  formatRange?(range: RowRange): string;
}
/** Configure the first-run hints for the map, search, and Back through the `hints` prop. */
export interface HintsOptions {
  /** Remember dismissed hints in localStorage under this key. Default: only while mounted. */
  storageKey?: string;
}
/**
 * The explorer, built from `useGranumGrid`, `AtlasRail`, and `JumpBar`. Each region prop
 * (`toolbar`, `tools`, `rail`, `footer`, `hints`) takes `false` to hide the region, an
 * options object to configure it, or, where offered, a function to render your own.
 */
export interface GranumGridProps<Row>
  extends Omit<UseGranumGridOptions<Row>, 'onOpenSearch'>, GranumGridAppearance {
  /** Accessible name of the rows grid. */
  ariaLabel: string;
  renderRow(context: RowRenderContext<Row>): ReactNode;
  /** Content for a loading or failed row; `retry` requests failed pages again. */
  renderPlaceholder?(slot: PendingRowSlot, retry: () => void): ReactNode;
  /** Stable React key for a loaded row. Default: its index. */
  getRowKey?(row: Row, index: number): Key;
  /** Column headings above the rows. Default: "RECORDS". */
  header?: ReactNode;
  emptyContent?: ReactNode;
  /** Keep the current provider chapter above the rows. */
  stickyChapters?: boolean;
  /** The mounted handle (`GranumGridApi`); null after unmount. */
  apiRef?: Ref<GranumGridApi<Row>>;
  /** History, breadcrumb, and search. A function receives the hook state. */
  toolbar?: boolean | ToolbarOptions | ((grid: GranumGridState<Row>) => ReactNode);
  /** Selection, bookmarks, and range comparison. */
  tools?: boolean | ToolsOptions;
  /**
   * The dataset map. A function receives the built-in map's props, including the explorer's
   * search highlights and map selection; spread them into your own `AtlasRail`.
   */
  rail?:
    | boolean
    | AtlasRailOptions
    | ((grid: GranumGridState<Row>, rail: AtlasRailProps<Row>) => ReactNode);
  /** Current row and progress. A function receives the hook state. */
  footer?: boolean | ((grid: GranumGridState<Row>) => ReactNode);
  /** First-run hints for the map, search, and Back. */
  hints?: boolean | HintsOptions;
  theme?: 'system' | 'dark' | 'light';
  /** Opt out of the optional skin, even when styles.css is loaded elsewhere. */
  unstyled?: boolean;
  className?: string;
  style?: CSSProperties;
}
/** The options object of a region prop, or none when the region is hidden or replaced. */
function optionsOf<Options extends object>(region: unknown): Options | undefined {
  return typeof region === 'object' && region !== null ? (region as Options) : undefined;
}
interface LoadedRowProps<Row> {
  render: (context: RowRenderContext<Row>) => ReactNode;
  row: Row;
  index: number;
  focused: boolean;
}
const LoadedRow = memo(function LoadedRow<Row>({
  render,
  row,
  index,
  focused,
}: LoadedRowProps<Row>) {
  const content = render({ row, index, rowNumber: index + 1, focused });
  return typeof content === 'string' || typeof content === 'number' ? (
    <span role="gridcell">{content}</span>
  ) : (
    content
  );
}) as <Row>(props: LoadedRowProps<Row>) => ReactNode;

function DatasetRow({
  status,
  rowProps,
  children,
}: {
  status: string;
  rowProps: HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
}) {
  const wasReady = useRef(status === 'ready');
  const [arrival, setArrival] = useState(false);
  useClientLayoutEffect(() => {
    if (status !== 'ready') {
      wasReady.current = false;
      setArrival(false);
      return;
    }
    if (wasReady.current) return;
    wasReady.current = true;
    setArrival(true);
  }, [status]);
  return (
    <div {...rowProps} data-arrival={arrival || undefined}>
      {children}
    </div>
  );
}

const NO_MARKERS: Marker[] = [];
const CLOSED_SEARCH = { open: false, query: '' };

export function GranumGrid<Row>(props: GranumGridProps<Row>) {
  // Saved bookmarks join the host's markers; keyed by dataset so a switch never shows stale ones.
  const [bookmarkMarkers, setBookmarkMarkers] = useOwnedState(
    `${props.provider.id}:${props.provider.revision}`,
    NO_MARKERS,
  );
  const hostMarkers = props.markers;
  const explorerMarkers = useMemo(
    () =>
      hostMarkers?.length && bookmarkMarkers.length
        ? [...hostMarkers, ...bookmarkMarkers]
        : hostMarkers?.length
          ? hostMarkers
          : bookmarkMarkers,
    [hostMarkers, bookmarkMarkers],
  );
  const grid: GranumGridState<Row> = useGranumGrid<Row>({
    ...props,
    markers: explorerMarkers,
    // Read when a shortcut or `api.openSearch` fires, after this render has committed.
    onOpenSearch: (query) => setSearch({ open: true, query }),
  });
  useImperativeHandle(props.apiRef, () => grid.api, [grid.api]);
  const { snapshot, api } = grid;
  const { engine, session, mapping, features, reduceMotion, append, getVisibleRange } =
    grid[INTERNAL];
  // Search, map highlights, and map selection belong to one engine; a provider switch resets them.
  const [search, setSearch] = useOwnedState(engine, CLOSED_SEARCH);
  const [highlights, setHighlights] = useOwnedState(engine, NO_MARKERS);
  const [selecting, setSelecting] = useOwnedState(engine, false);
  const setSearchOpen = useCallback(
    (open: boolean) =>
      setSearch((current) => ({ open, query: open && !current.open ? '' : current.query })),
    [setSearch],
  );
  const setSearchQuery = useCallback(
    (query: string) => setSearch((current) => ({ ...current, query })),
    [setSearch],
  );
  // Tools and dialogs receive only what they use, so a scroll frame does not re-render them.
  const { provider, selection, markers } = grid;
  const explorerScroll = useMemo(
    () => ({ api, provider, selection, getVisibleRange, markers }),
    [api, provider, selection, getVisibleRange, markers],
  );
  // Depend on the settings comparison panes reuse, not the whole props object.
  const { rowHeight, dynamicRowHeight, theme, unstyled, classNames, styles, renderRow } = props;
  const comparisonHost = useMemo(
    () => ({
      provider,
      rowHeight,
      dynamicRowHeight,
      theme,
      unstyled,
      classNames,
      styles,
      renderRow,
    }),
    [provider, rowHeight, dynamicRowHeight, theme, unstyled, classNames, styles, renderRow],
  );
  const renderComparison = useCallback(
    (a: RowRange, b: RowRange, close: () => void) => (
      <CompareRanges a={a} b={b} host={comparisonHost} onClose={close} />
    ),
    [comparisonHost],
  );
  const rail: AtlasRailProps<Row> = {
    ...optionsOf<AtlasRailOptions>(props.rail),
    grid,
    highlights,
    selecting,
    onSelectingChange: setSelecting,
    className: props.classNames?.rail,
    style: props.styles?.rail,
  };
  const tools = optionsOf<ToolsOptions>(props.tools);
  const hints = optionsOf<HintsOptions>(props.hints);
  const contentEnd =
    !grid.traveling && snapshot.rowCount > 0 ? mapping.toPixel(snapshot.rowCount) : snapshot.height;
  const endGap = snapshot.height - contentEnd;
  return (
    <section
      className={`ds-root ${props.className ?? ''}`}
      data-ds-root=""
      data-layout={props.layout ?? 'embedded'}
      data-unstyled={props.unstyled || undefined}
      style={props.style}
      data-motion={!reduceMotion && features.transitions ? 'on' : 'off'}
      data-theme={props.theme ?? 'system'}
      onKeyDown={(event) => {
        // Nested explorers and the viewport handle their own shortcuts first.
        if (event.defaultPrevented) return;
        if (
          isSearchShortcut(event) &&
          !isTextEntry(event.target) &&
          !isWithin(event.target, 'dialog')
        ) {
          event.preventDefault();
          api.openSearch();
        }
      }}
      onAuxClick={(event) => {
        if (!event.defaultPrevented && (event.button === 3 || event.button === 4)) {
          event.preventDefault();
          event.button === 3 ? api.back() : api.forward();
        }
      }}
    >
      {typeof props.toolbar === 'function'
        ? props.toolbar(grid)
        : props.toolbar !== false && (
            <Toolbar grid={grid} appearance={props} {...optionsOf<ToolbarOptions>(props.toolbar)} />
          )}
      {props.tools !== false && (
        <ExplorerTools
          scroll={explorerScroll}
          selecting={selecting}
          onSelectingChange={setSelecting}
          onBookmarkMarkersChange={setBookmarkMarkers}
          storageKey={tools?.storageKey}
          formatRange={tools?.formatRange}
          renderComparison={renderComparison}
        />
      )}
      <div {...partProps('header', props, 'ds-legend')}>
        <span>{props.header ?? 'RECORDS'}</span>
        <span>
          <i />
          {props.provider.metric?.label ?? 'Dataset'} ·{' '}
          {overviewAccuracy(session.overview, props.provider.metric?.kind ?? 'value', {
            supported: !!props.provider.fetchOverview,
            failed: !!session.metadataErrors.overview,
          })}{' '}
          overview
        </span>
      </div>
      {append && (
        <div className="ds-live-status">
          <span>
            {grid.unseenRows ? `${grid.unseenRows.toLocaleString()} new rows` : 'Live · up to date'}
          </span>
          <button
            className="ds-button"
            onClick={() => api.scrollToIndex(Math.max(0, snapshot.rowCount - 1), { align: 'end' })}
          >
            Jump to latest
          </button>
        </div>
      )}
      {props.stickyChapters && grid.chapter && (
        <div className="ds-sticky-chapter">
          {chapterName(grid.chapter)} <span>{rangeAddress(grid.chapter)}</span>
        </div>
      )}
      <div {...partProps('body', props)}>
        <div
          {...grid.getViewportProps({
            'aria-label': props.ariaLabel,
            className: props.classNames?.viewport,
            style: props.styles?.viewport,
          })}
        >
          <div className="ds-pan-layer" style={{ transform: `translateY(${grid.edgeOffset}px)` }}>
            <div className="ds-view-layer" role="rowgroup">
              <ViewCanvas grid={grid} />
              {grid.traveling && (
                <div className="ds-aggregate-label">
                  Overview during travel
                  <span>Focus: row {((grid.focusedIndex ?? 0) + 1).toLocaleString()}</span>
                </div>
              )}
              {endGap > 0.5 && (
                <div
                  className="ds-dataset-end"
                  data-compact={endGap < 28 ? '' : undefined}
                  style={{ top: contentEnd, height: endGap }}
                  aria-hidden="true"
                >
                  <span>End of dataset</span>
                </div>
              )}
              {grid.rows.map((slot) => (
                <DatasetRow
                  key={
                    slot.status === 'ready' && props.getRowKey
                      ? `row:${props.getRowKey(slot.row, slot.index)}`
                      : `index:${slot.index}`
                  }
                  status={slot.status}
                  rowProps={grid.getRowProps(slot, {
                    className: props.classNames?.row,
                    style: props.styles?.row,
                  })}
                >
                  {slot.status === 'ready' ? (
                    <LoadedRow
                      render={props.renderRow}
                      row={slot.row}
                      index={slot.index}
                      focused={slot.index === grid.focusedIndex}
                    />
                  ) : (
                    (props.renderPlaceholder?.(slot, api.retry) ?? (
                      <RowPlaceholder slot={slot} retry={api.retry} />
                    ))
                  )}
                </DatasetRow>
              ))}
            </div>
          </div>
          {!snapshot.rowCount && (
            <div className="ds-empty">{props.emptyContent ?? 'No rows in this dataset.'}</div>
          )}
        </div>
        {typeof props.rail === 'function'
          ? props.rail(grid, rail)
          : props.rail !== false && <AtlasRail {...rail} />}
      </div>
      {Object.keys(session.metadataErrors).length > 0 && (
        <div className="ds-meta-error">
          Some summaries are unavailable.{' '}
          <button className="ds-button" onClick={() => api.retry()}>
            Retry summaries
          </button>
        </div>
      )}
      <ContextHints
        hints={props.hints !== false}
        canGoBack={snapshot.canGoBack}
        storageKey={hints?.storageKey}
        className={props.classNames?.hint}
        style={props.styles?.hint}
      />
      <JumpBar
        grid={grid}
        open={search.open}
        onOpenChange={setSearchOpen}
        query={search.query}
        onQueryChange={setSearchQuery}
        onHighlightsChange={setHighlights}
        className={props.classNames?.jump}
        style={props.styles?.jump}
      />
      <div {...grid.getAnnouncementProps()} />
      {typeof props.footer === 'function'
        ? props.footer(grid)
        : props.footer !== false && <Footer grid={grid} appearance={props} />}
    </section>
  );
}

import {
  memo,
  useCallback,
  useImperativeHandle,
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
import { ViewCanvas } from './ViewCanvas.js';
import { JumpBar } from './JumpBar.js';
import { AtlasRail, type AtlasRailOptions, type AtlasRailProps } from './AtlasRail.js';
import { Footer, RowPlaceholder, Toolbar, type ToolbarOptions } from './ExplorerChrome.js';
import { INTERNAL } from './internal.js';
import { overviewAccuracy } from '../visuals/atlas.js';
import { chapterName, rangeAddress } from '../visuals/format.js';
import { isTextEntry, isWithin } from './dom.js';
import { isSearchShortcut } from './keyboard.js';
import { useClientLayoutEffect } from './useClientLayoutEffect.js';
import { useOwnedState } from './useOwnedState.js';
import type { Marker, PendingRowSlot } from '../data/types.js';
export type { ToolbarOptions };
export interface RowRenderContext<Row> {
  row: Row;
  /** Zero-based address in the current provider. */
  index: number;
  /** One-based display number. */
  rowNumber: number;
  focused: boolean;
}
/**
 * The explorer, built from `useGranumGrid`, `AtlasRail`, and `JumpBar`. By default it shows
 * rows and the dataset map. The `toolbar`, `rail`, and `footer` regions take `true` or an
 * options object to show the built-in region, `false` to hide it, or a function to render
 * your own; only `rail` is shown when omitted. `panel` is empty unless the host fills it.
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
  /** Column headings above the rows, with the map's metric and overview accuracy. */
  header?: ReactNode;
  emptyContent?: ReactNode;
  /** Keep the current provider chapter above the rows. */
  stickyChapters?: boolean;
  /** The mounted handle (`GranumGridApi`); null after unmount. */
  apiRef?: Ref<GranumGridApi<Row>>;
  /** History, breadcrumb, and search. Hidden unless set. A function receives the hook state. */
  toolbar?: boolean | ToolbarOptions | ((grid: GranumGridState<Row>) => ReactNode);
  /**
   * Host content between the toolbar and the rows, such as selection or bookmark tools.
   * A function receives the hook state and re-renders while the rows move; prefer an element
   * that reads `apiRef` when it does not need per-frame state.
   */
  panel?: ReactNode | ((grid: GranumGridState<Row>) => ReactNode);
  /**
   * The dataset map. A function receives the built-in map's props, including the explorer's
   * search highlights; spread them into your own `AtlasRail`.
   */
  rail?:
    | boolean
    | AtlasRailOptions
    | ((grid: GranumGridState<Row>, rail: AtlasRailProps<Row>) => ReactNode);
  /** Current row and progress. Hidden unless set. A function receives the hook state. */
  footer?: boolean | ((grid: GranumGridState<Row>) => ReactNode);
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
  const grid: GranumGridState<Row> = useGranumGrid<Row>({
    ...props,
    // Read when a shortcut or `api.openSearch` fires, after this render has committed.
    onOpenSearch: (query) => setSearch({ open: true, query }),
  });
  useImperativeHandle(props.apiRef, () => grid.api, [grid.api]);
  const { snapshot, api } = grid;
  const { engine, session, mapping, features, reduceMotion, append } = grid[INTERNAL];
  // Search and map highlights belong to one engine; a provider switch resets them.
  const [search, setSearch] = useOwnedState(engine, CLOSED_SEARCH);
  const [highlights, setHighlights] = useOwnedState(engine, NO_MARKERS);
  const setSearchOpen = useCallback(
    (open: boolean) =>
      setSearch((current) => ({ open, query: open && !current.open ? '' : current.query })),
    [setSearch],
  );
  const setSearchQuery = useCallback(
    (query: string) => setSearch((current) => ({ ...current, query })),
    [setSearch],
  );
  const rail: AtlasRailProps<Row> = {
    ...optionsOf<AtlasRailOptions>(props.rail),
    grid,
    highlights,
    className: props.classNames?.rail,
    style: props.styles?.rail,
  };
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
        : props.toolbar && (
            <Toolbar grid={grid} appearance={props} {...optionsOf<ToolbarOptions>(props.toolbar)} />
          )}
      {typeof props.panel === 'function' ? props.panel(grid) : props.panel}
      {props.header != null && (
        <div {...partProps('header', props, 'ds-legend')}>
          <span>{props.header}</span>
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
      )}
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
        : props.footer && <Footer grid={grid} appearance={props} />}
    </section>
  );
}

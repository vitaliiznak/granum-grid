import {
  memo,
  useCallback,
  useImperativeHandle,
  useMemo,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type Key,
} from 'react';
import type { GranumGridEngine } from '../core/engine.js';
import type { GranumGridApi } from '../core/api.js';
import { useGranumGrid, type UseGranumGridOptions, type GranumGridState } from './useGranumGrid.js';
import { partProps, type GranumGridAppearance } from './styling.js';
import { ContextHints } from './ContextHints.js';
import { ViewGuide } from './ViewGuide.js';
import { ViewLayer } from './ViewLayer.js';
import { ViewCanvas } from './ViewCanvas.js';
import { AggregateLayer, type AggregateRenderContext } from './AggregateLayer.js';
import { JumpBar } from './JumpBar.js';
import { AtlasRail, type AtlasRailOptions } from './AtlasRail.js';
import { ExplorerTools } from './ExplorerTools.js';
import { Footer, RowPlaceholder, ScaleBar, Toolbar } from './ExplorerChrome.js';
import { CompareRanges } from './CompareRanges.js';
import { overviewAccuracy } from '../visuals/atlas.js';
import { rangeAddress } from '../visuals/format.js';
import { chapterAt } from '../core/navigation.js';
import { isTextEntry, isWithin } from './dom.js';
import type { SavedView } from '../core/exploration.js';
import type { PendingRowSlot, RowRange } from '../data/types.js';
export interface RowRenderContext<Row> {
  row: Row;
  index: number;
  rowNumber: number;
  focused: boolean;
}
export interface GranumGridProps<Row> extends UseGranumGridOptions<Row>, GranumGridAppearance {
  header?: ReactNode;
  renderRow(context: RowRenderContext<Row>): ReactNode;
  renderPlaceholder?(slot: PendingRowSlot): ReactNode;
  /** Render domain-specific content inside a summary band in Overview. */
  renderAggregate?(context: AggregateRenderContext): ReactNode;
  /** Describe a half-open range in domain units, such as elapsed time or base pairs. */
  formatRange?(range: RowRange): string;
  /** Target rows per summary bucket. Host labels may use fixed durations or domain units. */
  summaryBucketSizes?: readonly { label: string; rows: number }[];
  /** A readable size for a group of rows, such as "1 hour" for second-indexed data. */
  formatBucketSize?(rows: number): string;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
  theme?: 'system' | 'dark' | 'light';
  /** Opt out of the optional skin, even when styles.css is loaded elsewhere. */
  unstyled?: boolean;
  controllerRef?: Ref<GranumGridEngine>;
  /** Access the mounted provider and controller from a host integration. */
  apiRef?: Ref<GranumGridApi<Row>>;
  getRowKey?(row: Row, index: number): Key;
  emptyContent?: ReactNode;
  atlas?: AtlasRailOptions;
  /** Page owns the document scroll surface; mount one per page. */
  layout?: 'embedded' | 'page';
  exploration?: boolean;
  bookmarkStorageKey?: string;
  fullPageUrl?(view: SavedView): string;
  stickyChapters?: boolean;
  showStats?: boolean;
  /** Append host controls to the built-in toolbar. */
  toolbarActions?: ReactNode;
  /** Append host controls beside the dataset map title. */
  railActions?: ReactNode;
  /** Replace the built-in controls with your own React components. Return null to hide. */
  renderToolbar?(scroll: GranumGridState<Row>): ReactNode;
  renderFooter?(scroll: GranumGridState<Row>): ReactNode;
  renderRail?(scroll: GranumGridState<Row>): ReactNode;
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

export function GranumGrid<Row>(props: GranumGridProps<Row>) {
  const scroll = useGranumGrid({
    ...props,
    aggregateRowHeight: props.aggregateRowHeight ?? 120,
    measureFrameRate: props.measureFrameRate ?? (props.showStats || undefined),
    scrollMode: props.layout === 'page' ? 'window' : props.scrollMode,
  });
  useImperativeHandle(props.controllerRef, () => scroll.controller, [scroll.controller]);
  useImperativeHandle(props.apiRef, () => scroll.api, [scroll.api]);
  const { snapshot } = scroll;
  // Tools and dialogs receive only what they use, so a scroll frame does not re-render them.
  const {
    api,
    provider,
    controller,
    selection,
    setSelection,
    selectionMode,
    setSelectionMode,
    getVisibleRange,
    markers,
    setBookmarkMarkers,
  } = scroll;
  const explorerScroll = useMemo(
    () => ({
      api,
      provider,
      controller,
      selection,
      setSelection,
      selectionMode,
      setSelectionMode,
      getVisibleRange,
      markers,
      setBookmarkMarkers,
    }),
    [
      api,
      provider,
      controller,
      selection,
      setSelection,
      selectionMode,
      setSelectionMode,
      getVisibleRange,
      markers,
      setBookmarkMarkers,
    ],
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
  const summaryCards =
    scroll.aggregateMode &&
    snapshot.view === 'zoom' &&
    !snapshot.moving &&
    !!props.provider.fetchAggregates;
  const chapter = chapterAt(scroll.session.chapters, snapshot.position);
  return (
    <section
      className={`ds-root ${props.className ?? ''}`}
      data-ds-root=""
      data-layout={props.layout ?? 'embedded'}
      data-unstyled={props.unstyled || undefined}
      style={props.style}
      data-view={snapshot.view}
      data-motion={!scroll.reduceMotion && scroll.features.transitions ? 'on' : 'off'}
      data-theme={props.theme ?? 'system'}
      onKeyDown={(event) => {
        // Nested explorers and the viewport handle their own shortcuts first.
        if (event.defaultPrevented) return;
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 'k' &&
          !isTextEntry(event.target) &&
          !isWithin(event.target, 'dialog')
        ) {
          event.preventDefault();
          scroll.setJumpOpen(true);
        }
      }}
      onAuxClick={(event) => {
        if (!event.defaultPrevented && (event.button === 3 || event.button === 4)) {
          event.preventDefault();
          event.button === 3 ? scroll.controller.back() : scroll.controller.forward();
        }
      }}
    >
      {props.renderToolbar ? (
        props.renderToolbar(scroll)
      ) : (
        <Toolbar
          scroll={scroll}
          appearance={props}
          fullPageUrl={props.fullPageUrl}
          actions={props.toolbarActions}
        />
      )}
      {!props.renderToolbar && (
        <ViewGuide
          view={snapshot.view}
          detailed={!scroll.aggregateMode}
          descriptionId={`${scroll.id}-view-description`}
        />
      )}
      {props.exploration !== false && (
        <ExplorerTools
          scroll={explorerScroll}
          storageKey={props.bookmarkStorageKey}
          formatRange={props.formatRange}
          renderComparison={renderComparison}
        />
      )}
      <div {...partProps('header', props, 'ds-legend')}>
        <span>
          {summaryCards ? 'Zoom into a group, or inspect its rows' : (props.header ?? 'RECORDS')}
        </span>
        <span>
          <i />
          {props.provider.metric?.label ?? 'Dataset'} ·{' '}
          {overviewAccuracy(scroll.session.overview, props.provider.metric?.kind ?? 'value', {
            supported: !!props.provider.fetchOverview,
            failed: !!scroll.session.metadataErrors.overview,
          })}{' '}
          overview
        </span>
      </div>
      {scroll.dataMode === 'append' && (
        <div className="ds-live-status">
          <span>
            {scroll.unseenRows
              ? `${scroll.unseenRows.toLocaleString()} new rows`
              : 'Live · up to date'}
          </span>
          <button
            className="ds-button"
            onClick={() =>
              scroll.controller.scrollToIndex(Math.max(0, snapshot.rowCount - 1), { align: 'end' })
            }
          >
            Jump to latest
          </button>
        </div>
      )}
      {(snapshot.view !== 'rows' || scroll.aggregateMode) && (
        <ScaleBar
          scroll={scroll}
          appearance={props}
          summaryCards={summaryCards}
          formatRange={props.formatRange}
          bucketSizes={props.summaryBucketSizes}
          formatBucketSize={props.formatBucketSize}
          bucketHeight={props.aggregateRowHeight ?? 120}
        />
      )}
      {props.stickyChapters && chapter && (
        <div className="ds-sticky-chapter">
          {chapter.breadcrumb?.join(' / ') ?? chapter.label} <span>{rangeAddress(chapter)}</span>
        </div>
      )}
      <div {...partProps('body', props)}>
        <div
          {...scroll.getViewportProps({
            'aria-label': props.ariaLabel,
            className: props.classNames?.viewport,
            style: props.styles?.viewport,
          })}
        >
          <div className="ds-pan-layer" style={{ transform: `translateY(${scroll.edgeOffset}px)` }}>
            <ViewLayer
              view={snapshot.view}
              height={snapshot.height}
              motion={!scroll.reduceMotion && scroll.features.transitions}
            >
              {summaryCards ? (
                <AggregateLayer
                  scroll={scroll}
                  renderAggregate={props.renderAggregate}
                  formatRange={props.formatRange}
                  formatBucketSize={props.formatBucketSize}
                />
              ) : (
                <ViewCanvas scroll={scroll} />
              )}
              {scroll.aggregateMode && !summaryCards && (
                <div className="ds-aggregate-label">
                  {snapshot.moving ? 'Overview during travel' : 'Aggregate view'} ·{' '}
                  {scroll.session.aggregates.length ? 'regional summaries' : 'coarse overview'}
                  <span>Focus: row {((snapshot.activeIndex ?? 0) + 1).toLocaleString()}</span>
                </div>
              )}
              {scroll.rows.map((slot) => (
                <div
                  key={
                    slot.status === 'ready' && props.getRowKey
                      ? `row:${props.getRowKey(slot.row, slot.index)}`
                      : `index:${slot.index}`
                  }
                  {...scroll.getRowProps(slot, {
                    className: props.classNames?.row,
                    style: props.styles?.row,
                  })}
                >
                  {slot.status === 'ready' ? (
                    <LoadedRow
                      render={props.renderRow}
                      row={slot.row}
                      index={slot.index}
                      focused={slot.index === snapshot.activeIndex}
                    />
                  ) : (
                    (props.renderPlaceholder?.(slot) ?? (
                      <RowPlaceholder slot={slot} retry={scroll.session.retry} />
                    ))
                  )}
                </div>
              ))}
            </ViewLayer>
          </div>
          {!snapshot.rowCount && (
            <div className="ds-empty">{props.emptyContent ?? 'No rows in this dataset.'}</div>
          )}
        </div>
        {props.renderRail ? (
          props.renderRail(scroll)
        ) : (
          <AtlasRail
            scroll={scroll}
            options={props.atlas}
            headerActions={props.railActions}
            className={props.classNames?.rail}
            style={props.styles?.rail}
          />
        )}
      </div>
      {Object.keys(scroll.session.metadataErrors).length > 0 && (
        <div className="ds-meta-error">
          Some summaries are unavailable.{' '}
          <button className="ds-button" onClick={() => scroll.session.retry()}>
            Retry summaries
          </button>
        </div>
      )}
      <ContextHints
        hints={scroll.features.hints}
        canGoBack={snapshot.canGoBack}
        view={snapshot.view}
        className={props.classNames?.hint}
        style={props.styles?.hint}
      />
      <JumpBar scroll={scroll} className={props.classNames?.jump} style={props.styles?.jump} />
      <div {...scroll.getAnnouncementProps()} />
      {props.renderFooter ? (
        props.renderFooter(scroll)
      ) : (
        <Footer scroll={scroll} appearance={props} showStats={props.showStats} />
      )}
    </section>
  );
}

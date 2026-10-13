import {
  memo,
  useImperativeHandle,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type Key,
} from 'react';
import type { DeepScrollEngine } from '../core/engine.js';
import type { DeepScrollApi } from '../core/api.js';
import { useDeepScroll, type UseDeepScrollOptions, type DeepScrollState } from './useDeepScroll.js';
import { partProps, type DeepScrollAppearance } from './styling.js';
import { ContextHints } from './ContextHints.js';
import { ViewLayer } from './ViewLayer.js';
import { ViewCanvas } from './ViewCanvas.js';
import { JumpBar } from './JumpBar.js';
import { AtlasRail, type AtlasRailOptions } from './AtlasRail.js';
import { ExplorerTools, savedView } from './ExplorerTools.js';
import { CompareRanges } from './CompareRanges.js';
import type { SavedView } from '../core/exploration.js';
import type { PendingRowSlot } from '../data/types.js';
export interface RowRenderContext<Row> {
  row: Row;
  index: number;
  rowNumber: number;
  focused: boolean;
}
export interface DeepScrollProps<Row> extends UseDeepScrollOptions<Row>, DeepScrollAppearance {
  header?: ReactNode;
  renderRow(context: RowRenderContext<Row>): ReactNode;
  renderPlaceholder?(slot: PendingRowSlot): ReactNode;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
  theme?: 'system' | 'dark' | 'light';
  /** Opt out of the optional skin, even when styles.css is loaded elsewhere. */
  unstyled?: boolean;
  controllerRef?: Ref<DeepScrollEngine>;
  /** Access the mounted provider and controller from a host integration. */
  apiRef?: Ref<DeepScrollApi<Row>>;
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
  /** Replace the built-in controls with your own React components. Return null to hide. */
  renderToolbar?(scroll: DeepScrollState<Row>): ReactNode;
  renderFooter?(scroll: DeepScrollState<Row>): ReactNode;
  renderRail?(scroll: DeepScrollState<Row>): ReactNode;
}
const LoadedRow = memo(function LoadedRow<Row>({
  render,
  row,
  index,
  focused,
}: {
  render: (context: RowRenderContext<Row>) => ReactNode;
  row: Row;
  index: number;
  focused: boolean;
}) {
  const content = render({ row, index, rowNumber: index + 1, focused });
  return typeof content === 'string' || typeof content === 'number' ? (
    <span role="gridcell">{content}</span>
  ) : (
    content
  );
}) as <Row>(props: {
  render: (context: RowRenderContext<Row>) => ReactNode;
  row: Row;
  index: number;
  focused: boolean;
}) => ReactNode;

export function DeepScroll<Row>(props: DeepScrollProps<Row>) {
  const scroll = useDeepScroll({
    ...props,
    scrollMode: props.layout === 'page' ? 'window' : props.scrollMode,
  });
  useImperativeHandle(props.controllerRef, () => scroll.controller, [scroll.controller]);
  useImperativeHandle(props.apiRef, () => scroll.api, [scroll.api]);
  const { snapshot } = scroll;
  const chapter = scroll.session.chapters.find(
    (c) => snapshot.position >= c.start && snapshot.position < c.end,
  );
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
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 'k' &&
          !(event.target as HTMLElement).closest('dialog,input,textarea')
        ) {
          event.preventDefault();
          scroll.setJumpOpen(true);
        }
      }}
      onAuxClick={(event) => {
        if (event.button === 3 || event.button === 4) {
          event.preventDefault();
          event.button === 3 ? scroll.controller.back() : scroll.controller.forward();
        }
      }}
    >
      {props.renderToolbar ? (
        props.renderToolbar(scroll)
      ) : (
        <div {...partProps('toolbar', props)}>
          <div className="ds-toolbar-main">
            <div className="ds-history">
              <button
                className="ds-button"
                aria-label="Back to previous location"
                title={
                  snapshot.backLocation
                    ? `Back to row ${Math.floor(snapshot.backLocation.position + 1).toLocaleString()}`
                    : 'No previous location'
                }
                disabled={!snapshot.canGoBack}
                onClick={() => scroll.controller.back()}
              >
                ← Back
              </button>
              <button
                className="ds-button"
                aria-label="Forward"
                disabled={!snapshot.canGoForward}
                onClick={() => scroll.controller.forward()}
              >
                →
              </button>
            </div>
            <span className="ds-context" data-testid="breadcrumb">
              {chapter?.breadcrumb?.join(' / ') ?? chapter?.label ?? 'Indexed dataset'}
            </span>
          </div>
          <div className="ds-toolbar-actions">
            <label className="ds-view-menu">
              View{' '}
              <select
                className="ds-input"
                aria-label="View"
                value={snapshot.view}
                onChange={(event) =>
                  scroll.controller.setView(event.target.value as 'rows' | 'lens' | 'zoom')
                }
              >
                <option value="rows">List</option>
                <option value="lens">Focus + context</option>
                <option value="zoom">Overview</option>
              </select>
            </label>
            <button className="ds-button ds-jump-trigger" onClick={() => scroll.setJumpOpen(true)}>
              Go to… <kbd>⌘ K</kbd>
            </button>
            {props.fullPageUrl && (
              <a
                className="ds-button ds-open-page"
                href={props.fullPageUrl(savedView(scroll))}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open full page ↗
              </a>
            )}
            {props.toolbarActions}
          </div>
        </div>
      )}
      {props.exploration !== false && (
        <ExplorerTools
          scroll={scroll}
          storageKey={props.bookmarkStorageKey}
          renderComparison={(a, b, close) => (
            <CompareRanges a={a} b={b} host={props} onClose={close} />
          )}
        />
      )}
      <div {...partProps('header', props, 'ds-legend')}>
        <span>{props.header ?? 'RECORDS'}</span>
        <span>
          <i />
          {props.provider.metric?.label ?? 'Dataset'} ·{' '}
          {!props.provider.fetchOverview ||
          scroll.session.metadataErrors.overview ||
          (scroll.session.overview.length > 0 &&
            scroll.session.overview.every((bucket) => bucket.accuracy === 'unavailable'))
            ? 'unavailable'
            : !scroll.session.overview.length
              ? 'loading'
              : scroll.session.overview.some((b) => b.accuracy === 'estimated')
                ? 'sampled'
                : 'exact'}{' '}
          overview
        </span>
      </div>
      {props.followOutput !== undefined && (
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
        <div {...partProps('scale', props)}>
          <span>
            {snapshot.moving
              ? 'Traveling through the overview'
              : snapshot.view === 'lens'
                ? 'Full-size focus · logarithmic context · click to explore'
                : `${snapshot.rowsPerPixel.toLocaleString(undefined, { maximumFractionDigits: 2 })} rows / pixel · Ctrl+wheel or pinch to zoom`}
          </span>
          {snapshot.view === 'zoom' && (
            <div>
              <button
                className="ds-button"
                aria-label="Zoom in"
                onClick={() => scroll.controller.setZoom(snapshot.rowsPerPixel / 8)}
              >
                +
              </button>
              <button
                className="ds-button"
                aria-label="Zoom out"
                onClick={() => scroll.controller.setZoom(snapshot.rowsPerPixel * 8)}
              >
                −
              </button>
              <button
                className="ds-button"
                onClick={() => {
                  scroll.controller.setZoom(snapshot.rowCount / snapshot.height);
                  scroll.controller.goTo(Math.round(Math.max(0, snapshot.rowCount - 1) / 2), {
                    motion: 'instant',
                  });
                }}
              >
                Fit dataset
              </button>
              <button
                className="ds-button"
                onClick={() => scroll.controller.setZoom(1 / snapshot.rowHeight)}
              >
                Inspect rows
              </button>
            </div>
          )}
        </div>
      )}
      {props.stickyChapters && chapter && (
        <div className="ds-sticky-chapter">
          {chapter.breadcrumb?.join(' / ') ?? chapter.label}{' '}
          <span>
            Rows {(chapter.start + 1).toLocaleString()}–{chapter.end.toLocaleString()}
          </span>
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
              <ViewCanvas scroll={scroll} />
              {scroll.aggregateMode && (
                <div className="ds-aggregate-label">
                  {snapshot.moving ? 'Overview during travel' : 'Aggregate view'} ·{' '}
                  {scroll.session.aggregates.length ? 'regional summaries' : 'coarse overview'}
                  <span>Focus: row {((snapshot.activeIndex ?? 0) + 1).toLocaleString()}</span>
                </div>
              )}
              {scroll.rows.map((slot) => (
                <div
                  key={
                    slot.status === 'ready'
                      ? props.getRowKey
                        ? `row:${props.getRowKey(slot.row, slot.index)}`
                        : `index:${slot.index}`
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
                      <>
                        <span role="gridcell" className="ds-row-id">
                          {(slot.index + 1).toLocaleString()}
                        </span>
                        <span role="gridcell" className="ds-loading">
                          {slot.error ? (
                            <button className="ds-button" onClick={() => scroll.session.retry()}>
                              Retry rows
                            </button>
                          ) : slot.estimate ? (
                            <>
                              ≈ {slot.estimate.avg?.toFixed(1) ?? '—'} · {slot.estimate.label}{' '}
                              <span className="ds-estimate">Approximate</span>
                            </>
                          ) : (
                            'Loading row…'
                          )}
                        </span>
                      </>
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
      <ContextHints scroll={scroll} className={props.classNames?.hint} style={props.styles?.hint} />
      <JumpBar scroll={scroll} className={props.classNames?.jump} style={props.styles?.jump} />
      <div {...scroll.getAnnouncementProps()} />
      {props.renderFooter ? (
        props.renderFooter(scroll)
      ) : (
        <footer {...partProps('footer', props)}>
          <span data-testid="position">
            Row{' '}
            <strong>
              {snapshot.rowCount ? ((snapshot.activeIndex ?? 0) + 1).toLocaleString() : '0'}
            </strong>{' '}
            of {snapshot.rowCount.toLocaleString()}
          </span>
          <span>
            {(snapshot.progress * 100).toFixed(2)}%{' '}
            {props.showStats && (
              <span className="ds-footer-stats">
                · {scroll.stats.cachedRows.toLocaleString()} cached · {scroll.stats.activeRequests}{' '}
                fetching · {scroll.stats.fps ?? '—'} fps
              </span>
            )}
          </span>
        </footer>
      )}
    </section>
  );
}

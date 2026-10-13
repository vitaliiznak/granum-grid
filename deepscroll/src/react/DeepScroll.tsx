import type { CSSProperties, ReactNode } from 'react';
import { useDeepScroll, type UseDeepScrollOptions } from './useDeepScroll.js';
import { ContextHints } from './ContextHints.js';
import { ViewLayer } from './ViewLayer.js';
import { ViewCanvas } from './ViewCanvas.js';
import { JumpBar } from './JumpBar.js';
import { AtlasRail } from './AtlasRail.js';
import type { PendingRowSlot } from '../data/types.js';
export interface RowRenderContext<Row> {
  row: Row;
  index: number;
  rowNumber: number;
  focused: boolean;
}
export interface DeepScrollProps<Row> extends UseDeepScrollOptions<Row> {
  header?: ReactNode;
  renderRow(context: RowRenderContext<Row>): ReactNode;
  renderPlaceholder?(slot: PendingRowSlot): ReactNode;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
  theme?: 'system' | 'dark' | 'light';
}
export function DeepScroll<Row>(props: DeepScrollProps<Row>) {
  const scroll = useDeepScroll(props);
  const { snapshot } = scroll;
  const renderLoaded = (context: RowRenderContext<Row>) => {
    const content = props.renderRow(context);
    return typeof content === 'string' || typeof content === 'number' ? (
      <span role="gridcell">{content}</span>
    ) : (
      content
    );
  };
  const chapter = scroll.session.chapters.find(
    (c) => snapshot.position >= c.start && snapshot.position < c.end,
  );
  return (
    <section
      className={`ds-root ${props.className ?? ''}`}
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
      <div className="ds-toolbar">
        <div className="ds-toolbar-main">
          <div className="ds-history">
            <button
              aria-label="Back"
              disabled={!snapshot.canGoBack}
              onClick={() => scroll.controller.back()}
            >
              ←
            </button>
            <button
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
          <div className="ds-view-switch" aria-label="View">
            {(['rows', 'lens', 'zoom'] as const).map((view) => (
              <button
                key={view}
                aria-pressed={snapshot.view === view}
                onClick={() => scroll.controller.setView(view)}
              >
                {view[0].toUpperCase() + view.slice(1)}
              </button>
            ))}
          </div>
          <button className="ds-jump-trigger" onClick={() => scroll.setJumpOpen(true)}>
            Jump to… <kbd>⌘ K</kbd>
          </button>
        </div>
      </div>
      <div className="ds-legend">
        <span>{props.header ?? 'RECORDS'}</span>
        <span>
          <i />
          {props.provider.metric?.label ?? 'Overview'} · mean / range ·{' '}
          {!props.provider.fetchOverview
            ? 'unavailable'
            : !scroll.session.overview.length
              ? 'loading'
              : scroll.session.overview.some((b) => b.accuracy === 'estimated')
                ? 'sampled'
                : 'exact'}
        </span>
      </div>
      {(snapshot.view !== 'rows' || scroll.aggregateMode) && (
        <div className="ds-scale">
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
                aria-label="Zoom in"
                onClick={() => scroll.controller.setZoom(snapshot.rowsPerPixel / 8)}
              >
                +
              </button>
              <button
                aria-label="Zoom out"
                onClick={() => scroll.controller.setZoom(snapshot.rowsPerPixel * 8)}
              >
                −
              </button>
              <button
                onClick={() => {
                  scroll.controller.setZoom(snapshot.rowCount / snapshot.height);
                  scroll.controller.goTo(Math.round(Math.max(0, snapshot.rowCount - 1) / 2), {
                    motion: 'instant',
                  });
                }}
              >
                Fit dataset
              </button>
              <button onClick={() => scroll.controller.setZoom(1 / snapshot.rowHeight)}>
                Inspect rows
              </button>
            </div>
          )}
        </div>
      )}
      <div className="ds-body">
        <div {...scroll.getViewportProps({ 'aria-label': props.ariaLabel })}>
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
                  key={slot.index}
                  {...scroll.getRowProps(slot)}
                  data-status={slot.status}
                  data-focused={slot.index === snapshot.activeIndex || undefined}
                >
                  {slot.status === 'ready'
                    ? renderLoaded({
                        row: slot.row,
                        index: slot.index,
                        rowNumber: slot.index + 1,
                        focused: slot.index === snapshot.activeIndex,
                      })
                    : (props.renderPlaceholder?.(slot) ?? (
                        <>
                          <span role="gridcell" className="ds-row-id">
                            {(slot.index + 1).toLocaleString()}
                          </span>
                          <span role="gridcell" className="ds-loading">
                            {slot.error ? (
                              <button onClick={() => scroll.session.retry()}>Retry rows</button>
                            ) : slot.estimate ? (
                              <>
                                ≈ {slot.estimate.avg?.toFixed(1) ?? '—'} · {slot.estimate.label}{' '}
                                <span className="ds-estimate">Approximate</span>
                              </>
                            ) : (
                              'Loading reading…'
                            )}
                          </span>
                        </>
                      ))}
                </div>
              ))}
            </ViewLayer>
          </div>
          {!snapshot.rowCount && <div className="ds-empty">No rows in this dataset.</div>}
        </div>
        <AtlasRail scroll={scroll} />
      </div>
      {Object.keys(scroll.session.metadataErrors).length > 0 && (
        <div className="ds-meta-error">
          Some summaries are unavailable.{' '}
          <button onClick={() => scroll.session.retry()}>Retry summaries</button>
        </div>
      )}
      <ContextHints scroll={scroll} />
      <JumpBar scroll={scroll} />
      <div {...scroll.getAnnouncementProps()} />
      <footer className="ds-footer">
        <span data-testid="position">
          Row{' '}
          <strong>
            {snapshot.rowCount ? ((snapshot.activeIndex ?? 0) + 1).toLocaleString() : '0'}
          </strong>{' '}
          of {snapshot.rowCount.toLocaleString()}
        </span>
        <span>
          {(snapshot.progress * 100).toFixed(2)}%{' '}
          <span className="ds-footer-stats">
            · {scroll.stats.cachedRows.toLocaleString()} cached · {scroll.stats.activeRequests}{' '}
            fetching · {scroll.stats.fps ?? '—'} fps
          </span>
        </span>
      </footer>
    </section>
  );
}

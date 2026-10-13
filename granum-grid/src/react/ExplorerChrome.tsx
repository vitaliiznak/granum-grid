import { useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { VIEWS, type View } from '../core/engine.js';
import type { SavedView } from '../core/exploration.js';
import { ROW_DETAIL_MAX_ROWS_PER_PIXEL } from '../core/mappings.js';
import { chapterAt } from '../core/navigation.js';
import type { PendingRowSlot, RowRange } from '../data/types.js';
import { partProps, type GranumGridAppearance } from './styling.js';
import type { GranumGridState } from './useGranumGrid.js';
import { useShortcutModifier } from './platform.js';
import { viewLabels } from './ViewGuide.js';
import { bucketZoomRange } from '../visuals/buckets.js';
import { formatCompact } from '../visuals/format.js';

const defaultBucketSizes = [10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000].map((rows) => ({
  rows,
  label: `${rows.toLocaleString()} rows`,
}));

// The built-in chrome around the rows. Hosts replace these with renderToolbar/renderFooter.

/** History, breadcrumb, view menu, search, and the optional full-page link. */
export function Toolbar<Row>({
  scroll,
  appearance,
  fullPageUrl,
  actions,
}: {
  scroll: GranumGridState<Row>;
  appearance: GranumGridAppearance;
  fullPageUrl?(view: SavedView): string;
  actions?: ReactNode;
}) {
  const { snapshot, api } = scroll;
  const modifier = useShortcutModifier();
  const chapter = chapterAt(scroll.session.chapters, snapshot.position);
  // Serializing the location on every frame is wasted work; the handler below refreshes the
  // link when it is used.
  const fullPageHref = useMemo(() => fullPageUrl?.(api.getView()), [fullPageUrl, api]);
  const refreshFullPageHref = (event: SyntheticEvent<HTMLAnchorElement>) => {
    if (fullPageUrl) event.currentTarget.href = fullPageUrl(api.getView());
  };
  return (
    <div {...partProps('toolbar', appearance)}>
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
            aria-describedby={`${scroll.id}-view-description`}
            value={snapshot.view}
            onChange={(event) => {
              const view = event.target.value as View;
              scroll.controller.setView(view);
              // Enter summaries at a useful scale, keeping the current row at the center.
              // The public setView method still preserves the caller's saved zoom level.
              if (view === 'zoom' && snapshot.rowsPerPixel <= ROW_DETAIL_MAX_ROWS_PER_PIXEL)
                scroll.controller.setZoom(1);
            }}
          >
            {VIEWS.map((view) => (
              <option key={view} value={view}>
                {viewLabels[view]}
              </option>
            ))}
          </select>
        </label>
        <button
          className="ds-button ds-jump-trigger"
          onClick={(event) => {
            event.currentTarget.focus();
            scroll.setJumpOpen(true);
          }}
        >
          Go to… <kbd>{modifier} K</kbd>
        </button>
        {fullPageUrl && (
          <a
            className="ds-button ds-open-page"
            href={fullPageHref}
            onPointerEnter={refreshFullPageHref}
            onPointerDown={refreshFullPageHref}
            onFocus={refreshFullPageHref}
            onContextMenu={refreshFullPageHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open full page ↗
          </a>
        )}
        {actions}
      </div>
    </div>
  );
}

/** Scale, zoom, and inspect controls outside the Rows view. */
export function ScaleBar<Row>({
  scroll,
  appearance,
  summaryCards,
  formatRange,
  bucketSizes = defaultBucketSizes,
  formatBucketSize,
  bucketHeight,
}: {
  scroll: GranumGridState<Row>;
  appearance: GranumGridAppearance;
  summaryCards: boolean;
  formatRange?(range: RowRange): string;
  bucketSizes?: readonly { label: string; rows: number }[];
  formatBucketSize?(rows: number): string;
  bucketHeight: number;
}) {
  const { snapshot } = scroll;
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState('1000');
  const sizeSelect = useRef<HTMLSelectElement>(null);
  const visibleCount = Math.max(0, scroll.visibleRange.end - scroll.visibleRange.start);
  const ready =
    scroll.session.aggregates[0]?.start === scroll.visibleRange.start &&
    scroll.session.aggregates.at(-1)?.end === scroll.visibleRange.end &&
    scroll.session.aggregates.length <= scroll.aggregateBuckets;
  const groupCount = ready
    ? scroll.session.aggregates.length
    : Math.min(scroll.aggregateBuckets, visibleCount);
  const groupSize = visibleCount / Math.max(1, groupCount);
  const currentSize = formatBucketSize
    ? formatBucketSize(Math.round(groupSize))
    : `${formatCompact(groupSize)} rows`;
  const customRows = Number(draft);
  const customHint =
    formatBucketSize &&
    Number.isSafeInteger(customRows) &&
    customRows >= 1 &&
    customRows <= snapshot.rowCount
      ? formatBucketSize(customRows)
      : null;
  const applySize = (rows: number) => {
    const range = bucketZoomRange(
      snapshot.rowCount,
      snapshot.position,
      rows,
      Math.max(1, Math.min(160, Math.floor(snapshot.height / bucketHeight))),
    );
    if (range) scroll.controller.zoomToRange(range);
    closeCustom();
  };
  const closeCustom = () => {
    setCustom(false);
    sizeSelect.current?.focus();
  };
  return (
    <div {...partProps('scale', appearance)}>
      <div className="ds-scale-context">
        <strong
          title={
            summaryCards
              ? 'Each card is one group. Zoom into a group to split it. Inspect rows to read the records.'
              : undefined
          }
        >
          {summaryCards
            ? `Grouped rows · ${groupCount} ${groupCount === 1 ? 'group' : 'groups'} · about ${currentSize} each`
            : 'Individual rows'}
        </strong>
        <span>
          {snapshot.moving
            ? 'Traveling through the overview'
            : formatRange && scroll.visibleRange.end > scroll.visibleRange.start
              ? `Showing ${formatRange(scroll.visibleRange)}`
              : `${Math.max(0, scroll.visibleRange.end - scroll.visibleRange.start).toLocaleString()} rows in view · Ctrl+wheel or pinch to zoom`}
        </span>
      </div>
      {snapshot.view === 'zoom' && (
        <div className="ds-scale-controls">
          {scroll.provider.fetchAggregates && (
            <label className="ds-bucket-size">
              Group size
              <select
                ref={sizeSelect}
                className="ds-input"
                aria-label="Group size"
                title="How much data each group covers, around the current row. Cards show the actual size."
                value={custom ? 'custom' : 'current'}
                disabled={!snapshot.rowCount}
                onChange={(event) => {
                  if (event.target.value === 'custom') {
                    setDraft(String(Math.max(1, Math.round(groupSize))));
                    setCustom(true);
                  } else if (event.target.value !== 'current')
                    applySize(Number(event.target.value));
                }}
              >
                <option value="current">
                  {summaryCards ? `About ${currentSize}` : 'Individual rows'}
                </option>
                {bucketSizes
                  .filter(
                    ({ rows }) =>
                      Number.isSafeInteger(rows) && rows > 0 && rows <= snapshot.rowCount,
                  )
                  .map(({ rows, label }) => (
                    <option key={rows} value={rows}>
                      {label}
                    </option>
                  ))}
                <option value="custom">Custom row count…</option>
              </select>
            </label>
          )}
          <button
            className="ds-button"
            aria-label="Zoom in"
            title="Show 8× fewer rows for more detail"
            onClick={() => scroll.controller.setZoom(snapshot.rowsPerPixel / 8)}
          >
            + Zoom in
          </button>
          <button
            className="ds-button"
            aria-label="Zoom out"
            title="Show 8× more rows for a wider view"
            onClick={() => scroll.controller.setZoom(snapshot.rowsPerPixel * 8)}
          >
            − Zoom out
          </button>
          <button
            className="ds-button"
            onClick={() => {
              if (snapshot.rowCount)
                scroll.controller.zoomToRange({ start: 0, end: snapshot.rowCount });
            }}
          >
            Fit dataset
          </button>
          <button
            className="ds-button"
            onClick={() => {
              scroll.controller.scrollToIndex(snapshot.activeIndex ?? 0, { align: 'center' });
              // Rows view removes this bar. Keep keyboard input in the explorer.
              document.getElementById(`${scroll.id}-viewport`)?.focus({ preventScroll: true });
            }}
          >
            Inspect rows
          </button>
        </div>
      )}
      {custom && (
        <form
          className="ds-bucket-custom"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              closeCustom();
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            const rows = Number(draft);
            if (Number.isSafeInteger(rows) && rows >= 1 && rows <= snapshot.rowCount)
              applySize(rows);
          }}
        >
          <label>
            Rows in each group
            <input
              className="ds-input"
              type="number"
              min={1}
              max={snapshot.rowCount}
              step={1}
              required
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          {customHint && <span className="ds-bucket-custom-hint">About {customHint}</span>}
          <button className="ds-button" type="submit">
            Apply size
          </button>
          <button className="ds-button" type="button" onClick={closeCustom}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

/** Default content for a row that is loading or failed. */
export function RowPlaceholder({ slot, retry }: { slot: PendingRowSlot; retry(): void }) {
  return (
    <>
      <span role="gridcell" className="ds-row-id">
        {(slot.index + 1).toLocaleString()}
      </span>
      <span role="gridcell" className="ds-loading">
        {slot.error ? (
          <button className="ds-button" onClick={retry}>
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
  );
}

/** Current row, progress, and optional cache statistics. */
export function Footer<Row>({
  scroll,
  appearance,
  showStats,
}: {
  scroll: GranumGridState<Row>;
  appearance: GranumGridAppearance;
  showStats?: boolean;
}) {
  const { snapshot } = scroll;
  return (
    <footer {...partProps('footer', appearance)}>
      <span data-testid="position">
        Row{' '}
        <strong>
          {snapshot.rowCount ? ((snapshot.activeIndex ?? 0) + 1).toLocaleString() : '0'}
        </strong>{' '}
        of {snapshot.rowCount.toLocaleString()}
      </span>
      <span>
        {(snapshot.progress * 100).toFixed(2)}%{' '}
        {showStats && (
          <span className="ds-footer-stats">
            · {scroll.stats.cachedRows.toLocaleString()} cached · {scroll.stats.activeRequests}{' '}
            fetching · {scroll.stats.fps ?? '—'} fps
          </span>
        )}
      </span>
    </footer>
  );
}

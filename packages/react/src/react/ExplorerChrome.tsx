import { useMemo, type ReactNode, type SyntheticEvent } from 'react';
import type { SavedView } from '@granum/core/internal';
import type { PendingRowSlot } from '@granum/core/data';
import { chapterName, formatDecimal } from '@granum/core/map';
import { partProps, type GranumGridAppearance } from './styling.js';
import type { GranumGridState } from './useGranumGrid.js';
import { useShortcutModifier } from './platform.js';

// The built-in chrome around the rows. Hosts replace these with the `toolbar`/`footer` props.

/** Configure the built-in toolbar through `GranumGrid`'s `toolbar` prop. */
export interface ToolbarOptions {
  /** Host controls appended after the built-in buttons. */
  actions?: ReactNode;
  /** Show an "Open full page" link to this URL for the current view. */
  fullPageUrl?(view: SavedView): string;
}

/** History, breadcrumb, search, and the optional full-page link. */
export function Toolbar<Row>({
  grid,
  appearance,
  fullPageUrl,
  actions,
}: ToolbarOptions & { grid: GranumGridState<Row>; appearance: GranumGridAppearance }) {
  const { snapshot, api, chapter } = grid;
  const modifier = useShortcutModifier();
  // Serializing the location on every frame is wasted work; the handler below refreshes the
  // link when it is used.
  const fullPageHref = useMemo(() => fullPageUrl?.(api.getView()), [fullPageUrl, api]);
  const refreshFullPageHref = (event: SyntheticEvent<HTMLAnchorElement>) => {
    if (fullPageUrl) event.currentTarget.href = fullPageUrl(api.getView());
  };
  return (
    <div {...partProps('toolbar', appearance)}>
      <div className="gr-toolbar-main">
        <div className="gr-history">
          <button
            className="gr-button"
            aria-label="Back to previous location"
            title={
              snapshot.backLocation
                ? `Back to row ${Math.floor(snapshot.backLocation.position + 1).toLocaleString()}`
                : 'No previous location'
            }
            disabled={!snapshot.canGoBack}
            onClick={() => api.back()}
          >
            ← Back
          </button>
          <button
            className="gr-button"
            aria-label="Forward"
            disabled={!snapshot.canGoForward}
            onClick={() => api.forward()}
          >
            →
          </button>
        </div>
        <span className="gr-context" data-testid="breadcrumb">
          {chapter ? chapterName(chapter) : 'Indexed dataset'}
        </span>
      </div>
      <div className="gr-toolbar-actions">
        <button
          className="gr-button gr-jump-trigger"
          onClick={(event) => {
            event.currentTarget.focus();
            api.openSearch();
          }}
        >
          Go to… <kbd>{modifier} K</kbd>
        </button>
        {fullPageUrl && (
          <a
            className="gr-button gr-open-page"
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

/** Default content for a row that is loading or failed. */
export function RowPlaceholder({ slot, retry }: { slot: PendingRowSlot; retry(): void }) {
  return (
    <>
      <span role="gridcell" className="gr-row-id">
        {(slot.index + 1).toLocaleString()}
      </span>
      <span role="gridcell" className="gr-loading">
        {slot.error ? (
          <button className="gr-button" onClick={retry}>
            Retry rows
          </button>
        ) : slot.estimate ? (
          <>
            ≈ {slot.estimate.avg == null ? '—' : formatDecimal(slot.estimate.avg, 1)} ·{' '}
            {slot.estimate.label} <span className="gr-estimate">Approximate</span>
          </>
        ) : (
          'Loading row…'
        )}
      </span>
    </>
  );
}

/** Current row and progress. */
export function Footer<Row>({
  grid,
  appearance,
}: {
  grid: GranumGridState<Row>;
  appearance: GranumGridAppearance;
}) {
  const { snapshot } = grid;
  return (
    <footer {...partProps('footer', appearance)}>
      <span data-testid="position">
        Row{' '}
        <strong>
          {snapshot.rowCount ? ((snapshot.activeIndex ?? 0) + 1).toLocaleString() : '0'}
        </strong>{' '}
        of {snapshot.rowCount.toLocaleString()}
      </span>
      <span>{(snapshot.progress * 100).toFixed(2)}%</span>
    </footer>
  );
}

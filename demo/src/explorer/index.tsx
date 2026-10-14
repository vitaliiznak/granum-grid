import { useCallback, type ReactNode } from 'react';
import type { DataProvider, GranumGridState, Marker, RowRange } from '@granum/react';
import { CompareRanges, type ComparisonHost } from './CompareRanges';
import { ContextHints } from './ContextHints';
import { ExplorerTools } from './ExplorerTools';
import { useOwnedState } from './hooks';
import './explorer.css';

const NO_MARKERS: Marker[] = [];

export interface ExplorerToolsOptions<Row> {
  /** Settings the comparison panes reuse from the main explorer. */
  comparison: ComparisonHost<Row>;
  /** Persist bookmarks in localStorage under this key. Default: only while mounted. */
  storageKey?: string;
  /** Describe a half-open range in domain units, such as elapsed time or base pairs. */
  formatRange?(range: RowRange): string;
  /** First-run hints for the map, search, and Back; the key remembers dismissal. */
  hints?: false | { storageKey?: string };
}

/**
 * The playground's selection, bookmark, comparison, and hint tools, composed onto
 * `GranumGrid` through public props: spread the result's `markers`, `rail`, and `panel`.
 */
export function useExplorerTools<Row>(
  provider: DataProvider<Row>,
  { comparison, storageKey, formatRange, hints }: ExplorerToolsOptions<Row>,
) {
  // Keyed by dataset revision so a switch never shows another dataset's places or mode.
  const identity = `${provider.id}:${provider.revision}`;
  const [selecting, setSelecting] = useOwnedState(identity, false);
  const [markers, setMarkers] = useOwnedState(identity, NO_MARKERS);
  const renderComparison = useCallback(
    (a: RowRange, b: RowRange, close: () => void) => (
      <CompareRanges a={a} b={b} host={comparison} onClose={close} />
    ),
    [comparison],
  );
  const panel = (grid: GranumGridState<Row>): ReactNode => (
    <>
      <ExplorerTools
        api={grid.api}
        provider={grid.provider}
        selection={grid.selection}
        markers={grid.markers}
        selecting={selecting}
        onSelectingChange={setSelecting}
        onBookmarkMarkersChange={setMarkers}
        storageKey={storageKey}
        formatRange={formatRange}
        renderComparison={renderComparison}
      />
      <ContextHints
        hints={!!hints}
        canGoBack={grid.snapshot.canGoBack}
        storageKey={hints ? hints.storageKey : undefined}
      />
    </>
  );
  return { markers, rail: { selecting, onSelectingChange: setSelecting }, panel };
}

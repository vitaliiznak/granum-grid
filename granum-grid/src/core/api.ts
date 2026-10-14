import type { DataProvider, RowRange } from '../data/types.js';
import type { GranumGridEngine, NavigationController } from './engine.js';
import { validRange } from '../data/bounds.js';
import { readView, type SavedView } from './exploration.js';

/**
 * The one imperative handle for a mounted explorer: navigation, selection, saved views,
 * search, and retry. `apiRef` on the component and `api` on the hook hold the same object.
 * Position is saved and restored through validated views rather than raw locations.
 */
export interface GranumGridApi<Row> extends Omit<NavigationController, 'getLocation' | 'restore'> {
  readonly provider: DataProvider<Row>;
  /** The current half-open selection, or null. */
  getSelection(): RowRange | null;
  /** Controlled selection emits onSelectionChange; the host still owns its value. */
  setSelection(range: RowRange | null): void;
  /** A detached copy of the location and selection for this dataset revision. */
  getView(): SavedView;
  /** Reject another dataset/revision or invalid ranges before changing anything. */
  restoreView(view: SavedView): void;
  /**
   * Open the mounted search UI with an optional query. Does not navigate. Calls the
   * hook's `onOpenSearch`; does nothing without it.
   */
  openSearch(query?: string): void;
  /** Request failed row pages and summaries again. */
  retry(): void;
}

const engines = new WeakMap<object, GranumGridEngine>();
/** The engine behind a handle, for the library's own linked panes. Not exported publicly. */
export const engineOf = (api: GranumGridApi<unknown>) => engines.get(api);

/** Internal adapter shared by React and contract tests; it owns no DOM or data requests. */
export function createGranumGridApi<Row>(
  provider: DataProvider<Row>,
  engine: GranumGridEngine,
  state: {
    getSelection(): RowRange | null;
    setSelection(range: RowRange | null): void;
    openSearch(query: string): void;
    retry(): void;
  },
): GranumGridApi<Row> {
  const setSelection = (range: RowRange | null) => {
    if (range && !validRange(range, provider.rowCount))
      throw new RangeError('Invalid selected range');
    state.setSelection(range ? { ...range } : null);
  };
  const getSelection = () => {
    const selection = state.getSelection();
    return selection ? { ...selection } : null;
  };
  const api: GranumGridApi<Row> = {
    provider,
    getSnapshot: engine.getSnapshot,
    subscribe: engine.subscribe,
    onNavigate: engine.onNavigate,
    goTo: engine.goTo,
    scrollToIndex: engine.scrollToIndex,
    back: engine.back,
    forward: engine.forward,
    nextMarker: engine.nextMarker,
    previousMarker: engine.previousMarker,
    nextChapter: engine.nextChapter,
    previousChapter: engine.previousChapter,
    cancel: engine.cancel,
    resetMeasurements: engine.resetMeasurements,
    getSelection,
    setSelection,
    getView: () => ({
      version: 1,
      dataset: provider.id,
      revision: provider.revision,
      location: engine.getLocation(),
      selection: getSelection(),
    }),
    restoreView(view) {
      const restored = readView(view, provider);
      if (!restored) throw new RangeError('Saved view does not match this dataset and revision');
      engine.restore(restored.location);
      setSelection(restored.selection);
    },
    openSearch: (query = '') => state.openSearch(query),
    retry: () => state.retry(),
  };
  engines.set(api, engine);
  return api;
}

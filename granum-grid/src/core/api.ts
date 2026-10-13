import type { DataProvider, RowRange } from '../data/types.js';
import type { GranumGridEngine, NavigationController, ScrollToOptions } from './engine.js';
import { validRange } from '../data/bounds.js';
import { decodeView, encodeView, type SavedView } from './exploration.js';

/** Public integration surface for a mounted table. The host owns automation policy. */
export interface GranumGridApi<Row> {
  readonly provider: DataProvider<Row>;
  /** Navigation for the mounted table. Input and measurement adapters stay internal. */
  readonly controller: NavigationController;
  scrollToIndex(index: number, options?: ScrollToOptions): void;
  zoomToRange(range: RowRange): void;
  back(): void;
  forward(): void;
  /** Open the mounted search UI with an optional query. Does not navigate. */
  openSearch(query?: string): void;
  /** Controlled selection emits onSelectionChange; the host still owns its value. */
  setSelection(range: RowRange | null): void;
  getView(): SavedView;
  /** Reject another dataset/revision or invalid ranges before changing anything. */
  restoreView(view: SavedView): void;
}

/** Internal adapter shared by React and contract tests; it owns no DOM or data requests. */
export function createGranumGridApi<Row>(
  provider: DataProvider<Row>,
  controller: GranumGridEngine,
  state: {
    getSelection(): RowRange | null;
    setSelection(range: RowRange | null): void;
    openSearch(query: string): void;
  },
): GranumGridApi<Row> {
  const setSelection = (range: RowRange | null) => {
    if (range && !validRange(range, provider.rowCount))
      throw new RangeError('Invalid selected range');
    state.setSelection(range ? { ...range } : null);
  };
  return {
    provider,
    controller,
    scrollToIndex: controller.scrollToIndex,
    zoomToRange: controller.zoomToRange,
    back: () => controller.back(),
    forward: () => controller.forward(),
    openSearch: (query = '') => state.openSearch(query),
    setSelection,
    getView() {
      const selection = state.getSelection();
      return {
        version: 1,
        dataset: provider.id,
        revision: provider.revision,
        location: controller.getLocation(),
        selection: selection ? { ...selection } : null,
      };
    },
    restoreView(view) {
      const restored = decodeView(encodeView(view), provider);
      if (!restored) throw new RangeError('Saved view does not match this dataset and revision');
      controller.restore(restored.location);
      setSelection(restored.selection);
    },
  };
}

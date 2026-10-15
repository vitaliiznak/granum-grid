// @granum-grid/core: framework-independent navigation. Rows and providers are in
// `@granum-grid/core/data`, native scrolling and keys in `/dom`, map drawing in `/map`.
export { createEngine } from './core/engine.js';
export type {
  NavigationLocation,
  NavigationEvent,
  NavigationSnapshot,
  NavigationController,
  GranumGridEngine,
  EngineOptions,
  ScrollAlignment,
  ScrollToOptions,
  GoToOptions,
} from './core/engine.js';
export type { GranumGridApi } from './core/api.js';
export { rowToPixel, pixelToRow, rowToProgress, progressToRow } from './core/mappings.js';
export type { CoordinateMapping } from './core/mappings.js';
export type { RowMeasurement, RowSizeReader } from './core/rowSizes.js';
export { encodeView, decodeView, readView } from './core/exploration.js';
export type { SavedView } from './core/exploration.js';
export { validRange } from './data/bounds.js';

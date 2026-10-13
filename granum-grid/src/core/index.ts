// Framework-independent navigation. Internal helpers (input math, jump parsing,
// tuning constants, the mutable measurement store) are deliberately not exported.
export { createEngine } from './engine.js';
export type {
  View,
  NavigationLocation,
  NavigationEvent,
  NavigationSnapshot,
  NavigationController,
  GranumGridEngine,
  EngineOptions,
  ScrollAlignment,
  ScrollToOptions,
  GoToOptions,
} from './engine.js';
export {
  createZoomMapping,
  rowToPixel,
  pixelToRow,
  rowToProgress,
  progressToRow,
} from './mappings.js';
export type { CoordinateMapping } from './mappings.js';
export type { RowMeasurement, RowSizeReader } from './rowSizes.js';
export { encodeView, decodeView } from './exploration.js';
export { validRange } from '../data/bounds.js';
export type { SavedView, Bookmark } from './exploration.js';

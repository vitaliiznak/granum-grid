// What `@granum/react` needs from the engine and data session beyond the public entries.
// No compatibility promise: these change with the bindings that use them.
export { createGranumGridApi } from './core/api.js';
export type { GranumGridApi } from './core/api.js';
export { atEnd } from './core/engine.js';
export type { GranumGridEngine, NavigationEvent, NavigationSnapshot } from './core/engine.js';
export { readView } from './core/exploration.js';
export type { SavedView } from './core/exploration.js';
export { clamp, progressToRow, rowToProgress } from './core/mappings.js';
export type { CoordinateMapping } from './core/mappings.js';
export { bucketAt, chapterAt, parseJump } from './core/navigation.js';
export type { JumpTarget } from './core/navigation.js';
export type { RowMeasurement } from './core/rowSizes.js';
export { validRange } from './data/bounds.js';
export { MARKERS_ONLY_SEARCH, searchIssue } from './data/search.js';
export { DataSession, sessionKey } from './data/session.js';

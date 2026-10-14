// The explorer and its parts. Each export below is a layer a host can stop at:
// `GranumGrid` -> widgets (`AtlasRail`, `JumpBar`) with `useGranumGrid` ->
// `granum-grid/core`.
export { GranumGrid } from './react/GranumGrid.js';
export type { GranumGridProps, RowRenderContext, ToolbarOptions } from './react/GranumGrid.js';
export { useGranumGrid } from './react/useGranumGrid.js';
export type {
  UseGranumGridOptions,
  GranumGridState,
  ScrollStats,
  RowActivationContext,
} from './react/useGranumGrid.js';
export { AtlasRail } from './react/AtlasRail.js';
export type { AtlasRailOptions, AtlasRailProps } from './react/AtlasRail.js';
export { JumpBar } from './react/JumpBar.js';
export type { JumpBarProps } from './react/JumpBar.js';
export type { GranumGridApi } from './core/api.js';
export type { GranumGridPart, GranumGridAppearance } from './react/styling.js';
export { defaultFeatures } from './features.js';
export type { Features } from './features.js';

// Data in, places out.
export { createArrayProvider } from './data/array.js';
export { createCursorProvider } from './data/server.js';
export { encodeView, decodeView } from './core/exploration.js';
export type { SavedView } from './core/exploration.js';
export type * from './data/types.js';
export type {
  NavigationEvent,
  NavigationLocation,
  NavigationSnapshot,
  ScrollAlignment,
  ScrollToOptions,
  GoToOptions,
} from './core/engine.js';

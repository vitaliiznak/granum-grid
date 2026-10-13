export { DeepScroll } from './react/DeepScroll.js';
export type { DeepScrollProps, RowRenderContext } from './react/DeepScroll.js';
export { useDeepScroll } from './react/useDeepScroll.js';
export type { UseDeepScrollOptions, DeepScrollState, ScrollStats } from './react/useDeepScroll.js';
export { AtlasRail } from './react/AtlasRail.js';
export type { AtlasRailOptions, AtlasRailProps } from './react/AtlasRail.js';
export type * from './data/types.js';
export type {
  View,
  NavigationEvent,
  NavigationLocation,
  NavigationSnapshot,
  DeepScrollEngine,
  ScrollAlignment,
  ScrollToOptions,
  GoToOptions,
} from './core/engine.js';
export { defaultFeatures } from './features.js';
export type { Features } from './features.js';

export type { DeepScrollPart, DeepScrollAppearance } from './react/styling.js';
export { JumpBar } from './react/JumpBar.js';
export { ViewCanvas } from './react/ViewCanvas.js';

export { encodeView, decodeView } from './core/exploration.js';
export type { SavedView, Bookmark } from './core/exploration.js';
export { rangeProvider } from './data/range.js';

// The explorer and its parts. Each export below is a layer a host can stop at:
// `GranumGrid` -> widgets (`AtlasRail`, `JumpBar`) with `useGranumGrid` -> `@granum/core`.
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
export type { GranumGridApi } from '@granum/core';
export type { GranumGridPart, GranumGridAppearance } from './react/styling.js';

// Data in, places out.
export { createArrayProvider } from '@granum/core/data';
export { createCursorProvider } from '@granum/core/data';
export { encodeView, decodeView } from '@granum/core';
export type { SavedView } from '@granum/core';
// The provider contract's types only; data helpers stay in @granum/core/data.
export type {
  AggregateRequest,
  Bucket,
  CacheOptions,
  Chapter,
  CursorSource,
  CursorWindow,
  CursorWindowQuery,
  DataProvider,
  KnownMarkerKind,
  Marker,
  OverviewTrack,
  PendingRowSlot,
  ProviderQuery,
  RowRange,
  RowSlot,
  SearchContext,
  SearchHelp,
  SearchResult,
} from '@granum/core/data';
export type {
  NavigationEvent,
  NavigationLocation,
  NavigationSnapshot,
  ScrollAlignment,
  ScrollToOptions,
  GoToOptions,
} from '@granum/core';

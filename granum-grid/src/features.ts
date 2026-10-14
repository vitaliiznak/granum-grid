/**
 * Motion and data behavior of `useGranumGrid`. Map layers are `AtlasRailOptions`; scrolling
 * is the browser's own, so it has no switches here.
 */
export const defaultFeatures = {
  transitions: true,
  progressiveEstimates: true,
  prefetch: true,
};
export type Features = typeof defaultFeatures;

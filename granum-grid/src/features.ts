/**
 * Motion and data behavior of `useGranumGrid`. Map layers are `AtlasRailOptions`, and
 * first-run hints are the `hints` prop of `GranumGrid`.
 */
export const defaultFeatures = {
  inertia: true,
  edgeElasticity: true,
  automaticAggregation: false,
  flight: true,
  transitions: true,
  progressiveEstimates: true,
  prefetch: true,
};
export type Features = typeof defaultFeatures;

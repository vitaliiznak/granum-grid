/**
 * Motion and data behavior of `useGranumGrid`. Map layers are `AtlasRailOptions`.
 * `edgeElasticity` is the embedded default; `layout="page"` turns it on unless set.
 */
export const defaultFeatures = {
  inertia: true,
  edgeElasticity: false,
  transitions: true,
  progressiveEstimates: true,
  prefetch: true,
};
export type Features = typeof defaultFeatures;

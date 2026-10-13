export const defaultFeatures = {
  overview: true,
  chapters: true,
  markers: true,
  magnetism: true,
  magnifier: true,
  precision: true,
  preview: true,
  trail: true,
  inertia: true,
  edgeElasticity: true,
  automaticAggregation: false,
  flight: true,
  transitions: true,
  progressiveEstimates: true,
  prefetch: true,
  hints: true,
};
export type Features = typeof defaultFeatures;

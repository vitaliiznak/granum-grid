// The dataset map without a framework: `mountMap` drives any scroller through a
// `MapTarget`. Below it are the pieces `@granum-grid/react`'s AtlasRail shares: the overview's
// scale and accuracy, canvas drawing, the drag math with precision and snapping, peak
// attraction, marker grouping, and number formats.
export { gridTarget, mountMap, scrollerTarget } from './mount.js';
export type { MapOptions, MapTarget, MountedMap } from './mount.js';
export { FULL_SPEED, PRECISION_STEPS, beginScrub, moveScrub, rowAtPointer } from './scrub.js';
export type { Scrub, ScrubMove, TrackGeometry } from './scrub.js';
export {
  atlasDomain,
  atlasTicks,
  drawAtlas,
  observeCanvas,
  overviewAccuracy,
  prepareCanvas,
  profileValue,
} from './atlas.js';
export { atlasPeaks, attractToPeak } from './atlasGravity.js';
export { GROUP_GAP, clusterMarkers, leadMarker } from './markers.js';
export {
  chapterName,
  formatCompact,
  formatCompactTick,
  formatDecimal,
  formatMetric,
  rangeAddress,
  rangeCount,
} from './format.js';

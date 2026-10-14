// Framework-free pieces of the dataset map: the overview's scale and accuracy, canvas
// drawing, peak attraction, marker grouping, and number formats.
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

import type { KnownMarkerKind, Marker } from '../data/types.js';
import { rowToProgress } from '../core/mappings.js';

/** Markers closer than this many CSS px share one rail button. */
export const GROUP_GAP = 28;
/** A group is named after its most severe marker. Host kinds rank like `event`. */
const KIND_RANK: Record<KnownMarkerKind, number> = {
  error: 0,
  spike: 1,
  bookmark: 2,
  event: 3,
  selection: 4,
  search: 5,
};
const rank = (kind: Marker['kind']) => KIND_RANK[kind as KnownMarkerKind] ?? KIND_RANK.event;

/**
 * Group in row order by screen distance. Each group starts at least GROUP_GAP px below the
 * previous one, so metadata count never determines rail DOM size and neighbors on either side
 * of a fixed bin edge never overlap.
 */
export function clusterMarkers(markers: readonly Marker[], total: number, height: number) {
  const groups: Marker[][] = [];
  let start = -Infinity;
  for (const marker of [...markers].sort((a, b) => a.index - b.index)) {
    const y = rowToProgress(marker.index, total) * Math.max(1, height);
    if (y - start < GROUP_GAP) groups[groups.length - 1].push(marker);
    else {
      groups.push([marker]);
      start = y;
    }
  }
  return groups;
}
/** The marker that names a group: the most severe kind, then the earliest row. */
export function leadMarker(group: readonly Marker[]) {
  return group.reduce((lead, marker) => (rank(marker.kind) < rank(lead.kind) ? marker : lead));
}

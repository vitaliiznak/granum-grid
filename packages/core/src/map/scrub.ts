import { clamp, progressToRow } from '../core/mappings.js';
import type { Marker } from '../data/types.js';
import { attractToPeak } from './atlasGravity.js';

/** Dragging this far sideways (CSS px) slows scrubbing for precise positioning. */
export const PRECISION_STEPS = [
  { away: 208, rate: 0.05, label: 'Fine · 1/20 speed' },
  { away: 112, rate: 0.25, label: '¼ speed' },
  { away: 48, rate: 0.5, label: '½ speed' },
] as const;
export const FULL_SPEED = 'Full speed';
/** A press this close to the current-row line grabs it instead of jumping. */
const THUMB_GRAB_PX = 14;
/** Faster vertical moves than this pass through markers and peaks. */
const FAST_MOVE_PX = 40;

/** A vertical track that maps top-to-bottom onto a dataset's rows. */
export interface TrackGeometry {
  top: number;
  height: number;
  rowCount: number;
}

/** The row under a pointer, optionally pulled toward a nearby peak. */
export function rowAtPointer(
  clientY: number,
  { top, height, rowCount }: TrackGeometry,
  peaks: readonly number[] = [],
) {
  const index = Math.round(progressToRow((clientY - top) / height, rowCount));
  const target = peaks.length ? attractToPeak(index, peaks, rowCount, height) : { position: index };
  return {
    index: Math.round(target.position),
    y: clamp(clientY - top, 0, height),
    peak: target.peak,
  };
}

export interface Scrub {
  x: number;
  y: number;
  /** Where the reader was when the press began; a cancel returns here. */
  origin: number;
  /** The unsnapped address the pointer has moved to. */
  position: number;
  /** The address after snapping, which the view shows. */
  destination: number;
  rate: number;
  moved: boolean;
  snapped?: number;
}

/**
 * Begin a scrub at a press on the track. A press near the current row grabs it in place;
 * elsewhere the view jumps to the row under the pointer (peak-attracted unless `free`).
 */
export function beginScrub(
  clientX: number,
  clientY: number,
  track: TrackGeometry,
  {
    current,
    progress,
    peaks,
    free,
  }: {
    /** The current float row address. */
    current: number;
    /** The current row's share of the track, 0–1. */
    progress: number;
    peaks: readonly number[];
    free: boolean;
  },
): Scrub {
  const raw = rowAtPointer(clientY, track);
  const target = rowAtPointer(clientY, track, free ? [] : peaks);
  const nearThumb = Math.abs(target.y - progress * track.height) <= THUMB_GRAB_PX;
  return {
    x: clientX,
    y: clientY,
    origin: current,
    position: nearThumb ? current : raw.index,
    destination: nearThumb ? current : target.index,
    rate: 1,
    moved: false,
  };
}

export interface ScrubMove {
  /** The address to show now. */
  position: number;
  peak?: number;
  /** The current precision, such as `½ speed`, for a hint. */
  precision: string;
}

/**
 * Move a scrub. Sideways distance from the press slows it (1/2, 1/4, then 1/20 speed), and
 * a change of precision re-anchors so the position never jumps. Slow moves snap to markers
 * within a few pixels, then to chart peaks at full speed; Shift (`free`) and fast moves
 * pass through.
 */
export function moveScrub(
  scrub: Scrub,
  clientX: number,
  clientY: number,
  track: TrackGeometry,
  {
    precision = true,
    markers = [],
    snapToMarkers = true,
    peaks = [],
    free = false,
  }: {
    precision?: boolean;
    markers?: readonly Marker[];
    snapToMarkers?: boolean;
    peaks?: readonly number[];
    free?: boolean;
  } = {},
): ScrubMove {
  const last = Math.max(0, track.rowCount - 1);
  const away = precision ? Math.abs(clientX - scrub.x) : 0;
  const step = PRECISION_STEPS.find((item) => away > item.away);
  const rate = step?.rate ?? 1;
  if (rate !== scrub.rate) {
    scrub.position = scrub.destination;
    scrub.rate = rate;
  }
  const delta = clientY - scrub.y;
  scrub.position = clamp(scrub.position + (delta / track.height) * last * rate, 0, last);
  scrub.y = clientY;
  scrub.moved ||= Math.abs(delta) > 0;
  let position = delta === 0 ? scrub.destination : scrub.position;
  let peak: number | undefined;
  let markerSnapped = false;
  const slow = delta !== 0 && Math.abs(delta) < FAST_MOVE_PX && !free;
  if (slow && snapToMarkers) {
    const nearby = markers
      .filter(
        (marker) =>
          (Math.abs(marker.index - position) / Math.max(1, last)) * track.height <
          (scrub.snapped === marker.index ? 10 : 6),
      )
      .sort((a, b) => Math.abs(a.index - position) - Math.abs(b.index - position))[0];
    scrub.snapped = nearby?.index;
    if (nearby) {
      position = nearby.index;
      markerSnapped = true;
    }
  } else if (delta !== 0) scrub.snapped = undefined;
  if (slow && rate === 1 && !markerSnapped && peaks.length) {
    const attracted = attractToPeak(position, peaks, track.rowCount, track.height);
    position = attracted.position;
    peak = attracted.peak;
  }
  scrub.destination = position;
  return { position, peak, precision: step?.label ?? FULL_SPEED };
}

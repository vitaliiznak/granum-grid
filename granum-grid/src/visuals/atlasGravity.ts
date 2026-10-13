import { clamp } from '../core/mappings.js';
import type { Bucket } from '../data/types.js';
import { profileValue } from './atlas.js';

/** Find visible peaks once per profile, using only the supplied overview buckets. */
export function atlasPeaks(
  buckets: readonly Bucket[],
  domain: readonly [number, number],
  kind: 'value' | 'density',
): number[] {
  const values = buckets.map((bucket) => {
    const value = profileValue(bucket, kind);
    return value === null || bucket.end <= bucket.start
      ? null
      : clamp((value - domain[0]) / (domain[1] - domain[0]), 0, 1);
  });
  const connected = (left: number, right: number) =>
    values[left] != null && values[right] != null && buckets[left].end === buckets[right].start;
  const peaks: number[] = [];
  for (let start = 0; start < values.length; start++) {
    const value = values[start];
    if (value === null) continue;
    let end = start;
    while (connected(end, end + 1) && values[end + 1] === value) end++;
    const left = start - 1,
      right = end + 1;
    // Missing summaries and gaps are not evidence of a peak. Dataset edges can
    // be peaks, but a flat profile (including a single bucket) cannot.
    if (
      (left < 0 || (connected(left, start) && values[left]! < value)) &&
      (right === values.length || (connected(end, right) && values[right]! < value)) &&
      (left >= 0 || right < values.length)
    ) {
      let lowLeft = start,
        lowRight = end;
      while (connected(lowLeft - 1, lowLeft) && values[lowLeft - 1]! <= values[lowLeft]!) lowLeft--;
      while (connected(lowRight, lowRight + 1) && values[lowRight + 1]! <= values[lowRight]!)
        lowRight++;
      // Each monotone slope is visited at most twice across all peaks. Ignore
      // ripples smaller than 8% of the displayed scale, even on a high baseline.
      const floor = Math.max(
        left < 0 ? 0 : values[lowLeft]!,
        right === values.length ? 0 : values[lowRight]!,
      );
      if (value - floor >= 0.08)
        peaks.push(
          buckets[start].start + Math.floor((buckets[end].end - buckets[start].start - 1) / 2),
        );
    }
    start = end;
  }
  return peaks;
}

/** A small, continuous pull in screen pixels; it never changes the raw drag origin. */
export function attractToPeak(
  position: number,
  peaks: readonly number[],
  total: number,
  height: number,
): { position: number; peak?: number } {
  if (total <= 1 || height <= 0) return { position };
  let nearest: number | undefined,
    distance = 10;
  for (const peak of peaks) {
    if (peak < 0 || peak >= total) continue;
    const pixels = (Math.abs(peak - position) / (total - 1)) * height;
    if (pixels < distance) {
      nearest = peak;
      distance = pixels;
    }
  }
  if (nearest === undefined) return { position };
  // Settle on the peak inside 3 px, taper smoothly to no attraction at 10 px.
  const t = clamp((10 - distance) / 7, 0, 1);
  const strength = t * t * (3 - 2 * t);
  return { position: position + (nearest - position) * strength, peak: nearest };
}

import { expect, it } from 'vitest';
import type { Bucket } from '../src/data/types';
import { atlasPeaks, attractToPeak } from '../src/map/atlasGravity';

const profile = (values: (number | null)[], size = 100): Bucket[] =>
  values.map((avg, i) => ({
    start: i * size,
    end: (i + 1) * size,
    avg,
    min: avg,
    max: avg,
    count: avg === null ? null : (avg / 100) * size,
    accuracy: 'estimated',
  }));

it('finds sharp peaks and plateau midpoints without scanning the represented rows', () => {
  expect(atlasPeaks(profile([0, 70, 0, 90, 90, 0]), [0, 100], 'value')).toEqual([149, 399]);
  expect(atlasPeaks(profile([0, 100, 0], 2_000_000_000), [0, 100], 'value')).toEqual([
    2_999_999_999,
  ]);
  expect(atlasPeaks(profile([80, 20, 10, 70]), [0, 100], 'value')).toEqual([49, 349]);
  expect(atlasPeaks(profile([-10, -2, -9]), [-10, 0], 'value')).toEqual([149]);
  expect(atlasPeaks(profile([0, 90, 0]), [0, 1], 'density')).toEqual([149]);
});

it('ignores flat profiles, tiny ripples, missing values, gaps, and invisible peaks', () => {
  for (const values of [
    [],
    [70],
    [70, 70, 70],
    [60, 62, 60],
    [0, 6, 0],
    [0, null, 0],
    [null, 80, null],
  ])
    expect(atlasPeaks(profile(values), [0, 100], 'value')).toEqual([]);
  const unavailable = profile([0, 80, 0]);
  unavailable[1].accuracy = 'unavailable';
  expect(atlasPeaks(unavailable, [0, 100], 'value')).toEqual([]);
  const gap = profile([0, 80, 0]);
  gap[1].start++;
  expect(atlasPeaks(gap, [0, 100], 'value')).toEqual([]);
  expect(atlasPeaks(profile([110, 180, 110]), [0, 100], 'value')).toEqual([]);
  expect(atlasPeaks(profile([0, 80, 0]), [0, 2000], 'value')).toEqual([]);
});

it('settles close to a peak, eases toward it nearby, and releases outside its radius', () => {
  // One row per pixel makes the screen-space behavior explicit.
  expect(attractToPeak(497, [500], 1001, 1000)).toEqual({ position: 500, peak: 500 });
  expect(attractToPeak(503, [500], 1001, 1000).position).toBe(500);
  const near = attractToPeak(494, [500], 1001, 1000);
  expect(near.position).toBeGreaterThan(494);
  expect(near.position).toBeLessThan(500);
  expect(attractToPeak(490, [500], 1001, 1000)).toEqual({ position: 490 });
  expect(attractToPeak(501, [495, 502], 1001, 1000).position).toBe(502);
  expect(attractToPeak(494, [], 1001, 1000)).toEqual({ position: 494 });
  expect(attractToPeak(0, [0], 0, 1000)).toEqual({ position: 0 });
  expect(attractToPeak(0, [0], 1, 1000)).toEqual({ position: 0 });
  expect(attractToPeak(494, [500], 1001, 0)).toEqual({ position: 494 });
  // Same pull regardless of dataset size; no 32-bit truncation.
  expect(attractToPeak(3_010_000_000, [3_000_000_000], 5_000_000_001, 1000).position).toBe(
    3_000_000_000,
  );
});

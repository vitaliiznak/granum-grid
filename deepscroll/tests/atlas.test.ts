import { expect, it } from 'vitest';
import { atlasDomain, atlasTicks, profileValue } from '../src/visuals/atlas';
import type { Bucket } from '../src/data/types';

const bucket: Bucket = {
  start: 0,
  end: 100,
  count: 25,
  avg: 0,
  min: -12,
  max: 8,
  accuracy: 'estimated',
};

it('distinguishes zero from missing values and does not draw unavailable summaries', () => {
  expect(profileValue(bucket, 'value')).toBe(0);
  expect(profileValue({ ...bucket, avg: null }, 'value')).toBeNull();
  expect(profileValue({ ...bucket, accuracy: 'unavailable' }, 'value')).toBeNull();
  expect(profileValue({ ...bucket, avg: NaN }, 'value')).toBeNull();
  expect(profileValue(bucket, 'density')).toBe(0.25);
  expect(profileValue({ ...bucket, count: 0 }, 'density')).toBe(0);
  expect(profileValue({ ...bucket, count: null }, 'density')).toBeNull();
  expect(profileValue({ ...bucket, end: 0 }, 'density')).toBeNull();
});

it('keeps the provider scale, handles negative values and ignores missing extrema', () => {
  expect(atlasDomain([bucket], [-20, 20])).toEqual([-20, 20]);
  expect(atlasDomain([bucket])).toEqual([-12, 8]);
  expect(atlasDomain([bucket], [0, 0])).toEqual([-12, 8]);
  expect(atlasDomain([{ ...bucket, min: null, max: Infinity, avg: 3 }])).toEqual([0, 3]);
  expect(atlasDomain([{ ...bucket, accuracy: 'unavailable' }])).toEqual([0, 1]);
  expect(atlasDomain([])).toEqual([0, 1]);
  expect(atlasDomain([bucket], undefined, 'density')).toEqual([0, 1]);
});

it('shows supplied chapter addresses and falls back to bounded, one-based row labels', () => {
  const chapters = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    start: i * 10,
    end: (i + 1) * 10,
    label: `Section ${i + 1}`,
  }));
  expect(atlasTicks(100, chapters, 'chapters', 3)).toEqual([
    { index: 0, label: 'Section 1' },
    { index: 50, label: 'Section 6' },
    { index: 90, label: 'Section 10' },
  ]);
  expect(atlasTicks(100, chapters, 'rows', 3)).toEqual([
    { index: 0, label: '1' },
    { index: 50, label: '51' },
    { index: 99, label: '100' },
  ]);
  expect(atlasTicks(2, [], 'chapters')).toEqual([
    { index: 0, label: '1' },
    { index: 1, label: '2' },
  ]);
  expect(atlasTicks(1, [], 'rows')).toEqual([{ index: 0, label: '1' }]);
  expect(atlasTicks(0, [], 'rows')).toEqual([]);
});

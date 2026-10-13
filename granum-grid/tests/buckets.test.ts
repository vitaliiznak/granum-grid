import { describe, expect, it } from 'vitest';
import { bucketZoomRange } from '../src/visuals/buckets';
import { createEngine } from '../src/core/engine';

describe('target bucket size navigation', () => {
  it('centers a bounded range around a billion-row address and restores it through history', () => {
    const engine = createEngine({ rowCount: 4_000_000_000, initialIndex: 3_500_000_000 });
    const origin = engine.getLocation();
    const range = bucketZoomRange(4_000_000_000, origin.position, 86400, 5)!;
    expect(range).toEqual({ start: 3_499_784_000, end: 3_500_216_000 });
    engine.zoomToRange(range);
    expect(engine.getLocation().position).toBe(origin.position);
    engine.back();
    expect(engine.getLocation()).toEqual(origin);
  });

  it('shifts the full requested span inside the dataset at either edge', () => {
    expect(bucketZoomRange(10000, 0, 100, 5)).toEqual({ start: 0, end: 500 });
    expect(bucketZoomRange(10000, 9999, 100, 5)).toEqual({ start: 9500, end: 10000 });
    expect(bucketZoomRange(100, 50, 1000, 5)).toEqual({ start: 0, end: 100 });
    expect(bucketZoomRange(0, 0, 100, 5)).toBeNull();
    expect(bucketZoomRange(Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER, 160)).toEqual({
      start: 0,
      end: Number.MAX_SAFE_INTEGER,
    });
  });

  it('rejects invalid sizes and unbounded requested counts', () => {
    for (const size of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => bucketZoomRange(100, 50, size, 5)).toThrow(RangeError);
    for (const count of [0, -1, 1.5, 161, Infinity])
      expect(() => bucketZoomRange(100, 50, 10, count)).toThrow(RangeError);
  });
});

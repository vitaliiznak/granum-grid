import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/core/engine';
import { MAX_SCROLL, scrollMapping } from '../src/dom/scroll';

const engine = (rowCount: number, rowHeight = 32, height = 600) => {
  const e = createEngine({ rowCount, rowHeight });
  e.setViewport(height);
  return e;
};

describe('scroll mapping', () => {
  it('is the rows own pixel offset while they fit the scroll range', () => {
    const e = engine(100_000);
    const mapping = scrollMapping(e);
    expect(mapping.range).toBe(100_000 * 32 - 600);
    expect(mapping.toScroll(1234.5)).toBe(1234.5 * 32);
    expect(mapping.toPosition(1234.5 * 32)).toBe(1234.5);
    expect(mapping.toPosition(mapping.range)).toBe(e.getSnapshot().maxPosition);
  });

  it('compresses only the middle of four billion rows, so both ends stay exact', () => {
    const e = engine(4_000_000_000);
    const { range, edge, toScroll, toPosition } = scrollMapping(e);
    expect(range).toBe(MAX_SCROLL);
    expect(edge).toBe(4 * 600);
    const max = e.getSnapshot().maxPosition;
    // One to one near either end: a pixel of scrolling is a pixel of rows.
    for (const position of [0, 1, 10.25, 70]) {
      expect(toScroll(position)).toBeCloseTo(position * 32, 6);
      expect(toScroll(max - position)).toBeCloseTo(range - position * 32, 6);
    }
    // Monotonic through the middle, and the inverse lands on the same address.
    let previous = -1;
    for (const position of [100, 1e6, 2e9, 3.9e9, max - 100]) {
      const offset = toScroll(position);
      expect(offset).toBeGreaterThan(previous);
      previous = offset;
      expect(toPosition(offset)).toBeCloseTo(position, 0);
    }
    // The middle of the scroll range is the middle of the rows.
    expect(toPosition(range / 2) / max).toBeCloseTo(0.5, 6);
  });

  it('follows measured heights in dynamic mode', () => {
    const e = createEngine({ rowCount: 1000, rowHeight: 20, dynamicRowHeight: true });
    e.setViewport(200);
    e.measureRows([{ index: 0, height: 120 }]);
    const mapping = scrollMapping(e);
    expect(mapping.toScroll(1)).toBe(120);
    expect(mapping.toScroll(2)).toBe(140);
    expect(mapping.toPosition(130)).toBe(1.5);
  });
});

import { describe, expect, it } from 'vitest';
import {
  createEngine,
  pixelToRow,
  rowToPixel,
  rowToProgress,
  progressToRow,
} from '../src/core/index';
describe('100M row coordinates', () => {
  it('retains fractional positions and reaches the exact final row', () => {
    const engine = createEngine({ rowCount: 100_000_000, rowHeight: 32 });
    engine.goTo(73_499_999);
    engine.pan(8);
    expect(engine.getSnapshot().position).toBe(73_499_999.25);
    engine.goTo(100_000_000);
    expect(engine.getSnapshot().activeIndex).toBe(99_999_999);
    expect(engine.getSnapshot().progress).toBe(1);
  });
  it('round-trips across the entire address range', () => {
    for (const row of [0, 0.125, 1, 73_499_999, 99_999_999]) {
      expect(pixelToRow(rowToPixel(row, 74_000_000, 36), 74_000_000, 36)).toBeCloseTo(row, 5);
      expect(progressToRow(rowToProgress(row, 100_000_000), 100_000_000)).toBeCloseTo(row, 5);
    }
  });
  it('handles empty and singleton datasets and invalid input', () => {
    expect(createEngine({ rowCount: 0 }).getSnapshot().activeIndex).toBeNull();
    expect(createEngine({ rowCount: 1 }).getSnapshot().progress).toBe(0);
    expect(() => createEngine({ rowCount: -1 })).toThrow();
    expect(() => createEngine({ rowCount: 100 }).goTo(NaN)).toThrow();
  });
});

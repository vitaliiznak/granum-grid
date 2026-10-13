import { expect, it } from 'vitest';
import { createLensMapping, createZoomMapping } from '../src/core/mappings';
it('Lens is monotonic and invertible across 100M rows, including edges', () => {
  for (const focus of [0, 1.25, 5_000_000.5, 73_499_999, 99_999_999]) {
    const lens = createLensMapping(focus, 100_000_000, 500, 32);
    let previous = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const row = (i / 100) * 99_999_999,
        y = lens.toPixel(row);
      expect(y).toBeGreaterThanOrEqual(previous);
      previous = y;
      expect(lens.toRow(y)).toBeCloseTo(row, 4);
      expect(y).toBeGreaterThanOrEqual(-1e-7);
      expect(y).toBeLessThanOrEqual(500 + 1e-7);
    }
    expect(lens.toPixel(focus)).toBe(250);
  }
});
it('Lens matches the full-size row derivative at both focus boundaries', () => {
  const focus = 10_000,
    lens = createLensMapping(focus, 100_000_000, 500, 32),
    epsilon = 1e-5;
  for (const boundary of [focus - 3, focus + 3]) {
    const slope =
      (lens.toPixel(boundary + epsilon) - lens.toPixel(boundary - epsilon)) / (2 * epsilon);
    expect(slope).toBeCloseTo(32, 2);
  }
});
it('Zoom round-trips at all semantic scales', () => {
  for (const scale of [1 / 36, 0.5, 100, 200_000]) {
    const mapping = createZoomMapping(73_499_999, 500, scale);
    for (const y of [0, 100, 250, 499]) expect(mapping.toPixel(mapping.toRow(y))).toBeCloseTo(y, 4);
  }
});

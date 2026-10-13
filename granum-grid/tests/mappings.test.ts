import { expect, it } from 'vitest';
import { createZoomMapping } from '../src/core/mappings';
it('Zoom round-trips at all semantic scales', () => {
  for (const scale of [1 / 36, 0.5, 100, 200_000]) {
    const mapping = createZoomMapping(73_499_999, 500, scale);
    for (const y of [0, 100, 250, 499]) expect(mapping.toPixel(mapping.toRow(y))).toBeCloseTo(y, 4);
  }
});

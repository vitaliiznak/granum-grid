import { describe, expect, it } from 'vitest';
import { RowSizes, createEngine, createMeasuredLensMapping } from '../src/core/index';

describe('sparse measured row sizes', () => {
  it('matches a fully measured reference in both directions at distant addresses', () => {
    const sizes = new RowSizes(100_000_000, 36);
    const start = 73_500_000;
    const heights = Array.from({ length: 150 }, (_, index) => 20 + ((index * 47) % 190));
    sizes.measure(
      heights.map((height, i) => ({ index: start + i, height })),
      start,
    );
    let pixels = 0;
    heights.forEach((height, i) => {
      const position = start + i + 0.375;
      expect(sizes.distance(start, position)).toBeCloseTo(pixels + height * 0.375, 5);
      expect(sizes.advance(start, pixels + height * 0.375)).toBeCloseTo(position, 7);
      expect(sizes.advance(position, -pixels - height * 0.375)).toBeCloseTo(start, 7);
      pixels += height;
    });
    expect(sizes.advance(start, -18)).toBe(start - 0.5);
    expect(sizes.advance(0, -72)).toBe(-2);
    expect(sizes.advance(100_000_000, 72)).toBe(100_000_002);
  });

  it('bounds measurement storage independently of dataset length', () => {
    const sizes = new RowSizes(100_000_000, 36, 32);
    for (let start = 0; start < 100_000_000; start += 1_000_000)
      sizes.measure(
        Array.from({ length: 20 }, (_, i) => ({ index: start + i, height: 50 + i })),
        start,
      );
    expect(sizes.measuredCount).toBe(32);
    expect(sizes.size(99_000_000)).toBe(50);
    expect(sizes.size(0)).toBe(36);
    sizes.measure(
      [
        { index: -1, height: 30 },
        { index: 2, height: NaN },
        { index: 3, height: 0 },
      ],
      0,
    );
    expect(sizes.measuredCount).toBe(32);
    sizes.clear();
    expect(sizes.measuredCount).toBe(0);
    expect(() => new RowSizes(10, 0)).toThrow();
    expect(() => new RowSizes(10, 32, 0)).toThrow();
  });

  it('keeps measured Lens coordinates invertible and the focus at full size', () => {
    const sizes = new RowSizes(100_000_000, 36);
    sizes.measure([{ index: 73_500_000, height: 100 }], 73_500_000);
    const mapping = createMeasuredLensMapping(73_500_000, 100_000_000, 600, 36, sizes);
    expect(mapping.toPixel(73_500_000)).toBe(300);
    expect(mapping.toPixel(73_500_000.5) - mapping.toPixel(73_499_999.5)).toBeCloseTo(100);
    for (const row of [0, 2, 73_499_999.5, 73_500_000, 90_000_000, 99_999_999])
      expect(mapping.toRow(mapping.toPixel(row))).toBeCloseTo(row, 4);
  });

  it('evicts exactly the farthest unpinned measurements, matching a sorted reference', () => {
    const cap = 64;
    const sizes = new RowSizes(1_000_000, 30, cap);
    const reference = new Map<number, number>();
    let seed = 7;
    const random = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % n) | 0;
    for (let step = 0; step < 300; step++) {
      // Fractional anchors avoid distance ties, whose order is unspecified.
      const anchor = random(1_000_000) + 0.25;
      const rows = Array.from({ length: 1 + random(12) }, () => ({
        index: Math.max(0, Math.min(999_999, Math.floor(anchor) + random(400) - 200)),
        height: 10 + random(90),
      }));
      const retained = rows.slice(0, random(4)).map((row) => row.index);
      sizes.measure(rows, anchor, retained);
      for (const { index, height } of rows) reference.set(index, height);
      if (reference.size > cap) {
        const pinned = new Set(retained);
        const keep = cap - [...reference.keys()].filter((index) => pinned.has(index)).length;
        [...reference.keys()]
          .filter((index) => !pinned.has(index))
          .sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor))
          .slice(Math.max(0, keep))
          .forEach((index) => reference.delete(index));
      }
      expect(sizes.measuredCount).toBe(reference.size);
      for (const index of reference.keys()) expect(sizes.size(index)).toBe(reference.get(index));
      const from = random(1_000_000),
        to = random(1_000_000);
      const expected =
        (to - from) * 30 +
        [...reference]
          .filter(([index]) => index >= Math.min(from, to) && index < Math.max(from, to))
          .reduce((sum, [, height]) => sum + (height - 30) * Math.sign(to - from), 0);
      expect(sizes.distance(from, to)).toBeCloseTo(expected, 6);
    }
  });

  it('retains mounted measurements with a tiny budget and releases them after navigation', () => {
    const sizes = new RowSizes(100_000_000, 36, 1);
    sizes.measure(
      [
        { index: 100, height: 80 },
        { index: 101, height: 120 },
      ],
      100,
      [100, 101],
    );
    expect(sizes.measuredCount).toBe(2);
    expect(sizes.distance(100, 102)).toBe(200);
    sizes.measure([{ index: 1000, height: 70 }], 1000, [1000]);
    expect(sizes.measuredCount).toBe(1);
    expect(sizes.size(1000)).toBe(70);
  });
});

describe('dynamic height navigation', () => {
  const create = () =>
    createEngine({ rowCount: 100_000_000, rowHeight: 40, dynamicRowHeight: true });

  it('pans by measured pixels and anchors the visible row when it grows or earlier rows resize', () => {
    const engine = create();
    engine.goTo(73_500_000);
    engine.measureRows([{ index: 73_500_000, height: 100 }]);
    engine.pan(25);
    expect(engine.getSnapshot().position).toBe(73_500_000.25);
    engine.measureRows([
      { index: 73_500_000, height: 200 },
      { index: 73_499_999, height: 300 },
    ]);
    expect(engine.getSnapshot().position).toBe(73_500_000.125);
    engine.pan(175);
    expect(engine.getSnapshot().position).toBe(73_500_001);
    engine.pan(-50);
    expect(engine.getSnapshot().position).toBe(73_500_000.75);
  });

  it('aligns loaded rows and corrects center/end targets as measurements arrive', () => {
    const engine = create();
    engine.setViewport(400);
    for (const align of ['start', 'center', 'end'] as const) {
      engine.scrollToIndex(73_500_000, { align });
      engine.measureRows([
        { index: 73_500_000, height: align === 'start' ? 80 : align === 'center' ? 120 : 160 },
      ]);
      const height = engine.rowSizes.size(73_500_000);
      expect(engine.rowSizes.distance(engine.getSnapshot().position, 73_500_000)).toBeCloseTo(
        align === 'start' ? 0 : align === 'center' ? (400 - height) / 2 : 400 - height,
        5,
      );
    }
    const position = engine.getSnapshot().position;
    engine.scrollToIndex(73_500_000, { align: 'auto' });
    expect(engine.getSnapshot().position).toBe(position);
    engine.pan(20);
    const afterPan = engine.getSnapshot().position;
    engine.measureRows([{ index: 73_500_000, height: 220 }]);
    expect(engine.getSnapshot().position).toBe(afterPan); // Input cancels target alignment.
  });

  it('restores fractional locations and can read the bottom of an oversized final row', () => {
    const engine = create();
    engine.goTo(12345);
    engine.pan(10);
    const saved = engine.getLocation();
    engine.goTo(99_999_999);
    engine.setViewport(400);
    engine.measureRows([{ index: 99_999_999, height: 1000 }]);
    engine.pan(10_000);
    expect(engine.getSnapshot().position).toBeCloseTo(99_999_999.6);
    expect(engine.getSnapshot().activeIndex).toBe(99_999_999);
    engine.restore(saved);
    expect(engine.getLocation()).toEqual(saved);
    expect(
      createEngine({ rowCount: 100_000_000, rowHeight: 40, initialLocation: saved }).getLocation(),
    ).toEqual(saved);
    expect(() => engine.restore({ ...saved, position: NaN })).toThrow();
  });

  it('preserves the row under the pointer when crossing detail and aggregate Zoom', () => {
    const engine = create();
    engine.setViewport(400);
    engine.goTo(73_500_000);
    engine.measureRows([
      { index: 73_500_000, height: 160 },
      { index: 73_500_001, height: 90 },
    ]);
    const anchorY = 100;
    const anchor = engine.rowSizes.advance(engine.getSnapshot().position, anchorY) - 0.5;
    engine.setZoom(2, anchorY);
    expect(engine.getSnapshot().position + (anchorY - 200) * 2).toBeCloseTo(anchor, 6);
    engine.setZoom(1 / 40, anchorY);
    expect(
      engine.rowSizes.advance(engine.getSnapshot().position + 0.5, anchorY - 200) - 0.5,
    ).toBeCloseTo(anchor, 6);
  });
});

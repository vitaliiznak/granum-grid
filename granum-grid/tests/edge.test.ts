import { expect, it } from 'vitest';
import { edgeVisual, splitEdgeDelta } from '../src/dom/input';

it('resists overscroll so the edge stays a short wall', () => {
  expect(edgeVisual(0)).toBe(0);
  expect(edgeVisual(40)).toBeGreaterThan(8);
  expect(edgeVisual(40)).toBeLessThan(40);
  expect(edgeVisual(200)).toBeGreaterThan(edgeVisual(40));
  expect(edgeVisual(10_000)).toBeLessThanOrEqual(48);
  expect(edgeVisual(10_000) - edgeVisual(400)).toBeLessThan(8);
  expect(edgeVisual(-80)).toBeCloseTo(-edgeVisual(80), 5);
});

it('releases an edge pull before rows move', () => {
  expect(splitEdgeDelta(30, -12)).toEqual({ pull: 18, pan: 0 });
  expect(splitEdgeDelta(30, -40)).toEqual({ pull: 0, pan: -10 });
  expect(splitEdgeDelta(30, 15)).toEqual({ pull: 30, pan: 15 });
  expect(splitEdgeDelta(0, 20)).toEqual({ pull: 0, pan: 20 });
  expect(splitEdgeDelta(-10, 4)).toEqual({ pull: -6, pan: 0 });
  expect(splitEdgeDelta(-10, 16)).toEqual({ pull: 0, pan: 6 });
});

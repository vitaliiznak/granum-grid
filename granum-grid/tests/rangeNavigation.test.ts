import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/core/engine';

describe('range drill-down', () => {
  it('keeps a fitted range visible through layout changes until the user pans', () => {
    const engine = createEngine({ rowCount: 10_000 });
    engine.setViewport(500);
    engine.zoomToRange({ start: 1000, end: 2000 });
    engine.zoomToRange({ start: 1000, end: 2000 });
    engine.setViewport(250);
    expect(engine.getLocation()).toEqual({ position: 1500, view: 'zoom', rowsPerPixel: 4 });
    engine.pan(10);
    engine.setViewport(500);
    expect(engine.getLocation()).toEqual({ position: 1540, view: 'zoom', rowsPerPixel: 4 });
  });
  it('restores both scale and position through zoom, inspect, back and forward', () => {
    const engine = createEngine({ rowCount: 100_000, initialIndex: 75 });
    engine.setViewport(500);
    const origin = engine.getLocation();
    engine.zoomToRange({ start: 10_000, end: 20_000 });
    expect(engine.getLocation()).toEqual({ position: 15_000, view: 'zoom', rowsPerPixel: 20 });
    const overview = engine.getLocation();
    engine.zoomToRange({ start: 12_000, end: 13_000 });
    const detail = engine.getLocation();
    engine.scrollToIndex(12_010, { align: 'start' });
    expect(engine.getLocation().view).toBe('rows');
    engine.back();
    expect(engine.getLocation()).toEqual(detail);
    engine.back();
    expect(engine.getLocation()).toEqual(overview);
    engine.back();
    expect(engine.getLocation()).toEqual(origin);
    engine.forward();
    expect(engine.getLocation()).toEqual(overview);
  });
  it('rejects invalid ranges without moving and keeps repeated fits out of history', () => {
    const engine = createEngine({ rowCount: 100 });
    for (const range of [
      { start: 0, end: 0 },
      { start: -1, end: 2 },
      { start: 3, end: 101 },
      { start: 1.5, end: 2 },
    ])
      expect(() => engine.zoomToRange(range)).toThrow(RangeError);
    expect(engine.getSnapshot().canGoBack).toBe(false);
    engine.zoomToRange({ start: 0, end: 100 });
    engine.zoomToRange({ start: 0, end: 100 });
    engine.back();
    expect(engine.getSnapshot().canGoBack).toBe(false);
    const empty = createEngine({ rowCount: 0 });
    expect(() => empty.zoomToRange({ start: 0, end: 1 })).toThrow(RangeError);
  });
});

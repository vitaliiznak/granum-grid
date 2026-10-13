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

describe('marker, chapter, and history navigation', () => {
  const setup = () => {
    const engine = createEngine({ rowCount: 1000, rowHeight: 20 });
    engine.setViewport(200);
    engine.setMotion(false);
    engine.setMetadata(
      [
        { id: 'a', index: 100, label: 'A', kind: 'event' },
        { id: 'b', index: 400, label: 'B', kind: 'spike' },
        { id: 'c', index: 700, label: 'C', kind: 'event' },
      ],
      [
        { id: 'one', start: 0, end: 250, label: 'One' },
        { id: 'two', start: 250, end: 600, label: 'Two' },
        { id: 'three', start: 600, end: 1000, label: 'Three' },
      ],
    );
    return engine;
  };
  it('steps through markers, optionally by kind, and stops at either end', () => {
    const engine = setup();
    engine.nextMarker();
    expect(engine.getSnapshot().position).toBe(100);
    engine.nextMarker('event');
    expect(engine.getSnapshot().position).toBe(700);
    engine.nextMarker();
    expect(engine.getSnapshot().position).toBe(700);
    engine.previousMarker('spike');
    expect(engine.getSnapshot().position).toBe(400);
    engine.previousMarker();
    engine.previousMarker();
    expect(engine.getSnapshot().position).toBe(100);
  });
  it('moves between chapter starts', () => {
    const engine = setup();
    engine.nextChapter();
    engine.nextChapter();
    expect(engine.getSnapshot().position).toBe(600);
    engine.nextChapter();
    expect(engine.getSnapshot().position).toBe(600);
    engine.previousChapter();
    expect(engine.getSnapshot().position).toBe(250);
  });
  it('restores each location with its view and zoom through back and forward', () => {
    const engine = setup();
    engine.goTo(100);
    engine.zoomToRange({ start: 200, end: 400 });
    const zoomed = engine.getLocation();
    engine.goTo(900);
    engine.back();
    expect(engine.getLocation()).toEqual(zoomed);
    engine.back();
    expect(engine.getLocation()).toMatchObject({ position: 100, view: 'rows' });
    engine.forward();
    expect(engine.getLocation()).toEqual(zoomed);
    // New navigation clears the forward stack.
    engine.goTo(5);
    expect(engine.getSnapshot().canGoForward).toBe(false);
  });
  it('switches views without moving and cancels an animated flight in place', () => {
    const engine = setup();
    engine.goTo(300);
    engine.setView('zoom');
    expect(engine.getLocation()).toMatchObject({ position: 300, view: 'zoom' });
    engine.setMotion(true);
    engine.goTo(900);
    expect(engine.getSnapshot().moving).toBe(true);
    // The first frame starts the flight clock; the second is partway through.
    engine.step(1000);
    engine.step(1100);
    engine.cancel();
    const stopped = engine.getSnapshot();
    expect(stopped.moving).toBe(false);
    expect(stopped.position).toBeGreaterThan(300);
    expect(stopped.position).toBeLessThan(900);
  });
  it('keeps a bounded visited trail without near-duplicates', () => {
    const engine = createEngine({ rowCount: 1_000_000, rowHeight: 20 });
    engine.setViewport(200);
    engine.setMotion(false);
    engine.visit();
    engine.scrub(500);
    engine.visit();
    expect(engine.getSnapshot().trail).toEqual([0]);
    for (let i = 1; i <= 120; i++) {
      engine.scrub(i * 5000);
      engine.visit();
    }
    const trail = engine.getSnapshot().trail;
    expect(trail).toHaveLength(100);
    expect(trail.at(-1)).toBe(600_000);
  });
});

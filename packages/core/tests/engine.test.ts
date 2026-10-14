import { describe, expect, it } from 'vitest';
import { createEngine, pixelToRow, rowToPixel, rowToProgress, progressToRow } from '../src/index';
describe('100M row coordinates', () => {
  it('retains fractional positions and reaches the exact final row', () => {
    const engine = createEngine({ rowCount: 100_000_000, rowHeight: 32 });
    engine.goTo(73_499_999);
    engine.pan(8);
    expect(engine.getSnapshot().position).toBe(73_499_999.25);
    engine.goTo(100_000_000);
    // The default 480 px viewport holds 15 rows; the last one ends at its bottom.
    expect(engine.getSnapshot().position).toBe(99_999_985);
    expect(engine.getSnapshot().maxPosition).toBe(99_999_985);
    expect(engine.getSnapshot().activeIndex).toBe(99_999_999);
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
  it('restores each location with its row offset through back and forward', () => {
    const engine = setup();
    engine.goTo(100);
    engine.goTo(300);
    engine.pan(5);
    const saved = engine.getLocation();
    engine.goTo(900);
    engine.back();
    expect(engine.getLocation()).toEqual(saved);
    engine.back();
    expect(engine.getLocation()).toMatchObject({ position: 100 });
    engine.forward();
    expect(engine.getLocation()).toEqual(saved);
    // New navigation clears the forward stack.
    engine.goTo(5);
    expect(engine.getSnapshot().canGoForward).toBe(false);
  });
  it('keeps a bounded visited trail without near-duplicates', () => {
    const engine = createEngine({ rowCount: 1_000_000, rowHeight: 20 });
    engine.setViewport(200);
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

describe('the end of the dataset', () => {
  // 100 rows of 20 px in a 200 px viewport: ten rows fit, so the end clamp is row 90.
  const setup = () => {
    const engine = createEngine({ rowCount: 100, rowHeight: 20 });
    engine.setViewport(200);
    return engine;
  };
  it('stops when the last row ends at the bottom of the viewport', () => {
    const engine = setup();
    expect(engine.getSnapshot().maxPosition).toBe(90);
    engine.pan(10_000);
    expect(engine.getSnapshot()).toMatchObject({ position: 90, activeIndex: 90 });
  });
  it('keeps a jumped-to row current below the clamp until the reader moves', () => {
    const engine = setup();
    const announced: number[] = [];
    engine.onNavigate(() => announced.push(engine.getSnapshot().activeIndex!));
    engine.goTo(97);
    expect(engine.getSnapshot()).toMatchObject({ position: 90, activeIndex: 97, canGoBack: true });
    expect(announced).toEqual([97]);
    // Already in view: the row becomes current without moving or a history entry.
    engine.goTo(99);
    expect(engine.getSnapshot()).toMatchObject({ position: 90, activeIndex: 99 });
    engine.back();
    expect(engine.getSnapshot().position).toBe(0);
    // History keeps addresses, so returning to the end makes the first visible row current.
    engine.forward();
    expect(engine.getSnapshot()).toMatchObject({ position: 90, activeIndex: 90 });
    engine.goTo(99);
    // A push past the end does not move, so the row stays current; moving up releases it.
    engine.pan(20);
    expect(engine.getSnapshot().activeIndex).toBe(99);
    engine.pan(-20);
    expect(engine.getSnapshot()).toMatchObject({ position: 89, activeIndex: 89 });
  });
  it('keeps that row in view when the viewport shrinks or rows are measured', () => {
    const engine = setup();
    engine.goTo(99);
    engine.setViewport(100);
    expect(engine.getSnapshot()).toMatchObject({ position: 95, maxPosition: 95, activeIndex: 99 });
    engine.setViewport(200);
    expect(engine.getSnapshot()).toMatchObject({ position: 90, activeIndex: 99 });
    const dynamic = createEngine({ rowCount: 100, rowHeight: 20, dynamicRowHeight: true });
    dynamic.setViewport(200);
    dynamic.goTo(99);
    dynamic.measureRows([{ index: 99, height: 60 }]);
    expect(dynamic.getSnapshot()).toMatchObject({ position: 92, maxPosition: 92, activeIndex: 99 });
  });
  it('keeps a short dataset at the top', () => {
    const engine = createEngine({ rowCount: 5, rowHeight: 20 });
    engine.setViewport(200);
    engine.goTo(4);
    expect(engine.getSnapshot()).toMatchObject({ position: 0, maxPosition: 0, activeIndex: 4 });
  });
});

describe('row layout changes', () => {
  it('keep the current row, its offset, and history', () => {
    const engine = createEngine({ rowCount: 1_000_000, rowHeight: 32 });
    engine.setViewport(320);
    engine.goTo(500_000);
    engine.pan(16);
    engine.setRowLayout(24, false);
    const snapshot = engine.getSnapshot();
    expect(snapshot).toMatchObject({ rowHeight: 24, activeIndex: 500_000, canGoBack: true });
    // The pixel offset into the row is kept, so the row's top stays where it was.
    expect(snapshot.position).toBeCloseTo(500_000 + 16 / 24, 9);
    expect(snapshot.maxPosition).toBe(1_000_000 - 320 / 24);
    engine.pan(-16);
    expect(engine.getSnapshot().position).toBe(500_000);
    engine.setRowLayout(24, true);
    engine.measureRows([{ index: 500_000, height: 60 }]);
    expect(engine.getSnapshot().measuredRows).toBe(1);
    // Fixed heights drop measurements, so alignment uses the fixed height again.
    engine.setRowLayout(24, false);
    expect(engine.getSnapshot()).toMatchObject({ measuredRows: 0, activeIndex: 500_000 });
    expect(engine.rowSizes.size(500_000)).toBe(24);
    engine.back();
    expect(engine.getSnapshot().position).toBe(0);
    expect(() => engine.setRowLayout(0, false)).toThrow(RangeError);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEngine } from '../src/core/engine';
import { rowMapping, rowWindow } from '../src/dom/rows';
import { createRowRequests } from '../src/dom/requests';

const session = (loaded: Set<number>) => ({
  has: (index: number) => loaded.has(index),
  read: (index: number) => ({ index }),
  error: (index: number) => (index === 7 ? 'boom' : undefined),
  overview: [],
});

describe('rowWindow', () => {
  it('mounts the visible rows plus overscan, at viewport pixels, ready or pending', () => {
    const engine = createEngine({ rowCount: 1000, rowHeight: 20 });
    engine.setViewport(100);
    engine.goTo(10);
    const layout = { rowHeight: 20, dynamic: false };
    const view = rowWindow(engine, session(new Set([10, 11])), rowMapping(engine, layout), {
      ...layout,
      rowCount: 1000,
      overscan: 2,
    });
    expect(view.visibleRange).toEqual({ start: 10, end: 15 });
    expect(view.start).toBe(8);
    expect(view.rows.map((slot) => [slot.index, slot.y, slot.status])).toEqual([
      [8, -40, 'loading'],
      [9, -20, 'loading'],
      [10, 0, 'ready'],
      [11, 20, 'ready'],
      [12, 40, 'loading'],
      [13, 60, 'loading'],
      [14, 80, 'loading'],
      [15, 100, 'loading'],
      [16, 120, 'loading'],
    ]);
  });

  it('stops at the dataset and reports failed rows', () => {
    const engine = createEngine({ rowCount: 9, rowHeight: 20 });
    engine.setViewport(100);
    engine.goTo(8);
    const layout = { rowHeight: 20, dynamic: false };
    const view = rowWindow(engine, session(new Set()), rowMapping(engine, layout), {
      ...layout,
      rowCount: 9,
      overscan: 2,
    });
    expect(view.rows.at(-1)!.index).toBe(8);
    expect(view.rows.find((slot) => slot.index === 7)).toMatchObject({
      status: 'error',
      error: 'boom',
    });
  });
});

describe('createRowRequests', () => {
  afterEach(() => vi.useRealTimers());
  it('acts only on changes and predicts the next page after a pause', () => {
    vi.useFakeTimers();
    const engine = createEngine({ rowCount: 1_000_000, rowHeight: 20 });
    const calls: [string, number, number][] = [];
    const fake = {
      setRange: (owner: string, start: number, count: number) => calls.push([owner, start, count]),
    };
    const requests = createRowRequests(engine, fake as never, () => 0.5);
    requests.update({ start: 0, count: 10, prefetch: true });
    requests.update({ start: 0, count: 10, prefetch: true });
    expect(calls).toEqual([
      ['visible', 0, 10],
      ['prefetch', 0, 0],
    ]);
    vi.advanceTimersByTime(70);
    // 0.5 rows per millisecond, 160 ms ahead of row 0.
    expect(calls.at(-1)).toEqual(['prefetch', 80, 10]);
    requests.destroy();
    expect(calls.at(-1)).toEqual(['prefetch', 0, 0]);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEngine } from '../src/core/engine';
import { MAX_SCROLL, bindScroll, scrollMapping } from '../src/dom/scroll';

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

/** A scroll container as bindScroll sees it: an offset, a spacer child, event listeners. */
function fakeScroller() {
  const listeners = new Map<string, Set<() => void>>();
  const on = (type: string) => listeners.get(type) ?? listeners.set(type, new Set()).get(type)!;
  const node = () => ({ dataset: {}, style: {}, setAttribute() {}, remove() {} });
  const element = {
    scrollTop: 0,
    ownerDocument: { createElement: node },
    append() {},
    addEventListener: (type: string, listener: () => void) => on(type).add(listener),
    removeEventListener: (type: string, listener: () => void) => on(type).delete(listener),
  };
  const fire = (type: string) => on(type).forEach((listener) => listener());
  return {
    element: element as unknown as HTMLElement,
    /** The browser reports the current offset, as it does once per frame. */
    report: () => fire('scroll'),
    wheel: () => fire('wheel'),
  };
}

describe('native scroll binding', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a wheel step that lands just before the pause re-anchors the offset', () => {
    vi.useFakeTimers();
    const e = engine(100_000_000, 40, 400);
    const { element, report } = fakeScroller();
    const unbind = bindScroll(element, e);
    try {
      e.goTo(73_500_000);
      report();
      const anchored = element.scrollTop;
      // A new viewport size schedules a re-anchor after the pause.
      e.setViewport(410);
      vi.advanceTimersByTime(140);
      // A 400-pixel wheel step: the browser moves the offset now and reports it next frame,
      // after the re-anchor is due.
      element.scrollTop = anchored + 400;
      vi.advanceTimersByTime(20);
      report();
      expect(e.getSnapshot().position).toBe(73_500_010);
      // Once the scrolling pauses, the offset re-anchors to the rows.
      vi.advanceTimersByTime(200);
      expect(element.scrollTop).toBeCloseTo(scrollMapping(e).toScroll(73_500_010), 6);
      expect(e.getSnapshot().position).toBe(73_500_010);
    } finally {
      unbind();
      e.destroy();
    }
  });

  it('does not cancel a wheel step the browser has not applied yet (Firefox)', () => {
    vi.useFakeTimers();
    const e = engine(100_000_000, 40, 400);
    const { element, report, wheel } = fakeScroller();
    const unbind = bindScroll(element, e);
    try {
      e.goTo(73_500_000);
      report();
      const anchored = element.scrollTop;
      e.setViewport(410);
      vi.advanceTimersByTime(140);
      // Firefox dispatches the wheel event, then scrolls off the main thread a few
      // milliseconds later, unless a script sets the offset first.
      wheel();
      vi.advanceTimersByTime(20);
      if (element.scrollTop === anchored) element.scrollTop = anchored + 400;
      report();
      expect(e.getSnapshot().position).toBe(73_500_010);
    } finally {
      unbind();
      e.destroy();
    }
  });
});

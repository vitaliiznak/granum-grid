import { clamp } from '../core/mappings.js';
import type { GranumGridEngine } from '../core/engine.js';
import { handleMovementKey } from './keyboard.js';
import { NATIVE_SCROLL, isWithin, ownsKeys } from './targets.js';

/**
 * Largest scroll range the spacer creates. Every supported browser allows taller elements
 * (Firefox stops near 17.9 million pixels); staying well below keeps offsets exact.
 */
export const MAX_SCROLL = 8_000_000;
/** Rows within this many viewports of either end scroll one to one, so both ends are exact. */
const EDGE_VIEWPORTS = 4;
/** A step longer than this many viewports is a scrollbar drag, which addresses the dataset. */
const GLOBAL_STEP = 2;
/** Quiet time after the last scroll event before the offset is re-anchored to the rows. */
const SETTLE_MS = 150;

export interface ScrollMapping {
  /** The largest scroll offset. */
  range: number;
  /** Offsets this close to an end scroll one to one with the rows. */
  edge: number;
  toScroll(position: number): number;
  toPosition(offset: number): number;
}

/**
 * Native scroll offsets for the engine's float row address. While the rows fit in
 * `MAX_SCROLL` pixels an offset is the rows' own pixel offset. Beyond that the first and last
 * `edge` pixels stay one to one and the middle is compressed, so the scrollbar addresses the
 * whole dataset and both ends are reached exactly.
 */
export function scrollMapping(
  engine: Pick<GranumGridEngine, 'rowSizes' | 'getSnapshot'>,
): ScrollMapping {
  const { maxPosition, height } = engine.getSnapshot();
  const sizes = engine.rowSizes;
  const content = Math.max(0, sizes.distance(0, maxPosition));
  const range = Math.min(content, MAX_SCROLL);
  const edge = Math.min(EDGE_VIEWPORTS * height, range / 4);
  const compressed = content > range;
  const scale = compressed ? (range - 2 * edge) / (content - 2 * edge) : 1;
  return {
    range,
    edge: compressed ? edge : range,
    toScroll(position) {
      const pixels = clamp(sizes.distance(0, position), 0, content);
      if (!compressed || pixels <= edge) return pixels;
      if (content - pixels <= edge) return range - (content - pixels);
      return edge + (pixels - edge) * scale;
    },
    toPosition(offset) {
      const s = clamp(offset, 0, range);
      const pixels =
        !compressed || s <= edge
          ? s
          : range - s <= edge
            ? content - (range - s)
            : edge + (s - edge) / scale;
      return clamp(sizes.advance(0, pixels), 0, maxPosition);
    },
  };
}

export interface ScrollOptions {
  /**
   * The element the rows are drawn in, inside an element scroller. It is moved to the
   * current scroll offset, so rows positioned in viewport pixels scroll natively with it.
   */
  layer?: HTMLElement | null;
  /** Recent movement in rows per millisecond, for predicting the next page. */
  onVelocity?(rowsPerMs: number): void;
}

interface Scroller {
  get(): number;
  set(offset: number): void;
  /** The viewport height the spacer adds to the scroll range. */
  viewport(): number;
  listen(type: 'scroll' | 'resize' | 'keydown', listener: (event: Event) => void): () => void;
  spacer: HTMLElement;
  destroy(): void;
}

/** `viewport` reads the engine's height, so no scroll frame forces a layout read. */
function elementScroller(element: HTMLElement, viewport: () => number): Scroller {
  const spacer = element.ownerDocument.createElement('div');
  spacer.dataset.dsScrollSpacer = '';
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.cssText =
    'position:absolute;top:0;left:0;width:1px;visibility:hidden;pointer-events:none;';
  element.append(spacer);
  return {
    get: () => element.scrollTop,
    set: (offset) => {
      element.scrollTop = offset;
    },
    viewport,
    listen(type, listener) {
      if (type !== 'scroll') return () => {};
      element.addEventListener('scroll', listener, { passive: true });
      return () => element.removeEventListener('scroll', listener);
    },
    spacer,
    destroy: () => spacer.remove(),
  };
}

function windowScroller(view: Window): Scroller {
  const document = view.document;
  const spacer = document.createElement('div');
  spacer.dataset.dsWindowSpacer = '';
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.cssText = 'width:1px;pointer-events:none;overflow-anchor:none;';
  document.body.append(spacer);
  const restoration = view.history.scrollRestoration;
  view.history.scrollRestoration = 'manual';
  const start = view.scrollY;
  return {
    get: () => view.scrollY,
    set: (offset) => view.scrollTo({ top: offset, behavior: 'instant' }),
    viewport: () => view.innerHeight,
    listen(type, listener) {
      const passive = type !== 'keydown';
      view.addEventListener(type, listener, { passive });
      return () => view.removeEventListener(type, listener);
    },
    spacer,
    destroy() {
      spacer.remove();
      view.history.scrollRestoration = restoration;
      view.scrollTo({ top: start, behavior: 'instant' });
    },
  };
}

/**
 * Drive the engine from native scrolling. Small steps (wheel, trackpad, touch, keys) move
 * the rows by exactly the pixels scrolled; a step longer than two viewports, such as a
 * scrollbar drag, goes to the address the offset maps to. Navigation from anywhere else
 * (jumps, the map, history, keys the explorer handles) moves the offset to match, and a
 * pause re-anchors the offset to the rows. With a window, keys outside the page's own
 * scrolling panels move the rows.
 */
export function bindScroll(
  target: HTMLElement | Window,
  engine: GranumGridEngine,
  { layer, onVelocity }: ScrollOptions = {},
): () => void {
  const page = 'document' in target;
  const scroller =
    'document' in target
      ? windowScroller(target)
      : elementScroller(target, () => engine.getSnapshot().height);
  let mapping = scrollMapping(engine);
  let current = scroller.get();
  /** An offset set here; the scroll event it causes is not input. */
  let expected: number | null = null;
  let handling = false;
  let { position: lastPosition, layoutVersion: lastLayout } = engine.getSnapshot();
  let lastTime = 0,
    velocity = 0;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let spacerHeight = -1;

  const place = () => {
    if (layer && !page) layer.style.transform = `translateY(${current}px)`;
  };
  const fit = () => {
    const height = mapping.range + scroller.viewport();
    if (height !== spacerHeight) {
      spacerHeight = height;
      scroller.spacer.style.height = `${height}px`;
    }
  };
  const scrollTo = (offset: number) => {
    const top = clamp(offset, 0, mapping.range);
    if (Math.abs(top - current) >= 0.5) {
      scroller.set(top);
      // The browser's own value, after its rounding and clamping.
      current = expected = scroller.get();
    }
    place();
  };
  const anchor = () => scrollTo(mapping.toScroll(engine.getSnapshot().position));
  const settle = () => {
    settleTimer = undefined;
    engine.visit();
    anchor();
  };
  const later = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, SETTLE_MS);
  };

  const scroll = () => {
    const offset = scroller.get();
    if (expected !== null && Math.abs(offset - expected) < 0.5) {
      expected = null;
      current = offset;
      return;
    }
    expected = null;
    const delta = offset - current;
    current = offset;
    place();
    const before = engine.getSnapshot();
    handling = true;
    try {
      if (offset <= 0) engine.scrub(0);
      else if (offset >= mapping.range - 0.5) engine.scrub(before.maxPosition);
      else if (Math.abs(delta) > GLOBAL_STEP * before.height)
        engine.scrub(mapping.toPosition(offset));
      else engine.pan(delta);
    } finally {
      handling = false;
    }
    const after = engine.getSnapshot();
    lastPosition = after.position;
    lastLayout = after.layoutVersion;
    const now = performance.now();
    const elapsed = now - lastTime;
    lastTime = now;
    velocity =
      elapsed > 0 && elapsed < 100
        ? 0.5 * velocity + (0.5 * (after.position - before.position)) / elapsed
        : 0;
    onVelocity?.(velocity);
    // Near an end with rows still beyond it, the offset would run out first: re-anchor now.
    const wanted = mapping.toScroll(after.position);
    if (
      (offset < mapping.edge / 2 && wanted > offset + 1) ||
      (offset > mapping.range - mapping.edge / 2 && wanted < offset - 1)
    )
      anchor();
    later();
  };

  const unsubscribe = engine.subscribe(() => {
    mapping = scrollMapping(engine);
    fit();
    if (handling) return;
    const { position, layoutVersion } = engine.getSnapshot();
    const navigated = position !== lastPosition && layoutVersion === lastLayout;
    lastPosition = position;
    lastLayout = layoutVersion;
    // Navigation moves the offset at once. New measurements or a new size only change
    // where the offset should be; moving it mid-gesture would stop momentum scrolling.
    if (navigated) anchor();
    else later();
  });

  const offs = [scroller.listen('scroll', scroll)];
  if (page) {
    offs.push(
      scroller.listen('resize', () => {
        fit();
        later();
      }),
      scroller.listen('keydown', (event) => {
        const key = event as KeyboardEvent;
        if (key.defaultPrevented || ownsKeys(key.target) || isWithin(key.target, NATIVE_SCROLL))
          return;
        handleMovementKey(key, engine, { space: true });
      }),
    );
  }
  fit();
  anchor();
  return () => {
    unsubscribe();
    offs.forEach((off) => off());
    clearTimeout(settleTimer);
    if (layer) layer.style.transform = '';
    scroller.destroy();
  };
}

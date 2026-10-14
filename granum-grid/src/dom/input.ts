import { clamp, wheelPixels } from '../core/mappings.js';
import type { GranumGridEngine } from '../core/engine.js';
import { NATIVE_SCROLL, isControl, isTextEntry } from './targets.js';

/** Largest rubber-band shift. Further pull barely moves, so the edge reads as a wall. */
const EDGE_LIMIT = 48;
/** Wheel events closer together than this, trackpad momentum included, are one gesture. */
const WHEEL_GESTURE_GAP = 200;

/** Signed visual offset for accumulated overscroll. Positive is past the end. */
export function edgeVisual(pull: number): number {
  if (!pull) return 0;
  return Math.sign(pull) * EDGE_LIMIT * (1 - Math.exp(-Math.abs(pull) / 170));
}

/**
 * Opposite motion releases the rubber band before rows move, so the return
 * and the scroll stay one gesture.
 */
export function splitEdgeDelta(pull: number, pixels: number): { pull: number; pan: number } {
  if (!pull || Math.sign(pixels) === Math.sign(pull)) return { pull, pan: pixels };
  const release = Math.min(Math.abs(pull), Math.abs(pixels));
  const sign = Math.sign(pixels);
  return { pull: pull + sign * release, pan: pixels - sign * release };
}
/** Feature switches are final: reduced motion has already turned off the motion ones. */
interface InputOptions {
  windowScroll?: boolean;
  inertia: boolean;
  elasticity: boolean;
  onEdge(offset: number): void;
  onVelocity(rowsPerMs: number): void;
}
/** Browser adapters own input listeners and RAFs; the engine only receives numbers. */
export function bindInputs(viewport: HTMLElement, engine: GranumGridEngine, options: InputOptions) {
  const wheelSurface = options.windowScroll
    ? (viewport.closest<HTMLElement>('[data-ds-root]') ?? viewport)
    : viewport;
  // The last clientY of each touch pointer; a second touch makes the gesture a pinch.
  const touches = new Map<number, number>();
  let pinch = false,
    lastTime = 0,
    velocity = 0,
    inertiaFrame = 0,
    settleTimer: ReturnType<typeof setTimeout> | undefined;
  let edge = 0,
    pull = 0,
    edgeFrame = 0,
    moved = false,
    suppressClick = false;
  // Whether a wheel target scrolls natively. Reused within a gesture to skip layout reads.
  let native = { target: null as EventTarget | null, until: 0, scrolls: false };
  // Who receives the current wheel gesture in an embedded viewport, decided when it starts.
  let wheelOwner: 'rows' | 'page' = 'rows',
    lastWheel = -Infinity;
  /** Whether a push of `pixels` would move past either end. */
  const blocked = (pixels: number) => {
    const { position, maxPosition } = engine.getSnapshot();
    return (pixels < 0 && position <= 0) || (pixels > 0 && position >= maxPosition);
  };
  /** `overscroll-behavior: contain` or `none` on the viewport keeps every gesture in the rows. */
  const contained = () => /^(contain|none)$/.test(getComputedStyle(viewport).overscrollBehaviorY);
  const scrollsNatively = (target: EventTarget | null) => {
    for (
      let node = target as HTMLElement | null;
      node !== wheelSurface;
      node = node.parentElement
    ) {
      if (!node || node.matches(NATIVE_SCROLL)) return true;
      if (
        node.scrollHeight > node.clientHeight &&
        /^(auto|scroll)$/.test(getComputedStyle(node).overflowY)
      )
        return true;
    }
    return false;
  };
  const cancelInertia = () => {
    cancelAnimationFrame(inertiaFrame);
    inertiaFrame = 0;
  };
  const showEdge = () => {
    const next = options.elasticity ? -edgeVisual(pull) : 0;
    if (next === edge) return;
    edge = next;
    options.onEdge(edge);
  };
  const releaseEdge = () => {
    cancelAnimationFrame(edgeFrame);
    let previous = performance.now();
    const step = (now: number) => {
      const dt = Math.min(34, now - previous);
      previous = now;
      pull *= Math.exp(-dt / 130);
      if (Math.abs(pull) < 0.4) pull = 0;
      showEdge();
      if (pull) edgeFrame = requestAnimationFrame(step);
    };
    if (pull) edgeFrame = requestAnimationFrame(step);
  };
  const settle = () => {
    engine.visit();
    releaseEdge();
  };
  const pan = (pixels: number, time: number, measure = true) => {
    cancelAnimationFrame(edgeFrame);
    const state = engine.getSnapshot();
    const scale = 1 / state.rowHeight;
    const split = options.elasticity ? splitEdgeDelta(pull, pixels) : { pull: 0, pan: pixels };
    if (options.elasticity) pull = split.pull;
    const before = state.position;
    const overflow = split.pan ? (engine.pan(split.pan) ?? 0) : 0;
    const movedRows = engine.getSnapshot().position !== before;
    if (options.elasticity) pull += overflow;
    else pull = 0;
    showEdge();
    if (movedRows && measure) {
      const elapsed = lastTime ? clamp(time - lastTime, 8, 64) : 16;
      velocity = 0.5 * velocity + (0.5 * pixels) / elapsed;
      lastTime = time;
      options.onVelocity(velocity * scale);
    }
    clearTimeout(settleTimer);
    // A blocked edge should start returning as soon as the gesture pauses.
    // Real row movement waits longer, so a gesture's short pauses are not separate visits.
    if (movedRows || pull) settleTimer = setTimeout(settle, movedRows ? 140 : 60);
  };
  const wheel = (event: WheelEvent) => {
    if (event.defaultPrevented || isTextEntry(event.target)) return;
    const now = performance.now();
    const newGesture = now - lastWheel > WHEEL_GESTURE_GAP;
    lastWheel = now;
    if (options.windowScroll) {
      // Panels and dialogs retain their own native scrolling, including any
      // nested explorer. The fixed page's remaining surface uses row pixels.
      if (event.target !== native.target || now > native.until)
        native = { target: event.target, until: 0, scrolls: scrollsNatively(event.target) };
      native.until = now + 200;
      if (native.scrolls) return;
    }
    // Sideways wheels belong to wide content and horizontally scrolling ancestors.
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    cancelInertia();
    // Browser zoom remains available; there is no separate summary zoom mode.
    if (event.ctrlKey) return;
    const pixels = wheelPixels(
      event.deltaY,
      event.deltaMode,
      viewport.clientHeight,
      engine.getSnapshot().rowHeight,
    );
    if (!options.windowScroll) {
      // As with a native scroller, a gesture that starts by pushing past an end scrolls the
      // page, and one that starts by moving rows keeps them until it ends.
      if (newGesture) wheelOwner = blocked(pixels) && !contained() ? 'page' : 'rows';
      if (wheelOwner === 'page') return;
    }
    event.preventDefault();
    // Without elastic edges, a push past either end does nothing.
    if (!options.elasticity && blocked(pixels)) return;
    pan(pixels, now);
  };
  const down = (event: PointerEvent) => {
    cancelInertia();
    velocity = 0;
    lastTime = performance.now();
    // A pan may end without a click to suppress; never let that swallow the next tap.
    suppressClick = false;
    if (event.pointerType !== 'touch' || isControl(event.target)) return;
    viewport.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, event.clientY);
    moved = false;
    if (touches.size === 2) {
      pinch = true;
      moved = true;
    }
  };
  const move = (event: PointerEvent) => {
    const previous = touches.get(event.pointerId);
    if (previous === undefined) return;
    event.preventDefault();
    touches.set(event.pointerId, event.clientY);
    moved ||= Math.abs(previous - event.clientY) > 2;
    if (touches.size === 2) {
      moved = true;
    } else pan(previous - event.clientY, performance.now());
  };
  const up = (event: PointerEvent) => {
    if (!touches.has(event.pointerId)) return;
    const wasPinch = pinch;
    touches.delete(event.pointerId);
    pinch = false;
    suppressClick = moved;
    if (
      touches.size ||
      wasPinch ||
      event.type === 'pointercancel' ||
      !options.inertia ||
      performance.now() - lastTime > 80
    ) {
      velocity = 0;
      return;
    }
    let previous = performance.now();
    const coast = (now: number) => {
      const dt = Math.min(32, now - previous);
      previous = now;
      velocity *= Math.pow(0.9, dt / 16);
      if (Math.abs(velocity) < 0.025) {
        settle();
        return;
      }
      pan(velocity * dt, now, false);
      inertiaFrame = requestAnimationFrame(coast);
    };
    inertiaFrame = requestAnimationFrame(coast);
  };
  const click = (event: MouseEvent) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    }
  };
  const stopOnKey = () => cancelInertia();
  wheelSurface.addEventListener('wheel', wheel, { passive: false });
  viewport.addEventListener('pointerdown', down);
  viewport.addEventListener('pointermove', move, { passive: false });
  viewport.addEventListener('pointerup', up);
  viewport.addEventListener('pointercancel', up);
  viewport.addEventListener('click', click, true);
  document.addEventListener('pointerdown', cancelInertia, true);
  document.addEventListener('keydown', stopOnKey, true);
  return () => {
    cancelInertia();
    cancelAnimationFrame(edgeFrame);
    clearTimeout(settleTimer);
    pull = 0;
    options.onEdge(0);
    wheelSurface.removeEventListener('wheel', wheel);
    viewport.removeEventListener('pointerdown', down);
    viewport.removeEventListener('pointermove', move);
    viewport.removeEventListener('pointerup', up);
    viewport.removeEventListener('pointercancel', up);
    viewport.removeEventListener('click', click, true);
    document.removeEventListener('pointerdown', cancelInertia, true);
    document.removeEventListener('keydown', stopOnKey, true);
  };
}

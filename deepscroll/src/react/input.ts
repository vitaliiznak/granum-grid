import { clamp, wheelPixels } from '../core/mappings.js';
import type { DeepScrollEngine } from '../core/engine.js';
export interface InputOptions {
  reducedMotion: boolean;
  inertia: boolean;
  elasticity: boolean;
  automaticAggregation: boolean;
  onSpeed(span: number): void;
  onEdge(offset: number): void;
  onVelocity(rowsPerMs: number): void;
}
/** Browser adapters own input listeners and RAFs; the engine only receives numbers. */
export function bindInputs(viewport: HTMLElement, engine: DeepScrollEngine, options: InputOptions) {
  const touches = new Map<number, { x: number; y: number }>();
  let distance = 0,
    lastTime = 0,
    velocity = 0,
    inertiaFrame = 0,
    speedFrame = 0,
    settleTimer: ReturnType<typeof setTimeout> | undefined;
  let speed = 0,
    edge = 0,
    moved = false,
    suppressClick = false;
  const cancelInertia = () => {
    cancelAnimationFrame(inertiaFrame);
    inertiaFrame = 0;
  };
  const settle = () => {
    engine.visit();
    cancelAnimationFrame(speedFrame);
    const decay = () => {
      speed *= 0.64;
      edge *= 0.66;
      if (speed < 1) speed = 0;
      if (Math.abs(edge) < 0.2) edge = 0;
      options.onSpeed(speed);
      options.onEdge(edge);
      if (speed || edge) speedFrame = requestAnimationFrame(decay);
    };
    speedFrame = requestAnimationFrame(decay);
  };
  const pan = (pixels: number, time: number, measure = true) => {
    const state = engine.getSnapshot();
    const scale = state.view === 'zoom' ? state.rowsPerPixel : 1 / state.rowHeight;
    const overflow = engine.pan(pixels) ?? 0;
    if (measure) {
      const elapsed = lastTime ? clamp(time - lastTime, 8, 64) : 16;
      velocity = 0.5 * velocity + (0.5 * pixels) / elapsed;
      lastTime = time;
      options.onVelocity(velocity * scale);
    }
    if (options.elasticity && !options.reducedMotion) {
      edge = clamp(-overflow * 0.12, -36, 36);
      options.onEdge(edge);
    }
    if (
      options.automaticAggregation &&
      !options.reducedMotion &&
      Math.abs(velocity) > 1.8 &&
      state.view !== 'zoom'
    ) {
      speed = Math.min(
        state.rowCount,
        ((Math.abs(velocity) * state.height) / state.rowHeight) * 14,
      );
      options.onSpeed(speed);
    }
    cancelAnimationFrame(speedFrame);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 140);
  };
  const wheel = (event: WheelEvent) => {
    if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]'))
      return;
    cancelInertia();
    if (event.ctrlKey) {
      if (!viewport.contains(document.activeElement)) return;
      event.preventDefault();
      const state = engine.getSnapshot();
      engine.setZoom(
        state.rowsPerPixel * Math.exp(event.deltaY * 0.008),
        event.clientY - viewport.getBoundingClientRect().top,
      );
    } else {
      event.preventDefault();
      pan(
        wheelPixels(
          event.deltaY,
          event.deltaMode,
          viewport.clientHeight,
          engine.getSnapshot().rowHeight,
        ),
        performance.now(),
      );
    }
  };
  const down = (event: PointerEvent) => {
    cancelInertia();
    velocity = 0;
    lastTime = performance.now();
    if (event.pointerType !== 'touch' || (event.target as HTMLElement).closest('button,input,a'))
      return;
    viewport.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved = false;
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      distance = Math.hypot(a.x - b.x, a.y - b.y);
      moved = true;
    }
  };
  const move = (event: PointerEvent) => {
    const previous = touches.get(event.pointerId);
    if (!previous) return;
    event.preventDefault();
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved ||= Math.abs(previous.y - event.clientY) > 2;
    if (touches.size === 2) {
      const [a, b] = [...touches.values()],
        nextDistance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 0 && nextDistance > 0)
        engine.setZoom(
          (engine.getSnapshot().rowsPerPixel * distance) / nextDistance,
          (a.y + b.y) / 2 - viewport.getBoundingClientRect().top,
        );
      distance = nextDistance;
    } else pan(previous.y - event.clientY, performance.now());
  };
  const up = (event: PointerEvent) => {
    if (!touches.has(event.pointerId)) return;
    const wasPinch = distance > 0;
    touches.delete(event.pointerId);
    distance = 0;
    suppressClick = moved;
    if (
      touches.size ||
      wasPinch ||
      event.type === 'pointercancel' ||
      !options.inertia ||
      options.reducedMotion ||
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
  viewport.addEventListener('wheel', wheel, { passive: false });
  viewport.addEventListener('pointerdown', down);
  viewport.addEventListener('pointermove', move, { passive: false });
  viewport.addEventListener('pointerup', up);
  viewport.addEventListener('pointercancel', up);
  viewport.addEventListener('click', click, true);
  document.addEventListener('pointerdown', cancelInertia, true);
  document.addEventListener('keydown', stopOnKey, true);
  return () => {
    cancelInertia();
    cancelAnimationFrame(speedFrame);
    clearTimeout(settleTimer);
    options.onSpeed(0);
    options.onEdge(0);
    viewport.removeEventListener('wheel', wheel);
    viewport.removeEventListener('pointerdown', down);
    viewport.removeEventListener('pointermove', move);
    viewport.removeEventListener('pointerup', up);
    viewport.removeEventListener('pointercancel', up);
    viewport.removeEventListener('click', click, true);
    document.removeEventListener('pointerdown', cancelInertia, true);
    document.removeEventListener('keydown', stopOnKey, true);
  };
}

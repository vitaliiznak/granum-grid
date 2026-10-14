import type { GranumGridEngine } from '../core/engine.js';
import { clamp } from '../core/mappings.js';
import type { DataSession } from '../data/session.js';

/** Quiet time after the mounted rows change before the next page is predicted. */
const PREFETCH_DELAY = 70;
/** How far ahead, in milliseconds of current velocity, the prediction looks. */
const LOOK_AHEAD = 160;

export interface RowRequestWindow {
  start: number;
  count: number;
  prefetch: boolean;
}

/**
 * Keep the session's visible request in step with the mounted rows and, once they stop
 * changing, request the page the reader is heading toward. Only changes act, so calling
 * `update` on every render costs nothing.
 */
export function createRowRequests<Row>(
  engine: GranumGridEngine,
  session: DataSession<Row>,
  velocity: () => number,
) {
  let last: RowRequestWindow | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancelPrefetch = () => {
    clearTimeout(timer);
    session.setRange('prefetch', 0, 0);
  };
  return {
    update(window: RowRequestWindow) {
      if (
        last &&
        last.start === window.start &&
        last.count === window.count &&
        last.prefetch === window.prefetch
      )
        return;
      if (!last || last.start !== window.start || last.count !== window.count)
        session.setRange('visible', window.start, window.count);
      last = window;
      cancelPrefetch();
      if (!window.prefetch) return;
      timer = setTimeout(() => {
        const { position, rowCount } = engine.getSnapshot();
        const predicted = clamp(
          Math.round(position + velocity() * LOOK_AHEAD),
          0,
          Math.max(0, rowCount - 1),
        );
        session.setRange('prefetch', predicted, Math.max(1, window.count));
      }, PREFETCH_DELAY);
    },
    destroy: cancelPrefetch,
  };
}

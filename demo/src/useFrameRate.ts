import { useEffect, useState, type RefObject } from 'react';
import type { GranumGridApi } from '@granum-grid/react';

/**
 * Frames delivered while the explorer moves, for the debug panel. Sampling starts when the
 * position changes and stops 180 ms after it settles, so there is no idle animation frame.
 * `owner` changes with each mounted explorer, such as a new provider.
 */
export function useFrameRate(api: RefObject<GranumGridApi<unknown> | null>, owner: unknown) {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    const grid = api.current;
    if (!grid) return;
    let frame = 0,
      deadline = 0,
      start = 0,
      count = 0,
      position = grid.getSnapshot().position;
    const tick = (now: number) => {
      count++;
      if (now - start >= 250 || now >= deadline) {
        if (count >= 5) setFps(Math.round((count * 1000) / Math.max(1, now - start)));
        start = now;
        count = 0;
      }
      frame = now >= deadline ? 0 : requestAnimationFrame(tick);
    };
    const unsubscribe = grid.subscribe(() => {
      const next = grid.getSnapshot().position;
      if (next === position) return;
      position = next;
      deadline = performance.now() + 180;
      if (frame) return;
      start = performance.now();
      count = 0;
      frame = requestAnimationFrame(tick);
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [api, owner]);
  return fps;
}

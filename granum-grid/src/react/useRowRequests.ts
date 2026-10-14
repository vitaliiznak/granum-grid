import { useEffect, type RefObject } from 'react';
import { clamp } from '../core/mappings.js';
import type { GranumGridEngine } from '../core/engine.js';
import type { DataSession } from '../data/session.js';

interface RowRequestOptions {
  /** Mounted row window. */
  start: number;
  count: number;
  prefetch: boolean;
  /** Recent input velocity in rows per millisecond, used to predict the next page. */
  velocity: RefObject<number>;
}

/** Keep the session's visible and prefetch requests in step with the view. */
export function useRowRequests<Row>(
  engine: GranumGridEngine,
  session: DataSession<Row>,
  { start, count, prefetch, velocity }: RowRequestOptions,
) {
  useEffect(() => {
    session.setRange('visible', start, count);
  }, [session, start, count]);
  useEffect(() => {
    if (!prefetch) {
      session.setRange('prefetch', 0, 0);
      return;
    }
    const timer = setTimeout(() => {
      const { position, rowCount } = engine.getSnapshot();
      const predicted = clamp(
        Math.round(position + (velocity.current ?? 0) * 160),
        0,
        Math.max(0, rowCount - 1),
      );
      session.setRange('prefetch', predicted, Math.max(1, count));
    }, 70);
    return () => {
      clearTimeout(timer);
      session.setRange('prefetch', 0, 0);
    };
  }, [engine, session, velocity, start, count, prefetch]);
}

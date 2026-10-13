import { useEffect, type RefObject } from 'react';
import { clamp } from '../core/mappings.js';
import type { GranumGridEngine } from '../core/engine.js';
import type { DataSession } from '../data/session.js';
import type { AggregateRequest } from '../data/types.js';

export interface RowRequestOptions {
  /** Mounted row window. */
  start: number;
  count: number;
  /** Rows per viewport while an animated jump fetches its destination. */
  destinationCount: number;
  prefetch: boolean;
  /** Recent input velocity in rows per millisecond, used to predict the next page. */
  velocity: RefObject<number>;
  /** Regional summaries to request after the view settles, or null for none. */
  aggregates: AggregateRequest | null;
}

/** Keep the session's visible, prefetch, and regional summary requests in step with the view. */
export function useRowRequests<Row>(
  engine: GranumGridEngine,
  session: DataSession<Row>,
  moving: boolean,
  targetIndex: number | null,
  { start, count, destinationCount, prefetch, velocity, aggregates }: RowRequestOptions,
) {
  const { start: regionStart = 0, end: regionEnd = 0, buckets = 0 } = aggregates ?? {};
  const wantsAggregates = aggregates !== null;
  useEffect(() => {
    if (!wantsAggregates) {
      session.requestAggregates();
      return;
    }
    const timer = setTimeout(
      () => session.requestAggregates({ start: regionStart, end: regionEnd, buckets }),
      120,
    );
    return () => {
      clearTimeout(timer);
      session.requestAggregates();
    };
  }, [session, wantsAggregates, regionStart, regionEnd, buckets]);
  useEffect(() => {
    if (moving && targetIndex !== null) session.setRange('visible', targetIndex, destinationCount);
    else session.setRange('visible', start, count);
  }, [session, start, count, moving, targetIndex, destinationCount]);
  useEffect(() => {
    if (!prefetch || moving) {
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
  }, [engine, session, velocity, start, count, prefetch, moving]);
}

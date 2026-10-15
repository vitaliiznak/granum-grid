import { useEffect, type RefObject } from 'react';
import type { DataSession, GranumGridEngine } from '@granum-grid/core/internal';
import { createRowRequests } from '@granum-grid/core/dom';
import { useKeyed } from './useKeyed.js';

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
  const requests = useKeyed(
    () => createRowRequests(engine, session, () => velocity.current ?? 0),
    [engine, session],
  );
  useEffect(() => () => requests.destroy(), [requests]);
  useEffect(() => requests.update({ start, count, prefetch }), [requests, start, count, prefetch]);
}

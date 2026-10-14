import { checkRowRequest } from './bounds.js';
import type { CursorSource, CursorWindow, CursorWindowQuery, DataProvider } from './types.js';

/** Refuse a cursor window the server cannot answer: a bad size, or a cursor that is not opaque. */
export function cursorWindowIssue(query: CursorWindowQuery): string | null {
  if (!Number.isSafeInteger(query.windowSize) || query.windowSize < 1)
    return 'Window size must be a positive integer';
  if (query.cursor !== null && (typeof query.cursor !== 'string' || query.cursor === ''))
    return 'A cursor must be an opaque string, or null to start at the first row';
  return null;
}

/**
 * Accept one server page. The window may be shorter than requested only when its
 * next cursor explains how to resume, or when it reaches `rowCount`. It must not
 * extend past the revision or invent rows beyond `windowSize`.
 */
export function acceptCursorWindow<Row>(
  window: CursorWindow<Row>,
  request: { windowSize: number; rowCount: number },
): CursorWindow<Row> {
  const issue = cursorWindowIssue({ cursor: null, windowSize: request.windowSize });
  if (issue) throw new RangeError(issue);
  if (!Number.isSafeInteger(request.rowCount) || request.rowCount < 0)
    throw new RangeError('Server revision has an invalid row count');
  if (!Number.isSafeInteger(window.start) || window.start < 0 || window.start > request.rowCount)
    throw new RangeError('Server window starts outside this revision');
  if (!Array.isArray(window.rows) || window.rows.length > request.windowSize)
    throw new Error('Server window is larger than the requested window');
  if (window.start + window.rows.length > request.rowCount)
    throw new RangeError('Server window extends outside this revision');
  const finished = window.start + window.rows.length === request.rowCount;
  if (finished && window.nextCursor !== null)
    throw new Error('Server window reported another page at the end of the revision');
  if (!finished && (typeof window.nextCursor !== 'string' || window.nextCursor === ''))
    throw new Error('Server window omitted the cursor for the following rows');
  return window;
}

/**
 * Navigate a server that returns rows as a cursor plus a window size.
 * `fetchRows` seeks with `cursorAt` and follows `nextCursor` only until the requested
 * slice is full. It does not walk the rest of the revision.
 */
export function createCursorProvider<Row>(
  dataset: CursorSource<Row>,
  identity: { id: string; revision: string; rowCount: number },
): DataProvider<Row> {
  return {
    ...identity,
    async fetchRows(start, count, signal) {
      checkRowRequest(start, count, identity.rowCount);
      signal.throwIfAborted();
      if (count === 0) return [];
      const rows: Row[] = [];
      let cursor = start === 0 ? null : await dataset.cursorAt(start, signal);
      if (start > 0 && (typeof cursor !== 'string' || cursor === ''))
        throw new Error('The server did not provide a cursor for this address');
      let expected = start;
      while (rows.length < count) {
        signal.throwIfAborted();
        const windowSize = count - rows.length;
        const query = { cursor, windowSize };
        const issue = cursorWindowIssue(query);
        if (issue) throw new RangeError(issue);
        const window = acceptCursorWindow(await dataset.fetchWindow(query, signal), {
          windowSize,
          rowCount: identity.rowCount,
        });
        if (window.start !== expected || window.rows.length === 0)
          throw new Error('The server window does not continue at the requested address');
        const take = window.rows.slice(0, count - rows.length);
        rows.push(...take);
        expected += take.length;
        if (rows.length === count) break;
        if (window.nextCursor === null)
          throw new Error('The server window ended before the requested rows');
        cursor = window.nextCursor;
      }
      return rows;
    },
  };
}

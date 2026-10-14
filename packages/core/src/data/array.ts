import type { DataProvider } from './types.js';
import { checkRowRequest } from './bounds.js';

/** Adapt an immutable array already held by the application. No copy or full-data scan. */
export function createArrayProvider<Row>(
  rows: readonly Row[],
  identity: { id: string; revision: string },
): DataProvider<Row> {
  const rowCount = rows.length;
  return {
    ...identity,
    rowCount,
    async fetchRows(start, count, signal) {
      signal.throwIfAborted();
      if (rows.length !== rowCount)
        throw new Error('Array length changed. Create a provider for the new snapshot.');
      checkRowRequest(start, count, rowCount);
      return rows.slice(start, start + count);
    },
  };
}

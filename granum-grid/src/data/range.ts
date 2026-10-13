import type { DataProvider, RowRange, Bucket } from './types.js';
import { checkRowRequest, validRange } from './bounds.js';

/** An indexed window into a provider; no row materialization or client-side scan. */
export function rangeProvider<Row>(
  provider: DataProvider<Row>,
  range: RowRange,
): DataProvider<Row> {
  if (!validRange(range, provider.rowCount)) throw new RangeError('Invalid provider range');
  const rowCount = range.end - range.start;
  const shift = (buckets: Bucket[]) =>
    buckets.map((b) => ({ ...b, start: b.start - range.start, end: b.end - range.start }));
  return {
    id: `${provider.id}:range:${range.start}:${range.end}`,
    revision: provider.revision,
    rowCount,
    metric: provider.metric,
    // Requests outside the window must fail rather than read neighboring parent rows.
    fetchRows: async (start, count, signal) => {
      checkRowRequest(start, count, rowCount);
      return provider.fetchRows(range.start + start, count, signal);
    },
    fetchOverview: provider.fetchAggregates
      ? async (buckets, signal) =>
          shift(
            await provider.fetchAggregates!(
              { ...range, buckets: Math.min(buckets, rowCount) },
              signal,
            ),
          )
      : undefined,
    fetchAggregates: provider.fetchAggregates
      ? async (r, signal) => {
          if (!validRange(r, rowCount))
            throw new RangeError('Aggregate range is outside the window');
          return shift(
            await provider.fetchAggregates!(
              {
                ...r,
                buckets: Math.min(r.buckets, r.end - r.start),
                start: r.start + range.start,
                end: r.end + range.start,
              },
              signal,
            ),
          );
        }
      : undefined,
  };
}

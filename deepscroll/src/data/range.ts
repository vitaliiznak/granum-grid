import type { DataProvider, RowRange, Bucket } from './types.js';
import { validRange } from '../core/exploration.js';

/** An indexed window into a provider; no row materialization or client-side scan. */
export function rangeProvider<Row>(
  provider: DataProvider<Row>,
  range: RowRange,
): DataProvider<Row> {
  if (!validRange(range, provider.rowCount)) throw new RangeError('Invalid provider range');
  const shift = (buckets: Bucket[]) =>
    buckets.map((b) => ({ ...b, start: b.start - range.start, end: b.end - range.start }));
  return {
    id: `${provider.id}:range:${range.start}:${range.end}`,
    revision: provider.revision,
    rowCount: range.end - range.start,
    metric: provider.metric,
    fetchRows: (start, count, signal) => provider.fetchRows(range.start + start, count, signal),
    fetchOverview: provider.fetchAggregates
      ? async (buckets, signal) =>
          shift(
            await provider.fetchAggregates!(
              { ...range, buckets: Math.min(buckets, range.end - range.start) },
              signal,
            ),
          )
      : undefined,
    fetchAggregates: provider.fetchAggregates
      ? async (r, signal) =>
          shift(
            await provider.fetchAggregates!(
              {
                ...r,
                buckets: Math.min(r.buckets, r.end - r.start),
                start: r.start + range.start,
                end: r.end + range.start,
              },
              signal,
            ),
          )
      : undefined,
  };
}

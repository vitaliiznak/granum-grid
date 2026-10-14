import type { AggregateRequest, Bucket, RowRange } from './types.js';

/** A non-empty half-open range of safe integer row addresses within `count` rows. */
export function validRange(range: RowRange, count: number): boolean {
  return (
    Number.isSafeInteger(range.start) &&
    Number.isSafeInteger(range.end) &&
    range.start >= 0 &&
    range.end > range.start &&
    range.end <= count
  );
}

/** Reject a `fetchRows(start, count)` request outside `rowCount` rows. Empty requests are valid. */
export function checkRowRequest(start: number, count: number, rowCount: number) {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(count) ||
    start < 0 ||
    count < 0 ||
    start > rowCount ||
    count > rowCount - start
  )
    throw new RangeError(`Requested rows ${start}+${count} are outside ${rowCount} rows`);
}

/**
 * Validate provider buckets for a request: contiguous coverage of the whole range, at most
 * `range.buckets` buckets, a known accuracy, finite or null values, and counts within each
 * bucket. Returns the buckets unchanged; throws on any violation.
 */
export function checkBuckets(buckets: Bucket[], range: AggregateRequest): Bucket[] {
  if (!Array.isArray(buckets) || buckets.length > range.buckets)
    throw new Error('Invalid aggregate resolution');
  if (range.end === range.start && buckets.length === 0) return buckets;
  let cursor = range.start;
  for (const bucket of buckets) {
    if (
      bucket.start !== cursor ||
      !Number.isSafeInteger(bucket.end) ||
      bucket.end <= cursor ||
      bucket.end > range.end ||
      !['exact', 'estimated', 'unavailable'].includes(bucket.accuracy)
    )
      throw new Error('Invalid aggregate coverage');
    if (
      [bucket.avg, bucket.min, bucket.max, bucket.count].some(
        (value) => value !== null && !Number.isFinite(value),
      )
    )
      throw new Error('Invalid aggregate values');
    if (bucket.count !== null && (bucket.count < 0 || bucket.count > bucket.end - bucket.start))
      throw new Error('Invalid aggregate count');
    cursor = bucket.end;
  }
  if (cursor !== range.end) throw new Error('Incomplete aggregate coverage');
  return buckets;
}

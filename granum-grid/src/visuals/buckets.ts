import type { RowRange } from '../data/types.js';

/** Fit a bounded number of target-sized buckets around the current row. */
export function bucketZoomRange(
  rowCount: number,
  position: number,
  rowsPerBucket: number,
  bucketCount: number,
): RowRange | null {
  if (!Number.isSafeInteger(rowsPerBucket) || rowsPerBucket < 1)
    throw new RangeError('Bucket size must be a positive whole number');
  if (!Number.isSafeInteger(bucketCount) || bucketCount < 1 || bucketCount > 160)
    throw new RangeError('Bucket count must be from 1 to 160');
  if (rowCount === 0) return null;
  const span = Math.min(rowCount, rowsPerBucket * bucketCount);
  const start = Math.max(0, Math.min(rowCount - span, Math.round(position - span / 2)));
  return { start, end: start + span };
}

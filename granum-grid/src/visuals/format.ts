import type { RowRange } from '../data/types.js';

/** Shared number formatters. Intl constructors are costly and these run during scroll frames. */
const compact = new Intl.NumberFormat('en', { notation: 'compact' });
const compactTick = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const decimals = new Map<number, Intl.NumberFormat>();

export const formatCompact = (value: number) => compact.format(value);
export const formatCompactTick = (value: number) => compactTick.format(value);

/** Locale-aware number with at most `maximumFractionDigits` decimals. */
export function formatDecimal(value: number, maximumFractionDigits: number) {
  let format = decimals.get(maximumFractionDigits);
  if (!format) {
    format = new Intl.NumberFormat(undefined, { maximumFractionDigits });
    decimals.set(maximumFractionDigits, format);
  }
  return format.format(value);
}

/** One-based visible address for a zero-based half-open range: "Row 5" or "Rows 1–10". */
export const rangeAddress = (range: RowRange) =>
  range.end - range.start === 1
    ? `Row ${range.end.toLocaleString()}`
    : `Rows ${(range.start + 1).toLocaleString()}–${range.end.toLocaleString()}`;

export const rangeCount = (range: RowRange) => {
  const count = range.end - range.start;
  return `${count.toLocaleString()} ${count === 1 ? 'row' : 'rows'}`;
};

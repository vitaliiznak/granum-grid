import type { RowRange } from '@granum/react';

// Copied from the library's internal formatters; the library does not export formatting.
const decimals = new Map<number, Intl.NumberFormat>();

/** Locale-aware number with at most `maximumFractionDigits` decimals. */
export function formatDecimal(value: number, maximumFractionDigits: number) {
  let format = decimals.get(maximumFractionDigits);
  if (!format) {
    format = new Intl.NumberFormat(undefined, { maximumFractionDigits });
    decimals.set(maximumFractionDigits, format);
  }
  return format.format(value);
}

/** A metric value and its unit, such as "12.5 ms" or "4.2%"; a percent sign is not spaced. */
export function formatMetric(value: number, maximumFractionDigits: number, unit?: string) {
  const number = formatDecimal(value, maximumFractionDigits);
  return unit ? `${number}${unit === '%' ? '' : ' '}${unit}` : number;
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

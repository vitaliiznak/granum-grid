import type { Chapter, RowRange } from '../data/types.js';

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

/** A metric value and its unit, such as "12.5 ms" or "4.2%"; a percent sign is not spaced. */
export function formatMetric(value: number, maximumFractionDigits: number, unit?: string) {
  const number = formatDecimal(value, maximumFractionDigits);
  return unit ? `${number}${unit === '%' ? '' : ' '}${unit}` : number;
}

/** A chapter's full name: its breadcrumb path when it has one. */
export const chapterName = (chapter: Chapter) => chapter.breadcrumb?.join(' / ') ?? chapter.label;

/** One-based visible address for a zero-based half-open range: "Row 5" or "Rows 1–10". */
export const rangeAddress = (range: RowRange) =>
  range.end - range.start === 1
    ? `Row ${range.end.toLocaleString()}`
    : `Rows ${(range.start + 1).toLocaleString()}–${range.end.toLocaleString()}`;

export const rangeCount = (range: RowRange) => {
  const count = range.end - range.start;
  return `${count.toLocaleString()} ${count === 1 ? 'row' : 'rows'}`;
};

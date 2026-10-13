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

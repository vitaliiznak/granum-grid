import type { RowRange } from '@granum-grid/react';

/**
 * Split `[start, end)` into `parts` contiguous ranges whose sizes differ by at most one.
 * Never more parts than rows, so no range is empty; an empty range has no parts.
 */
export function splitRange(start: number, end: number, parts: number): RowRange[] {
  const count = Math.max(0, Math.min(parts, end - start));
  return Array.from({ length: count }, (_, i) => ({
    start: start + Math.floor((i * (end - start)) / count),
    end: start + Math.floor(((i + 1) * (end - start)) / count),
  }));
}

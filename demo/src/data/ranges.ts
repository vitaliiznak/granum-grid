import type { RowRange } from 'granum-grid';

/** Split `[start, end)` into `parts` contiguous ranges whose sizes differ by at most one. */
export function splitRange(start: number, end: number, parts: number): RowRange[] {
  return Array.from({ length: parts }, (_, i) => ({
    start: start + Math.floor((i * (end - start)) / parts),
    end: start + Math.floor(((i + 1) * (end - start)) / parts),
  }));
}

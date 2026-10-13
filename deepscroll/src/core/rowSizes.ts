import { clamp } from './mappings.js';

export interface RowMeasurement {
  index: number;
  height: number;
}

/** Sparse corrections to an estimated height. Never allocates by dataset length. */
export class RowSizes {
  private measured = new Map<number, number>();
  private indices: number[] = [];
  private sums: number[] = [0];

  constructor(
    readonly rowCount: number,
    readonly estimate: number,
    readonly maxMeasurements = 4096,
  ) {
    if (!Number.isSafeInteger(rowCount) || rowCount < 0)
      throw new RangeError('rowCount must be a nonnegative safe integer');
    if (!Number.isFinite(estimate) || estimate < 1)
      throw new RangeError('rowHeight must be at least 1 pixel');
    if (!Number.isSafeInteger(maxMeasurements) || maxMeasurements < 1)
      throw new RangeError('maxMeasuredRows must be a positive safe integer');
  }

  get measuredCount() {
    return this.measured.size;
  }

  size(index: number) {
    return this.measured.get(index) ?? this.estimate;
  }

  measure(
    rows: readonly RowMeasurement[],
    anchor: number,
    retained: readonly number[] = [],
  ): boolean {
    let changed = false;
    for (const { index, height } of rows) {
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= this.rowCount ||
        !Number.isFinite(height) ||
        height < 1
      )
        continue;
      if (this.measured.get(index) === height) continue;
      this.measured.set(index, height);
      changed = true;
    }
    // Keep the nearest measurements so distant jumps cannot grow the cache forever.
    if (this.measured.size > this.maxMeasurements) {
      const pinned = new Set(retained);
      const nearest = [...this.measured.keys()].sort(
        (a, b) => Math.abs(a - anchor) - Math.abs(b - anchor),
      );
      let remaining = Math.max(
        0,
        this.maxMeasurements - nearest.filter((index) => pinned.has(index)).length,
      );
      for (const index of nearest) {
        if (pinned.has(index) || remaining-- > 0) continue;
        this.measured.delete(index);
        changed = true;
      }
    }
    if (!changed) return false;
    this.rebuild();
    return true;
  }

  clear() {
    if (!this.measured.size) return false;
    this.measured.clear();
    this.rebuild();
    return true;
  }

  private rebuild() {
    this.indices = [...this.measured.keys()].sort((a, b) => a - b);
    this.sums = [0];
    for (const index of this.indices)
      this.sums.push(this.sums[this.sums.length - 1] + this.size(index) - this.estimate);
  }

  private correction(row: number) {
    let lo = 0,
      hi = this.indices.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.indices[mid] < row) lo = mid + 1;
      else hi = mid;
    }
    return this.sums[lo];
  }

  /** Relative arithmetic preserves subpixel precision near distant row addresses. */
  distance(from: number, to: number): number {
    const a = Math.floor(from),
      b = Math.floor(to);
    return (
      (b - a) * this.estimate +
      this.correction(b) -
      this.correction(a) +
      (to - b) * this.size(b) -
      (from - a) * this.size(a)
    );
  }

  advance(from: number, pixels: number): number {
    if (pixels === 0) return from;
    // Extrapolate beyond the endpoints for viewport mappings; the engine clamps navigation.
    if (pixels <= this.distance(from, 0)) return (pixels - this.distance(from, 0)) / this.estimate;
    const end = this.distance(from, this.rowCount);
    if (pixels >= end) return this.rowCount + (pixels - end) / this.estimate;
    let lo = 0,
      hi = this.rowCount;
    while (lo + 1 < hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      if (this.distance(from, mid) <= pixels) lo = mid;
      else hi = mid;
    }
    return lo + clamp((pixels - this.distance(from, lo)) / this.size(lo), 0, 1);
  }
}

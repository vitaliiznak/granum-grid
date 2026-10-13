import { clamp } from './mappings.js';

export interface RowMeasurement {
  index: number;
  height: number;
}

/** Sparse corrections to an estimated height. Never allocates by dataset length. */
export class RowSizes {
  private measured = new Map<number, number>();
  /** Sorted measured addresses with their heights; sums[i] is the correction before indices[i]. */
  private indices: number[] = [];
  private heights: number[] = [];
  private sums: number[] = [0];

  constructor(
    public rowCount: number,
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
      const previous = this.measured.get(index);
      if (previous === height) continue;
      // Keep row addresses sorted on insertion; a full re-sort per frame is O(m log m).
      const at = this.lowerBound(index);
      if (previous === undefined) {
        this.indices.splice(at, 0, index);
        this.heights.splice(at, 0, height);
      } else this.heights[at] = height;
      this.measured.set(index, height);
      changed = true;
    }
    // Keep the nearest measurements so distant jumps cannot grow the cache forever.
    if (this.measured.size > this.maxMeasurements) changed = this.evict(anchor, retained) || changed;
    if (!changed) return false;
    this.rebuildSums();
    return true;
  }

  clear() {
    if (!this.measured.size) return false;
    this.measured.clear();
    this.indices = [];
    this.heights = [];
    this.rebuildSums();
    return true;
  }

  /** The farthest addresses from the anchor are always at the ends of the sorted indices. */
  private evict(anchor: number, retained: readonly number[]) {
    const pinned = new Set(retained);
    let excess = this.measured.size - this.maxMeasurements,
      lo = 0,
      hi = this.indices.length - 1,
      removed = 0;
    while (excess > 0 && lo <= hi) {
      if (pinned.has(this.indices[lo])) lo++;
      else if (pinned.has(this.indices[hi])) hi--;
      else {
        const index =
          Math.abs(this.indices[lo] - anchor) > Math.abs(this.indices[hi] - anchor)
            ? this.indices[lo++]
            : this.indices[hi--];
        this.measured.delete(index);
        removed++;
        excess--;
      }
    }
    if (!removed) return false;
    // Only the scanned ends changed: keep their pinned rows around the untouched middle.
    const kept = (i: number) => this.measured.has(this.indices[i]);
    const ends = (values: number[]) =>
      values
        .slice(0, lo)
        .filter((_, i) => kept(i))
        .concat(
          values.slice(lo, hi + 1),
          values.slice(hi + 1).filter((_, i) => kept(hi + 1 + i)),
        );
    const heights = ends(this.heights);
    this.indices = ends(this.indices);
    this.heights = heights;
    return true;
  }

  private rebuildSums() {
    const sums = new Array<number>(this.indices.length + 1);
    sums[0] = 0;
    for (let i = 0; i < this.heights.length; i++)
      sums[i + 1] = sums[i] + this.heights[i] - this.estimate;
    this.sums = sums;
  }

  private lowerBound(row: number) {
    let lo = 0,
      hi = this.indices.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.indices[mid] < row) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private correction(row: number) {
    return this.sums[this.lowerBound(row)];
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

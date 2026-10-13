import type { CacheOptions } from './types.js';
/** Estimated bytes for a row without `estimateRowBytes`, and fixed overhead per page. */
const DEFAULT_ROW_BYTES = 256;
const PAGE_BYTES = 64;
export class PageCache<Row> {
  readonly pageSize: number;
  readonly maxBytes: number;
  private pages = new Map<number, { rows: Row[]; bytes: number }>();
  private estimate: (row: Row) => number;
  private rows = 0;
  bytes = 0;
  constructor(options: CacheOptions<Row> = {}) {
    this.pageSize = options.pageSize ?? 256;
    this.maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
    if (
      !Number.isSafeInteger(this.pageSize) ||
      this.pageSize < 1 ||
      !Number.isFinite(this.maxBytes) ||
      this.maxBytes < 1
    )
      throw new RangeError('Invalid cache budget or page size');
    this.estimate = options.estimateRowBytes ?? (() => DEFAULT_ROW_BYTES);
  }
  has(page: number) {
    return this.pages.has(page);
  }
  hasRow(index: number) {
    const entry = this.pages.get(Math.floor(index / this.pageSize));
    return (
      Number.isSafeInteger(index) &&
      index >= 0 &&
      !!entry &&
      index % this.pageSize < entry.rows.length
    );
  }
  read(index: number) {
    const page = Math.floor(index / this.pageSize);
    const entry = this.pages.get(page);
    if (!entry) return undefined;
    this.pages.delete(page);
    this.pages.set(page, entry);
    return entry.rows[index % this.pageSize];
  }
  put(page: number, rows: Row[]) {
    this.delete(page);
    const bytes = rows.reduce((sum, row) => {
      const size = this.estimate(row);
      return sum + (Number.isFinite(size) && size > 0 ? size : DEFAULT_ROW_BYTES);
    }, PAGE_BYTES);
    this.pages.set(page, { rows, bytes });
    this.bytes += bytes;
    this.rows += rows.length;
  }
  evict(pinned: Set<number>, metadataBytes = 0) {
    for (const [page, entry] of this.pages) {
      if (this.bytes + metadataBytes <= this.maxBytes) break;
      if (!pinned.has(page)) this.drop(page, entry);
    }
  }
  get rowCount() {
    return this.rows;
  }
  /** Expected bytes for one more page: the cached average, or the default row estimate. */
  estimatePageBytes() {
    const rowBytes = this.rows
      ? (this.bytes - PAGE_BYTES * this.pages.size) / this.rows
      : DEFAULT_ROW_BYTES;
    return PAGE_BYTES + this.pageSize * rowBytes;
  }
  clear() {
    this.pages.clear();
    this.bytes = 0;
    this.rows = 0;
  }
  delete(page: number) {
    const entry = this.pages.get(page);
    if (entry) this.drop(page, entry);
  }
  private drop(page: number, entry: { rows: Row[]; bytes: number }) {
    this.bytes -= entry.bytes;
    this.rows -= entry.rows.length;
    this.pages.delete(page);
  }
}

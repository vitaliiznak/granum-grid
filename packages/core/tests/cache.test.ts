import { expect, it } from 'vitest';
import { PageCache } from '../src/data/cache';
it('evicts least recently read pages while preserving visible pages', () => {
  const cache = new PageCache<number>({ pageSize: 2, maxBytes: 180, estimateRowBytes: () => 10 });
  cache.put(0, [0, 1]);
  cache.put(1, [2, 3]);
  cache.read(0);
  cache.put(2, [4, 5]);
  cache.evict(new Set([2]));
  expect(cache.has(1)).toBe(false);
  expect(cache.has(0)).toBe(true);
  expect(cache.bytes).toBe(168);
});
it('keeps cached row and byte totals in step with replacement, eviction, and deletion', () => {
  const cache = new PageCache<number>({ pageSize: 4, maxBytes: 1000, estimateRowBytes: () => 10 });
  cache.put(0, [0, 1, 2, 3]);
  cache.put(1, [4, 5]);
  expect(cache.rowCount).toBe(6);
  cache.put(1, [4, 5, 6, 7]);
  expect([cache.rowCount, cache.bytes]).toEqual([8, 208]);
  cache.delete(0);
  cache.delete(9);
  expect([cache.rowCount, cache.bytes]).toEqual([4, 104]);
  cache.put(2, [8, 9, 10, 11]);
  cache.evict(new Set([2]), 1000);
  expect([cache.rowCount, cache.bytes, cache.has(2)]).toEqual([4, 104, true]);
  cache.clear();
  expect([cache.rowCount, cache.bytes]).toEqual([0, 0]);
});
it('estimates the next page from cached rows, or the default row size when empty', () => {
  const cache = new PageCache<number>({ pageSize: 4, estimateRowBytes: () => 10 });
  expect(cache.estimatePageBytes()).toBe(64 + 4 * 256);
  cache.put(0, [0, 1]);
  expect(cache.estimatePageBytes()).toBe(64 + 4 * 10);
});

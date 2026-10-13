import { expect, it } from 'vitest';
import { PageCache } from '../src/data/cache';
import { DataSession } from '../src/data/session';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
it('evicts least recently read pages while preserving visible pages', () => {
  const cache = new PageCache<number>({ pageSize: 2, maxBytes: 180, estimateRowBytes: () => 10 });
  cache.put(0, [0, 1]); cache.put(1, [2, 3]); cache.read(0); cache.put(2, [4, 5]);
  cache.evict(new Set([2]));
  expect(cache.has(1)).toBe(false); expect(cache.has(0)).toBe(true); expect(cache.bytes).toBe(168);
});
it('deduplicates shared pages, ignores late aborted responses, and bounds concurrency', async () => {
  const pending: { resolve: (rows: number[]) => void; start: number; signal: AbortSignal }[] = [];
  const session = new DataSession({ id: 'test', revision: '1', rowCount: 1000, fetchRows: (start, _count, signal) => new Promise<number[]>(resolve => pending.push({ resolve, start, signal })) }, { pageSize: 4 });
  session.setRange('visible', 0, 4); session.setRange('preview', 0, 3); await tick();
  expect(pending).toHaveLength(1);
  session.setRange('preview', 0, 0); session.setRange('visible', 400, 4); await tick();
  expect(pending[0].signal.aborted).toBe(true);
  pending[0].resolve([0, 1, 2, 3]); pending[1].resolve([400, 401, 402, 403]); await tick();
  expect(session.read(0)).toBeUndefined(); expect(session.read(400)).toBe(400);
  session.setRange('visible', 500, 40); await tick();
  expect(session.getStats().activeRequests).toBe(4);
  session.stop(); pending.slice(2).forEach(job => job.resolve([1, 2, 3, 4])); await tick();
});
it('reports short pages instead of accepting a false end of dataset', async () => {
  const session = new DataSession({ id: 'test', revision: '1', rowCount: 100, fetchRows: async () => [1] }, { pageSize: 4 });
  session.setRange('visible', 0, 2); await tick();
  expect(session.error(0)).toContain('Expected 4 rows'); expect(session.read(0)).toBeUndefined(); session.stop();
});

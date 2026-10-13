import { expect, it } from 'vitest';
import { PageCache } from '../src/data/cache';
import { DataSession } from '../src/data/session';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
it('starts a new destination despite canceled transports, without unbounded concurrency', async () => {
  const pending: { start: number; resolve: (rows: number[]) => void }[] = [];
  const s = new DataSession(
    {
      id: 'a',
      revision: '1',
      rowCount: 1000,
      fetchRows: (start) => new Promise<number[]>((resolve) => pending.push({ start, resolve })),
    },
    { pageSize: 4 },
  );
  try {
    s.setRange('visible', 0, 16);
    await tick();
    s.setRange('visible', 400, 16);
    await tick();
    expect(pending.map((p) => p.start)).toContain(400);
    expect(pending).toHaveLength(8);
    s.setRange('visible', 800, 4);
    await tick();
    expect(pending).toHaveLength(8);
    expect(s.error(800)).toContain('AbortSignal');
    pending.slice(0, 4).forEach((p) => p.resolve([1, 2, 3, 4]));
    await tick();
    await tick();
    // Settled transports free slots; the held page loads without a manual retry.
    expect(pending.at(-1)?.start).toBe(800);
    expect(s.error(800)).toBeUndefined();
  } finally {
    s.stop();
    pending.forEach((p) => p.resolve([1, 2, 3, 4]));
    await tick();
  }
});
it('reports request deadlines and rejects late data', async () => {
  let finish!: (rows: number[]) => void;
  const s = new DataSession(
    {
      id: 'a',
      revision: '1',
      rowCount: 100,
      fetchRows: () =>
        new Promise<number[]>((resolve) => {
          finish = resolve;
        }),
    },
    { pageSize: 4, requestTimeoutMs: 5 },
  );
  s.setRange('visible', 0, 4);
  await new Promise((resolve) => setTimeout(resolve, 15));
  expect(s.error(0)).toContain('timed out');
  finish([1, 2, 3, 4]);
  await tick();
  expect(s.has(0)).toBe(false);
  s.stop();
});
it('append refreshes a previously short final page and retains completed pages', async () => {
  const make = (rowCount: number) => ({
    id: 'a',
    revision: '1',
    rowCount,
    async fetchRows(start: number, count: number) {
      return Array.from({ length: count }, (_, i) => start + i);
    },
  });
  const s = new DataSession(make(6), { pageSize: 4 });
  s.setRange('visible', 0, 6);
  await tick();
  expect(s.getStats().completedFetches).toBe(2);
  expect(s.has(5)).toBe(true);
  expect(s.has(6)).toBe(false);
  s.updateAppendProvider(make(9));
  s.setRange('visible', 0, 9);
  await tick();
  expect(s.read(8)).toBe(8);
  expect(s.getStats().completedFetches).toBe(4);
  s.stop();
});
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
it('deduplicates shared pages, ignores late aborted responses, and bounds concurrency', async () => {
  const pending: { resolve: (rows: number[]) => void; start: number; signal: AbortSignal }[] = [];
  const session = new DataSession(
    {
      id: 'test',
      revision: '1',
      rowCount: 1000,
      fetchRows: (start, _count, signal) =>
        new Promise<number[]>((resolve) => pending.push({ resolve, start, signal })),
    },
    { pageSize: 4 },
  );
  session.setRange('visible', 0, 4);
  session.setRange('preview', 0, 3);
  await tick();
  expect(pending).toHaveLength(1);
  session.setRange('preview', 0, 0);
  session.setRange('visible', 400, 4);
  await tick();
  expect(pending[0].signal.aborted).toBe(true);
  pending[0].resolve([0, 1, 2, 3]);
  pending[1].resolve([400, 401, 402, 403]);
  await tick();
  expect(session.read(0)).toBeUndefined();
  expect(session.read(400)).toBe(400);
  session.setRange('visible', 500, 40);
  await tick();
  expect(session.getStats().activeRequests).toBe(4);
  session.stop();
  pending.slice(2).forEach((job) => job.resolve([1, 2, 3, 4]));
  await tick();
});
it('reports short pages instead of accepting a false end of dataset', async () => {
  const session = new DataSession(
    { id: 'test', revision: '1', rowCount: 100, fetchRows: async () => [1] },
    { pageSize: 4 },
  );
  session.setRange('visible', 0, 2);
  await tick();
  expect(session.error(0)).toContain('Expected 4 rows');
  expect(session.read(0)).toBeUndefined();
  session.stop();
});
it('failed summaries do not block exact rows and row retries recover', async () => {
  let fail = true;
  const session = new DataSession(
    {
      id: 'test',
      revision: '1',
      rowCount: 100,
      fetchOverview: async () => {
        throw new Error('Summary unavailable');
      },
      fetchRows: async (start, count) => {
        if (fail) throw new Error('Offline');
        return Array.from({ length: count }, (_, i) => start + i);
      },
    },
    { pageSize: 4 },
  );
  session.start();
  session.setRange('visible', 0, 2);
  await tick();
  expect(session.metadataErrors.overview).toContain('Summary unavailable');
  expect(session.error(0)).toContain('Offline');
  fail = false;
  session.retry();
  await tick();
  expect(session.read(0)).toBe(0);
  expect(session.error(0)).toBeUndefined();
  session.stop();
});
it('speculative pages do not displace visible rows or overflow a tiny cache', async () => {
  const session = new DataSession(
    {
      id: 'test',
      revision: '1',
      rowCount: 100,
      fetchRows: async (start, count) => Array.from({ length: count }, (_, i) => start + i),
    },
    { pageSize: 4, maxBytes: 110, estimateRowBytes: () => 10 },
  );
  session.setRange('visible', 0, 4);
  await tick();
  session.setRange('prefetch', 40, 4);
  await tick();
  expect(session.read(0)).toBe(0);
  expect(session.getStats().budgetOverage).toBe(0);
  expect(session.getStats().activeRequests).toBe(0);
  session.stop();
});

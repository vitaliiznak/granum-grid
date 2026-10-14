import { afterEach, expect, it, vi } from 'vitest';
import { DataSession } from '../src/data/session';
import type { AggregateRequest, Bucket, DataProvider } from '../src/data/types';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const rows = async (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => start + i);
const bucket = (range: AggregateRequest, accuracy: Bucket['accuracy'] = 'exact'): Bucket => ({
  start: range.start,
  end: range.end,
  count: range.end - range.start,
  avg: 1,
  min: 1,
  max: 1,
  accuracy,
});
const sessions: DataSession<number>[] = [];
function open(provider: Partial<DataProvider<number>>, options = {}) {
  const session = new DataSession<number>(
    { id: 'test', revision: '1', rowCount: 100, fetchRows: rows, ...provider },
    { pageSize: 4, ...options },
  );
  sessions.push(session);
  return session;
}
afterEach(() => {
  sessions.splice(0).forEach((session) => session.stop());
});
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
  vi.useFakeTimers();
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
  try {
    s.setRange('visible', 0, 4);
    await vi.advanceTimersByTimeAsync(4);
    expect(s.error(0)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.error(0)).toContain('timed out');
    finish([1, 2, 3, 4]);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.has(0)).toBe(false);
  } finally {
    s.stop();
    vi.useRealTimers();
  }
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

it('row navigation and append do not request selection statistics', async () => {
  const fetchAggregates = vi.fn(async () => []);
  const session = open({ fetchAggregates });
  session.start();
  session.setRange('visible', 40, 4);
  await tick();
  session.updateAppendProvider({ ...session.provider, rowCount: 120 });
  session.setRange('visible', 100, 4);
  await tick();
  session.retry();
  await tick();
  expect(fetchAggregates).not.toHaveBeenCalled();
  expect(session.read(100)).toBe(100);
});
it('retries only failed metadata kinds that are not already loading', async () => {
  const calls = { overview: 0, markers: 0, chapters: 0 };
  let failOverview = true;
  let finishChapters!: () => void;
  const session = open({
    async fetchOverview() {
      calls.overview++;
      if (failOverview) throw new Error('Overview failed');
      return [bucket({ start: 0, end: 100, buckets: 1 })];
    },
    async fetchMarkers() {
      calls.markers++;
      return [];
    },
    fetchChapters: () => {
      calls.chapters++;
      return new Promise((resolve) => {
        finishChapters = () => resolve([{ id: 'all', start: 0, end: 100, label: 'All rows' }]);
      });
    },
  });
  session.start();
  await tick();
  expect(session.metadataErrors.overview).toContain('Overview failed');
  failOverview = false;
  // A chapter request is still in flight; the failed overview must still reload.
  session.retry();
  await tick();
  expect(calls).toEqual({ overview: 2, markers: 1, chapters: 1 });
  expect(session.metadataErrors.overview).toBeUndefined();
  expect(session.overview).toHaveLength(1);
  finishChapters();
  await tick();
  expect(session.chapters).toHaveLength(1);
});
it('rejects invalid metadata without accepting partial results', async () => {
  const session = open({
    rowCount: 10,
    async fetchOverview() {
      // Gap between 4 and 5.
      return [bucket({ start: 0, end: 4, buckets: 1 }), bucket({ start: 5, end: 10, buckets: 1 })];
    },
    async fetchOverviewTracks() {
      const track = { label: 'A', buckets: [bucket({ start: 0, end: 10, buckets: 1 })] };
      return [
        { ...track, id: 'a' },
        { ...track, id: 'a' },
      ];
    },
    async fetchMarkers() {
      return [{ id: 'm', index: 10, label: 'Past the end', kind: 'event' as const }];
    },
    async fetchChapters() {
      return [
        { id: 'a', start: 0, end: 6, label: 'A' },
        { id: 'b', start: 5, end: 10, label: 'Overlaps A' },
      ];
    },
  });
  session.start();
  await tick();
  expect(Object.keys(session.metadataErrors).sort()).toEqual([
    'chapters',
    'markers',
    'overview',
    'tracks',
  ]);
  expect([session.overview, session.tracks, session.markers, session.chapters]).toEqual([
    [],
    [],
    [],
    [],
  ]);
});
it.each([
  ['a count larger than its rows', { count: 11 }],
  ['a non-finite value', { avg: Number.NaN }],
  ['an unknown accuracy', { accuracy: 'guessed' as Bucket['accuracy'] }],
])('rejects aggregate buckets with %s', async (_label, change) => {
  const session = open({
    rowCount: 10,
    async fetchOverview() {
      return [{ ...bucket({ start: 0, end: 10, buckets: 1 }), ...change }];
    },
  });
  session.start();
  await tick();
  expect(session.metadataErrors.overview).toBeDefined();
  expect(session.overview).toEqual([]);
});
it('accepts nullable aggregate values and unavailable buckets', async () => {
  const session = open({
    rowCount: 10,
    async fetchOverview() {
      return [
        {
          ...bucket({ start: 0, end: 10, buckets: 1 }, 'unavailable'),
          avg: null,
          min: null,
          max: null,
          count: null,
        },
      ];
    },
  });
  session.start();
  await tick();
  expect(session.metadataErrors).toEqual({});
  expect(session.overview[0].accuracy).toBe('unavailable');
});
it('append updates reject identity, revision, and address changes', () => {
  const session = open({ rowCount: 10 });
  const base = { id: 'test', revision: '1', rowCount: 10, fetchRows: rows };
  expect(() => session.updateAppendProvider({ ...base, id: 'other' })).toThrow('identity');
  expect(() => session.updateAppendProvider({ ...base, revision: '2' })).toThrow('identity');
  expect(() => session.updateAppendProvider({ ...base, rowCount: 9 })).toThrow('identity');
  expect(() => session.updateAppendProvider({ ...base, rowCount: 12 })).not.toThrow();
});
it('append updates do not restart a stopped session', async () => {
  let markerCalls = 0;
  const provider = (rowCount: number) => ({
    id: 'test',
    revision: '1',
    rowCount,
    fetchRows: rows,
    async fetchMarkers() {
      markerCalls++;
      return [];
    },
  });
  const session = open(provider(10));
  session.start();
  await tick();
  expect(markerCalls).toBe(1);
  session.updateAppendProvider(provider(12));
  await tick();
  expect(markerCalls).toBe(2);
  session.stop();
  session.updateAppendProvider(provider(14));
  session.setRange('visible', 0, 4);
  await tick();
  expect(markerCalls).toBe(2);
  expect(session.getStats().completedFetches).toBe(0);
});
it('budgets prefetch with the measured row size, not a fixed estimate', async () => {
  const session = open({}, { maxBytes: 1000, estimateRowBytes: () => 100 });
  session.setRange('visible', 0, 4);
  await tick();
  // 464 cached bytes plus a 464-byte page fit 1000 bytes; a fixed 256 bytes per row would not.
  session.setRange('prefetch', 40, 4);
  await tick();
  expect(session.has(40)).toBe(true);
  expect(session.getStats().budgetOverage).toBe(0);
});
it('counts a search as an active request and rejects addresses outside the revision', async () => {
  let finish!: (result: {
    matches: { id: string; index: number; label: string; kind: 'search' }[];
    complete: boolean;
  }) => void;
  const session = open({
    search: () => new Promise((resolve) => (finish = resolve)),
  });
  const context = { fromIndex: 0, limit: 2, signal: new AbortController().signal };
  const query = { kind: 'text', value: 'x' } as const;
  const pending = session.search(query, context);
  expect(session.getStats().activeRequests).toBe(1);
  finish({ matches: [{ id: 'a', index: 7, label: 'A', kind: 'search' }], complete: true });
  await expect(pending).resolves.toMatchObject({ complete: true, matches: [{ index: 7 }] });
  expect(session.getStats().activeRequests).toBe(0);
  const outside = session.search(query, context);
  finish({ matches: [{ id: 'b', index: 100, label: 'B', kind: 'search' }], complete: true });
  await expect(outside).rejects.toThrow('invalid search addresses');
  const excessive = session.search(query, { ...context, limit: 0 });
  finish({ matches: [{ id: 'c', index: 1, label: 'C', kind: 'search' }], complete: true });
  await expect(excessive).rejects.toThrow('invalid search addresses');
  expect(session.getStats().activeRequests).toBe(0);
  await expect(open({}).search(query, context)).rejects.toThrow('does not support search');
});

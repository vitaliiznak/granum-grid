import { expect, it, vi } from 'vitest';
import { createTableTools } from '../src/ai/table-tools';
import { createEngine } from '../../deepscroll/src/core/engine';
import type { DataProvider, DeepScrollApi } from 'deepscroll';

const makeProvider = (): DataProvider<{ value: number }> => ({
  id: 'huge',
  revision: 'snapshot-1',
  rowCount: 100_000_000,
  fetchRows: vi.fn(async (start, count) =>
    Array.from({ length: count }, (_, i) => ({ value: start + i })),
  ),
});

it('describes 100M rows without loading them and fetches only the requested slice', async () => {
  const provider = makeProvider();
  const tools = createTableTools({ provider, columns: [{ name: 'value', type: 'number' }] });
  expect(tools.definitions.map((d) => d.name)).toEqual(['describe_table', 'read_rows']);
  expect(await tools.execute('describe_table', {})).toMatchObject({
    ok: true,
    dataset: { rowCount: 100_000_000 },
    data: { columns: [{ name: 'value' }] },
  });
  expect(provider.fetchRows).not.toHaveBeenCalled();
  expect(await tools.execute('read_rows', { start: 99_999_998, count: 2 })).toMatchObject({
    ok: true,
    data: {
      start: 99_999_998,
      end: 100_000_000,
      rows: [{ value: 99_999_998 }, { value: 99_999_999 }],
    },
  });
  expect(provider.fetchRows).toHaveBeenCalledExactlyOnceWith(
    99_999_998,
    2,
    expect.any(AbortSignal),
  );
});

it('rejects unbounded, malformed and out-of-range calls before touching the provider', async () => {
  const provider = makeProvider();
  const tools = createTableTools({ provider });
  for (const args of [
    null,
    [],
    {},
    { start: 0, count: 100_000_000 },
    { start: -1, count: 1 },
    { start: 0.5, count: 1 },
    { start: 0, count: Infinity },
    { start: '1', count: 1 },
    { start: 99_999_999, count: 2 },
    { start: 0, count: 1, sql: 'anything' },
  ]) {
    expect(await tools.execute('read_rows', args)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENTS' },
    });
  }
  expect(await tools.execute('search_rows', {})).toMatchObject({
    ok: false,
    error: { code: 'UNSUPPORTED_TOOL' },
  });
  expect(provider.fetchRows).not.toHaveBeenCalled();
  tools.definitions[1].inputSchema.properties!.count.maximum = 100_000_000;
  expect(await tools.execute('read_rows', { start: 0, count: 101 })).toMatchObject({ ok: false });
});

it('does not invent records in an empty dataset', async () => {
  const provider = { ...makeProvider(), rowCount: 0 };
  const tools = createTableTools({ provider });
  expect(await tools.execute('read_rows', { start: 0, count: 1 })).toMatchObject({ ok: false });
  expect(await tools.execute('describe_table', {})).toMatchObject({
    ok: true,
    dataset: { rowCount: 0 },
  });
  expect(provider.fetchRows).not.toHaveBeenCalled();
});

it('preserves partial search coverage, exact addresses, and provider context', async () => {
  const provider = makeProvider();
  provider.search = vi.fn<NonNullable<typeof provider.search>>(async () => ({
    matches: [{ id: 'match', index: 73_499_999, label: 'Verified match', kind: 'search' }],
    complete: false,
    message: 'Bounded sample, not exhaustive.',
  }));
  const tools = createTableTools({ provider });
  const query = { kind: 'predicate', field: 'value', operator: '>', value: 120 };
  expect(await tools.execute('search_rows', { query, fromIndex: 0, limit: 10 })).toMatchObject({
    ok: true,
    data: {
      complete: false,
      message: 'Bounded sample, not exhaustive.',
      matches: [{ index: 73_499_999 }],
    },
  });
  expect(provider.search).toHaveBeenCalledExactlyOnceWith(query, {
    fromIndex: 0,
    limit: 10,
    signal: expect.any(AbortSignal),
  });
  expect(provider.fetchRows).not.toHaveBeenCalled();
  expect(
    await tools.execute('search_rows', {
      query: { ...query, operator: 'execute' },
      fromIndex: 0,
      limit: 10,
    }),
  ).toMatchObject({ ok: false, error: { code: 'INVALID_ARGUMENTS' } });
});

it('summarizes the full dataset with bounded provider buckets and keeps uncertainty', async () => {
  const provider = makeProvider();
  provider.fetchAggregates = vi.fn<NonNullable<typeof provider.fetchAggregates>>(
    async ({ start, end }) => [
      {
        start,
        end,
        count: null,
        avg: 5,
        min: 2,
        max: 9,
        accuracy: 'estimated',
      },
    ],
  );
  const tools = createTableTools({ provider });
  expect(
    await tools.execute('summarize_range', { start: 0, end: 100_000_000, buckets: 32 }),
  ).toMatchObject({
    ok: true,
    data: { buckets: [{ count: null, accuracy: 'estimated' }] },
  });
  expect(provider.fetchAggregates).toHaveBeenCalledExactlyOnceWith(
    { start: 0, end: 100_000_000, buckets: 32 },
    expect.any(AbortSignal),
  );
  expect(provider.fetchRows).not.toHaveBeenCalled();
  await tools.execute('summarize_range', { start: 0, end: 2, buckets: 64 });
  expect(provider.fetchAggregates).toHaveBeenLastCalledWith(
    { start: 0, end: 2, buckets: 2 },
    expect.any(AbortSignal),
  );
  for (const args of [
    { start: 5, end: 3, buckets: 1 },
    { start: 0, end: 10, buckets: 65 },
  ])
    expect(await tools.execute('summarize_range', args)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENTS' },
    });
});

it('rejects malformed provider rows, search matches, and incomplete aggregate coverage', async () => {
  const provider = makeProvider();
  provider.fetchRows = async () => [];
  provider.search = async () => ({
    complete: true,
    matches: [{ id: 'bad', index: 100_000_000, label: 'bad', kind: 'search' }],
  });
  provider.fetchAggregates = async () => [
    { start: 0, end: 5, count: 5, avg: 1, min: 1, max: 1, accuracy: 'exact' },
  ];
  const tools = createTableTools({ provider });
  for (const [name, args] of [
    ['read_rows', { start: 0, count: 1 }],
    ['search_rows', { query: { kind: 'date', value: '2026' }, fromIndex: 0, limit: 1 }],
    ['summarize_range', { start: 0, end: 10, buckets: 1 }],
  ] as const)
    expect(await tools.execute(name, args)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_RESULT' },
    });
});

it('bounds serialized UTF-8 output even when one row is huge', async () => {
  const tools = createTableTools({
    provider: {
      id: 'text',
      revision: '1',
      rowCount: 1,
      fetchRows: async () => ['🧪'.repeat(20_000)],
    },
  });
  expect(await tools.execute('read_rows', { start: 0, count: 1 })).toMatchObject({
    ok: false,
    error: { code: 'RESULT_TOO_LARGE' },
  });
});

it('navigates through the existing controller and keeps Back available', async () => {
  const provider = makeProvider();
  const engine = createEngine({ rowCount: provider.rowCount });
  try {
    const tools = createTableTools({
      provider,
      getTable: () => ({ provider, controller: engine }),
    });
    expect(await tools.execute('navigate_to_row', { index: 73_499_999 })).toMatchObject({
      ok: true,
      data: { index: 73_499_999 },
    });
    expect(engine.getSnapshot()).toMatchObject({ activeIndex: 73_499_999, canGoBack: true });
    expect(provider.fetchRows).not.toHaveBeenCalled();
    expect(
      await createTableTools({ provider, getTable: () => null }).execute('navigate_to_row', {
        index: 0,
      }),
    ).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } });
  } finally {
    engine.destroy();
  }
});

it('cancels provider work and never returns a late result', async () => {
  const provider = makeProvider();
  let providerSignal: AbortSignal | undefined;
  let resolve!: (rows: { value: number }[]) => void;
  provider.fetchRows = (_, __, signal) => {
    providerSignal = signal;
    return new Promise((done) => {
      resolve = done;
    });
  };
  const tools = createTableTools({ provider });
  const controller = new AbortController();
  const result = tools.execute('read_rows', { start: 0, count: 1 }, { signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  expect(await result).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
  expect(providerSignal?.aborted).toBe(true);
  resolve([{ value: 1 }]);
  expect(
    await tools.execute('read_rows', { start: 0, count: 1 }, { signal: controller.signal }),
  ).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
});

it('rejects stale mounted table handles and late results after a dataset switch', async () => {
  const provider = makeProvider();
  const replacement = makeProvider(); // Even identical metadata must not target another table.
  const engine = createEngine({ rowCount: provider.rowCount });
  let table: DeepScrollApi<{ value: number }> | null = { provider, controller: engine };
  let finish!: (rows: { value: number }[]) => void;
  provider.fetchRows = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const tools = createTableTools({ provider, getTable: () => table });
  try {
    const pending = tools.execute('read_rows', { start: 0, count: 1 });
    await Promise.resolve();
    table = { provider: replacement, controller: engine };
    finish([{ value: 0 }]);
    expect(await pending).toMatchObject({ ok: false, error: { code: 'STALE_DATASET' } });
    expect(await tools.execute('navigate_to_row', { index: 10 })).toMatchObject({
      ok: false,
      error: { code: 'STALE_DATASET' },
    });
    expect(engine.getSnapshot().activeIndex).toBe(0);
    table = null;
    expect(await tools.execute('describe_table', {})).toMatchObject({
      ok: false,
      error: { code: 'UNAVAILABLE' },
    });
  } finally {
    engine.destroy();
  }
});

it('times out callers but retains request slots until an uncooperative provider settles', async () => {
  vi.useFakeTimers();
  const provider = makeProvider();
  const resolvers: ((rows: { value: number }[]) => void)[] = [];
  provider.fetchRows = vi.fn<typeof provider.fetchRows>(
    () =>
      new Promise((resolve) => {
        resolvers.push(resolve);
      }),
  );
  try {
    const tools = createTableTools({ provider, timeoutMs: 10 });
    const pending = Array.from({ length: 4 }, () =>
      tools.execute('read_rows', { start: 0, count: 1 }),
    );
    await vi.advanceTimersByTimeAsync(10);
    for (const result of await Promise.all(pending))
      expect(result).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(await tools.execute('read_rows', { start: 0, count: 1 })).toMatchObject({
      ok: false,
      error: { code: 'BUSY' },
    });
    expect(provider.fetchRows).toHaveBeenCalledTimes(4);
    for (const resolve of resolvers) resolve([{ value: 0 }]);
    await vi.advanceTimersByTimeAsync(0);
    provider.fetchRows = async () => [{ value: 0 }];
    expect(await tools.execute('read_rows', { start: 0, count: 1 })).toMatchObject({ ok: true });
  } finally {
    vi.useRealTimers();
  }
});

it('rejects results if the bound provider revision changes during a request', async () => {
  const provider = makeProvider();
  provider.fetchRows = async () => {
    provider.revision = 'snapshot-2';
    return [{ value: 0 }];
  };
  const tools = createTableTools({ provider });
  expect(await tools.execute('read_rows', { start: 0, count: 1 })).toMatchObject({
    ok: false,
    error: { code: 'STALE_DATASET' },
  });
  expect(await tools.execute('describe_table', {})).toMatchObject({
    ok: false,
    error: { code: 'STALE_DATASET' },
  });
});

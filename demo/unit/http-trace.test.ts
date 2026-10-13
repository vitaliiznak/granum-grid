import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createTraceService, TRACE_API } from '../server/trace';

it('serves real rows with bounded reads, stable revisions, and truthful search coverage', async () => {
  const request = createTraceService(
    readFileSync(new URL('../src/data/fixtures/exploration-trace.json', import.meta.url), 'utf8'),
  );
  const signal = new AbortController().signal;
  const call = (op: string, params: Record<string, string | number> = {}) =>
    request(
      new URL(
        `${TRACE_API}${op}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`,
        'http://localhost',
      ),
      signal,
    );
  const meta = (await call('meta')).body as { revision: string; rowCount: number };
  const { revision } = meta;
  expect(meta.rowCount).toBeGreaterThan(256);
  const result = await call('rows', { revision, start: meta.rowCount - 2, count: 2 });
  expect(result.status).toBe(200);
  expect(result.body).toHaveLength(2);
  expect((await call('rows', { revision: 'stale', start: 0, count: 1 })).status).toBe(409);
  for (const params of [
    { start: 0, count: 1025 },
    { start: -1, count: 1 },
    { start: meta.rowCount - 1, count: 2 },
  ])
    expect((await call('rows', { revision, ...params })).status).toBe(400);
  expect((await call('aggregates', { revision, start: 0, end: 10, buckets: 513 })).status).toBe(
    400,
  );
  const aggregate = await call('aggregates', { revision, start: 1, end: 10, buckets: 1 });
  expect(aggregate.body).toMatchObject([{ start: 1, end: 10, count: 9, accuracy: 'exact' }]);
  const search = await call('search', {
    revision,
    fromIndex: 0,
    limit: 1,
    query: JSON.stringify({ kind: 'predicate', field: 'duration', operator: '>=', value: 0 }),
  });
  expect(search.body).toMatchObject({ complete: false, matches: [{ index: 0 }] });
  expect((await call('search', { revision, fromIndex: 0, limit: 1, query: '{' })).status).toBe(400);
});

import { DuckDBInstance } from '@duckdb/node-api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkBuckets } from 'granum-grid/data';
import { createSqlSource, plainValue, quoteIdentifier, type SqlQuery } from '../src/index';

// 10,000 requests, 26 seconds apart from 2026-09-01: about three days of logs in time order.
const ROWS = 10_000;
const signal = () => new AbortController().signal;
const context = (fromIndex = 0, limit = 100) => ({ fromIndex, limit, signal: signal() });
let query: SqlQuery;
let statements: string[];
let close: () => void;

beforeAll(async () => {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  statements = [];
  query = async (sql, params) => {
    statements.push(sql);
    const reader = await connection.runAndReadAll(sql, params.length ? [...params] : undefined);
    return reader.getRowObjectsJS() as Record<string, unknown>[];
  };
  await query(
    `CREATE TABLE logs AS SELECT
      i AS id,
      TIMESTAMP '2026-09-01' + to_seconds(i * 26) AS ts,
      ['auth', 'api', 'db'][i % 3 + 1] AS service,
      CASE WHEN i % 997 = 0 THEN 503 ELSE 200 END AS status,
      (i % 100) * 1.5 AS latency,
      'request ' || i || CASE WHEN i = 42 THEN ' 100% off_peak' ELSE '' END AS message
    FROM range(${ROWS}) t(i)`,
    [],
    signal(),
  );
  close = () => connection.closeSync();
});
afterAll(() => close());

const source = () => createSqlSource({ query, id: 'logs', from: 'logs' });

describe('SQL source', () => {
  it('describes the columns and their kinds', async () => {
    expect(await source().columns(signal())).toEqual([
      { name: 'id', type: 'BIGINT', kind: 'number' },
      { name: 'ts', type: 'TIMESTAMP', kind: 'time' },
      { name: 'service', type: 'VARCHAR', kind: 'text' },
      { name: 'status', type: 'INTEGER', kind: 'number' },
      { name: 'latency', type: 'DECIMAL(21,1)', kind: 'number' },
      { name: 'message', type: 'VARCHAR', kind: 'text' },
    ]);
  });

  it('addresses rows in source order, including the last page, as JSON-safe values', async () => {
    const provider = await source().open({}, signal());
    expect(provider).toMatchObject({ id: 'sql:logs', rowCount: ROWS });
    const rows = await provider.fetchRows(ROWS - 3, 3, signal());
    expect(rows.map((row) => row.id)).toEqual([9997, 9998, 9999]);
    // Times arrive as the database's text, decimals as numbers, on every engine.
    expect(rows[0]).toEqual({
      id: 9997,
      ts: '2026-09-04 00:12:02',
      service: 'api',
      status: 200,
      latency: 145.5,
      message: 'request 9997',
    });
    expect(JSON.parse(JSON.stringify(rows))).toEqual(rows);
    expect(await provider.fetchRows(0, 0, signal())).toEqual([]);
    await expect(provider.fetchRows(ROWS - 1, 2, signal())).rejects.toThrow(RangeError);
  });

  it('builds one revision per view: filtered and ordered rows with their own addresses', async () => {
    const logs = source();
    const natural = await logs.open({}, signal());
    const failures = await logs.open(
      {
        filters: [{ column: 'status', operator: '>=', value: 500 }],
        orderBy: [{ column: 'id', descending: true }],
      },
      signal(),
    );
    expect(failures.id).toBe(natural.id);
    expect(failures.revision).not.toBe(natural.revision);
    // i % 997 = 0 for 11 ids from 0 to 9,970, newest first.
    expect(failures.rowCount).toBe(11);
    const rows = await failures.fetchRows(0, 11, signal());
    expect(rows.map((row) => row.id)).toEqual(Array.from({ length: 11 }, (_, i) => (10 - i) * 997));
    // The same view reuses its revision table instead of copying the rows again.
    const before = statements.filter((sql) => sql.startsWith('CREATE OR REPLACE')).length;
    const again = await logs.open(failures.view, signal());
    expect(again.revision).toBe(failures.revision);
    expect(statements.filter((sql) => sql.startsWith('CREATE OR REPLACE')).length).toBe(before);
    const trusted = await logs.open({ whereSql: `service = 'db' AND id < 30` }, signal());
    expect(trusted.rowCount).toBe(10);
  });

  it('rejects unknown columns and a map column that is not numeric', async () => {
    await expect(source().open({ orderBy: [{ column: 'nope' }] }, signal())).rejects.toThrow(
      'Unknown sort column "nope"',
    );
    await expect(source().open({ metric: 'service' }, signal())).rejects.toThrow(
      'not a number column',
    );
    expect(quoteIdentifier('a "b"')).toBe('"a ""b"""');
  });

  it('draws an exact map and exact range statistics', async () => {
    const provider = await source().open({ metric: 'latency' }, signal());
    expect(provider.metric).toMatchObject({ label: 'latency', kind: 'value' });
    const overview = checkBuckets(await provider.fetchOverview!(320, signal()), {
      start: 0,
      end: ROWS,
      buckets: 320,
    });
    expect(overview).toHaveLength(320);
    expect(overview.every((bucket) => bucket.accuracy === 'exact')).toBe(true);
    expect(overview.reduce((sum, bucket) => sum + bucket.count!, 0)).toBe(ROWS);
    const range = { start: 100, end: 1100, buckets: 7 };
    const buckets = checkBuckets(await provider.fetchAggregates!(range, signal()), range);
    // Latency cycles 0–148.5 every 100 rows, so every long group spans the whole cycle.
    expect(buckets.map((bucket) => [bucket.min, bucket.max])).toEqual(
      Array.from({ length: 7 }, () => [0, 148.5]),
    );
    const tiny = { start: 5, end: 8, buckets: 10 };
    expect(checkBuckets(await provider.fetchAggregates!(tiny, signal()), tiny)).toHaveLength(3);
  });

  it('searches every row: text, predicates, and dates, from the current row onward', async () => {
    const provider = await source().open({}, signal());
    expect(provider.searchHelp).toMatchObject({ text: true, dates: false });
    const text = await provider.search!({ kind: 'text', value: 'request 999' }, context());
    expect(text).toMatchObject({ complete: true });
    expect(text.matches.map((match) => match.index)).toEqual([
      999, 9990, 9991, 9992, 9993, 9994, 9995, 9996, 9997, 9998, 9999,
    ]);
    // From row 5,000 the search continues to the end, then wraps to the start.
    const wrapped = await provider.search!({ kind: 'text', value: 'request 999' }, context(9995));
    expect(wrapped.matches.map((match) => match.index).slice(0, 6)).toEqual([
      9995, 9996, 9997, 9998, 9999, 999,
    ]);
    // `%` and `_` are literal characters, not wildcards.
    const literal = await provider.search!({ kind: 'text', value: '100% off_peak' }, context());
    expect(literal.matches.map((match) => match.index)).toEqual([42]);
    expect((await provider.search!({ kind: 'text', value: '1_0' }, context())).matches).toEqual([]);
    const capped = await provider.search!({ kind: 'text', value: 'request' }, context(0, 5));
    expect(capped).toMatchObject({ complete: false, message: expect.stringContaining('first 5') });
    expect(capped.matches).toHaveLength(5);
    const failed = await provider.search!(
      { kind: 'predicate', field: 'status', operator: '=', value: 503 },
      context(),
    );
    expect(failed.matches).toHaveLength(11);
    const auth = await provider.search!(
      { kind: 'predicate', field: 'service', operator: '=', value: 'AUTH' },
      context(0, 3),
    );
    expect(auth.matches.map((match) => match.index)).toEqual([0, 3, 6]);
    const unknown = await provider.search!(
      { kind: 'predicate', field: 'nope', operator: '=', value: 1 },
      context(),
    );
    expect(unknown).toMatchObject({ matches: [], complete: true });

    const timed = await source().open({ timeColumn: 'ts' }, signal());
    expect(timed.searchHelp).toMatchObject({ dates: true });
    const day = await timed.search!({ kind: 'date', value: '2026-09-02' }, context(0, 1));
    // 86,400 / 26 = 3,323.08, so the first row of September 2 is 3,324.
    expect(day.matches[0].index).toBe(3324);
    expect((await timed.search!({ kind: 'date', value: '2026-02-30' }, context())).matches).toEqual(
      [],
    );
  });

  it('names chapters only when each period is one contiguous range', async () => {
    const days = await source().open({ timeColumn: 'ts', chapters: 'day' }, signal());
    const chapters = await days.fetchChapters!(signal());
    expect(chapters.map((chapter) => [chapter.label, chapter.start, chapter.end])).toEqual([
      ['2026-09-01', 0, 3324],
      ['2026-09-02', 3324, 6647],
      ['2026-09-03', 6647, 9970],
      ['2026-09-04', 9970, ROWS],
    ]);
    const shuffled = await source().open(
      { timeColumn: 'ts', chapters: 'day', orderBy: [{ column: 'latency' }, { column: 'id' }] },
      signal(),
    );
    expect(await shuffled.fetchChapters!(signal())).toEqual([]);
  });

  it('marks the largest values as spikes, in row order', async () => {
    const provider = await source().open({ metric: 'latency', peaks: 3 }, signal());
    const markers = await provider.fetchMarkers!(signal());
    expect(markers.map((marker) => [marker.index, marker.kind])).toEqual([
      [99, 'spike'],
      [199, 'spike'],
      [299, 'spike'],
    ]);
  });

  it('keeps a bounded number of revision tables and drops them on dispose', async () => {
    const logs = createSqlSource({ query, id: 'bounded', from: 'logs', keepRevisions: 2 });
    for (const limit of [10, 20, 30, 40])
      await logs.open({ filters: [{ column: 'id', operator: '<', value: limit }] }, signal());
    const tables = async () =>
      (
        await query(
          `SELECT table_name FROM duckdb_tables() WHERE table_name LIKE 'granum_%'`,
          [],
          signal(),
        )
      )
        .map((row) => String(row.table_name))
        .filter(
          (name) => name.startsWith(`granum_`) && statements.some((sql) => sql.includes(name)),
        );
    const kept = await tables();
    await logs.dispose();
    const after = await tables();
    expect(kept.length - after.length).toBe(2);
    await expect(logs.open({}, signal())).rejects.toThrow('disposed');
  });
});

describe('plainValue', () => {
  it('turns engine values into JSON-safe ones', () => {
    expect(plainValue(2n ** 60n)).toBe('1152921504606846976');
    expect(plainValue(42n)).toBe(42);
    expect(plainValue(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-01T00:00:00.000Z');
    expect(plainValue(new Uint8Array(3))).toBe('3 bytes');
    expect(plainValue({ a: [1n, null], b: new Map([[1, 'x']]) })).toEqual({
      a: [1, null],
      b: { 1: 'x' },
    });
    expect(plainValue(Number.NaN)).toBe('NaN');
  });
});

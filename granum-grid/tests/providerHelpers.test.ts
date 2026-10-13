import { expect, it } from 'vitest';
import { createArrayProvider } from '../src/data/array';
import { rangeProvider } from '../src/data/range';
import { searchIssue } from '../src/data/search';
import type { SearchHelp } from '../src/data/types';

it('adapts a bounded slice without inventing capabilities or silently accepting mutations', async () => {
  const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const provider = createArrayProvider(rows, { id: 'rows', revision: '1' });
  const signal = new AbortController().signal;
  expect(await provider.fetchRows(1, 2, signal)).toEqual([{ id: 2 }, { id: 3 }]);
  expect(provider.fetchOverview).toBeUndefined();
  expect(provider.search).toBeUndefined();
  for (const [start, count] of [
    [-1, 1],
    [0, 4],
    [2, 2],
    [0.5, 1],
    [0, NaN],
  ])
    await expect(provider.fetchRows(start, count, signal)).rejects.toThrow(RangeError);
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(provider.fetchRows(0, 1, cancelled.signal)).rejects.toThrow();
  rows.push({ id: 4 });
  await expect(provider.fetchRows(0, 1, signal)).rejects.toThrow('Array length changed');
  const empty = createArrayProvider([], { id: 'empty', revision: '1' });
  expect(await empty.fetchRows(0, 0, signal)).toEqual([]);
});

it('validates only declared search capabilities and explains usable alternatives', () => {
  const help: SearchHelp = {
    examples: ['name = "Layout"'],
    dates: false,
    fields: [
      { name: 'name', type: 'text', operators: ['=', '!='] },
      { name: 'duration', type: 'number', operators: ['>'] },
    ],
  };
  expect(searchIssue({ kind: 'date', value: '2026-09' }, help)).toContain('does not support date');
  expect(
    searchIssue({ kind: 'predicate', field: 'missing', operator: '=', value: 1 }, help),
  ).toContain('name, duration');
  expect(
    searchIssue({ kind: 'predicate', field: 'name', operator: '>', value: 'x' }, help),
  ).toContain('Use name with');
  expect(
    searchIssue({ kind: 'predicate', field: 'duration', operator: '>', value: 'x' }, help),
  ).toContain('requires a number');
  expect(
    searchIssue({ kind: 'predicate', field: 'duration', operator: '>', value: 10 }, help),
  ).toBeNull();
  expect(searchIssue({ kind: 'date', value: '2026-09' })).toBeNull();
  expect(searchIssue({ kind: 'text', value: 'auth' })).toContain('named markers only');
  expect(searchIssue({ kind: 'text', value: 'auth' }, { ...help, text: true })).toBeNull();
});

it('range providers translate local requests and aggregate addresses without scanning', async () => {
  const calls: number[] = [];
  const resolutions: number[] = [];
  const provider = rangeProvider(
    {
      id: 'a',
      revision: '1',
      rowCount: 1000,
      async fetchRows(start, count) {
        calls.push(start);
        return Array.from({ length: count }, (_, i) => start + i);
      },
      async fetchAggregates(range) {
        resolutions.push(range.buckets);
        return [
          {
            ...range,
            count: range.end - range.start,
            avg: 1,
            min: 1,
            max: 1,
            accuracy: 'exact' as const,
          },
        ];
      },
    },
    { start: 200, end: 250 },
  );
  expect(await provider.fetchRows(10, 2, new AbortController().signal)).toEqual([210, 211]);
  expect(calls).toEqual([210]);
  expect((await provider.fetchOverview!(320, new AbortController().signal))[0]).toMatchObject({
    start: 0,
    end: 50,
  });
  await provider.fetchAggregates!(
    { start: 10, end: 12, buckets: 160 },
    new AbortController().signal,
  );
  expect(resolutions).toEqual([50, 2]);
});

it('range providers reject requests outside their window instead of reading parent rows', async () => {
  const parent = {
    id: 'a',
    revision: '1',
    rowCount: 1000,
    async fetchRows(start: number, count: number) {
      return Array.from({ length: count }, (_, i) => start + i);
    },
    async fetchAggregates() {
      return [];
    },
  };
  const provider = rangeProvider(parent, { start: 200, end: 250 });
  const signal = new AbortController().signal;
  expect(await provider.fetchRows(45, 5, signal)).toEqual([245, 246, 247, 248, 249]);
  for (const [start, count] of [
    [45, 10],
    [-1, 1],
    [50, 1],
    [0.5, 1],
  ])
    await expect(provider.fetchRows(start, count, signal)).rejects.toThrow(RangeError);
  await expect(
    provider.fetchAggregates!({ start: 40, end: 60, buckets: 2 }, signal),
  ).rejects.toThrow(RangeError);
});

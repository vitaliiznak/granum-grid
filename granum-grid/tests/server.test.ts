import { expect, it } from 'vitest';
import {
  acceptCursorWindow,
  acceptServerRevision,
  createCursorProvider,
  cursorWindowIssue,
  serverActionIssue,
} from '../src/data/server';
import type { DataProvider, ServerColumn } from '../src/data/types';

const columns: readonly ServerColumn[] = [
  { id: 'level', label: 'Level', type: 'text', sortable: true, filterable: true },
  { id: 'latency', label: 'Latency', type: 'number', sortable: true, filterable: true },
  { id: 'open', label: 'Open', type: 'boolean', editable: true },
  { id: 'message', label: 'Message', type: 'text' },
];

function provider(revision: string, rowCount = 10): DataProvider<number> {
  return {
    id: 'logs',
    revision,
    rowCount,
    async fetchRows() {
      return [];
    },
  };
}

it('rejects server actions the published column model does not allow', () => {
  expect(serverActionIssue({ kind: 'sort', keys: [] }, columns)).toBeNull();
  expect(
    serverActionIssue({ kind: 'sort', keys: [{ columnId: 'level', direction: 'desc' }] }, columns),
  ).toBeNull();
  expect(
    serverActionIssue({ kind: 'sort', keys: [{ columnId: 'message', direction: 'asc' }] }, columns),
  ).toContain('not sortable');
  expect(
    serverActionIssue({ kind: 'sort', keys: [{ columnId: 'missing', direction: 'asc' }] }, columns),
  ).toContain('no column');
  expect(
    serverActionIssue(
      {
        kind: 'sort',
        keys: [
          { columnId: 'level', direction: 'asc' },
          { columnId: 'level', direction: 'desc' },
        ],
      },
      columns,
    ),
  ).toContain('already includes');

  expect(
    serverActionIssue(
      { kind: 'filter', filters: [{ columnId: 'latency', operator: '>', value: 200 }] },
      columns,
    ),
  ).toBeNull();
  expect(
    serverActionIssue(
      { kind: 'filter', filters: [{ columnId: 'level', operator: 'contains', value: 'error' }] },
      columns,
    ),
  ).toBeNull();
  expect(
    serverActionIssue(
      { kind: 'filter', filters: [{ columnId: 'level', operator: '>', value: 'error' }] },
      columns,
    ),
  ).toContain('does not support');
  expect(
    serverActionIssue(
      { kind: 'filter', filters: [{ columnId: 'message', operator: '=', value: 'x' }] },
      columns,
    ),
  ).toContain('not filterable');
  expect(
    serverActionIssue(
      { kind: 'filter', filters: [{ columnId: 'open', operator: '=', value: true }] },
      columns,
    ),
  ).toContain('not filterable');

  expect(
    serverActionIssue(
      { kind: 'edit', edit: { index: 3, columnId: 'open', value: false } },
      columns,
      10,
    ),
  ).toBeNull();
  expect(
    serverActionIssue(
      { kind: 'edit', edit: { index: 3, columnId: 'level', value: 'info' } },
      columns,
      10,
    ),
  ).toContain('not editable');
  expect(
    serverActionIssue(
      { kind: 'edit', edit: { index: 3, columnId: 'open', value: 'no' } },
      columns,
      10,
    ),
  ).toContain('boolean');
  expect(
    serverActionIssue({ kind: 'edit', edit: { index: 10, row: { ok: false } } }, columns, 10),
  ).toContain('outside');
  expect(
    serverActionIssue({ kind: 'edit', edit: { index: 1, row: { nested: true } } }, columns),
  ).toBeNull();
});

it('accepts a new ordered revision and refuses a snapshot that is still the current one', () => {
  const current = provider('1');
  expect(acceptServerRevision(current, provider('2', 4))).toMatchObject({
    id: 'logs',
    revision: '2',
    rowCount: 4,
  });
  expect(() => acceptServerRevision(current, provider('1'))).toThrow(/new revision/);
  expect(() => acceptServerRevision(current, { ...provider('2'), id: 'other' })).toThrow(
    /dataset id/,
  );
  expect(() => acceptServerRevision(current, { ...provider('2'), rowCount: -1 })).toThrow(
    RangeError,
  );
  expect(() => acceptServerRevision(current, { ...provider(''), revision: '' })).toThrow(
    /new revision/,
  );
});

it('checks a cursor window and fills one slice without reading the rest of the revision', async () => {
  expect(cursorWindowIssue({ cursor: null, windowSize: 0 })).toContain('positive integer');
  expect(cursorWindowIssue({ cursor: '', windowSize: 2 })).toContain('opaque string');
  expect(cursorWindowIssue({ cursor: 'after:4', windowSize: 2 })).toBeNull();
  expect(
    acceptCursorWindow(
      { rows: [4, 5], start: 4, nextCursor: 'after:6' },
      { windowSize: 2, rowCount: 10 },
    ),
  ).toMatchObject({ start: 4 });
  expect(
    acceptCursorWindow(
      { rows: [8, 9], start: 8, nextCursor: null },
      { windowSize: 4, rowCount: 10 },
    ),
  ).toMatchObject({ nextCursor: null });
  expect(() =>
    acceptCursorWindow(
      { rows: [0, 1, 2], start: 0, nextCursor: null },
      { windowSize: 2, rowCount: 10 },
    ),
  ).toThrow(/larger than the requested window/);
  expect(() =>
    acceptCursorWindow({ rows: [0], start: 0, nextCursor: null }, { windowSize: 2, rowCount: 10 }),
  ).toThrow(/omitted the cursor/);
  expect(() =>
    acceptCursorWindow(
      { rows: [8, 9], start: 8, nextCursor: 'more' },
      { windowSize: 2, rowCount: 10 },
    ),
  ).toThrow(/end of the revision/);

  const calls: { cursor: string | null; windowSize: number }[] = [];
  const seeks: number[] = [];
  const dataset = {
    async cursorAt(index: number) {
      seeks.push(index);
      return `at:${index}`;
    },
    async fetchWindow(query: { cursor: string | null; windowSize: number }) {
      calls.push(query);
      const start = query.cursor === null ? 0 : Number(query.cursor.split(':')[1]);
      const size = Math.min(2, query.windowSize);
      return {
        rows: Array.from({ length: size }, (_, i) => start + i),
        start,
        nextCursor: start + size < 10 ? `at:${start + size}` : null,
      };
    },
  };
  const signal = new AbortController().signal;
  const provider = createCursorProvider(dataset, { id: 'logs', revision: '1', rowCount: 10 });
  expect(await provider.fetchRows(0, 0, signal)).toEqual([]);
  expect(calls).toEqual([]);
  expect(await provider.fetchRows(0, 2, signal)).toEqual([0, 1]);
  expect(seeks).toEqual([]);
  expect(calls).toEqual([{ cursor: null, windowSize: 2 }]);
  expect(await provider.fetchRows(4, 5, signal)).toEqual([4, 5, 6, 7, 8]);
  expect(seeks).toEqual([4]);
  expect(calls.slice(1)).toEqual([
    { cursor: 'at:4', windowSize: 5 },
    { cursor: 'at:6', windowSize: 3 },
    { cursor: 'at:8', windowSize: 1 },
  ]);
  dataset.fetchWindow = async () => ({ rows: [1, 2], start: 1, nextCursor: 'at:3' });
  await expect(provider.fetchRows(4, 2, signal)).rejects.toThrow(/requested address/);
});

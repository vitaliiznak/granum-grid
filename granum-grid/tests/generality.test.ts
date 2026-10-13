import { expect, it, vi } from 'vitest';
import { createArrayProvider } from '../src/data/array';
import { rangeProvider } from '../src/data/range';
import { DataSession } from '../src/data/session';
import type { DataProvider } from '../src/data/types';

it('pages opaque row values without requiring fields, JSON serialization, or truthy values', async () => {
  const circular: { self?: unknown } = {};
  circular.self = circular;
  const rows = [
    undefined,
    null,
    false,
    0,
    '',
    'plain text',
    42n,
    ['tuple', 7],
    new Date('2026-01-01'),
    new Map([['key', 'value']]),
    circular,
    { customer: { name: 'Ada' }, tags: ['priority'] },
  ] as const;
  const session = new DataSession(createArrayProvider(rows, { id: 'opaque', revision: '1' }), {
    pageSize: 4,
  });
  try {
    session.start();
    session.setRange('visible', 0, rows.length);
    await vi.waitFor(() => expect(session.getStats().activeRequests).toBe(0));
    rows.forEach((row, index) => {
      expect(session.has(index)).toBe(true);
      expect(session.read(index)).toBe(row);
      expect(session.error(index)).toBeUndefined();
    });
    // An undefined payload is still a loaded row, distinct from an absent address.
    expect(session.has(rows.length)).toBe(false);
    expect(session.getStats().cachedRows).toBe(rows.length);
    expect(session.metadataErrors).toEqual({});
    expect(session.overview).toEqual([]);
    expect(session.markers).toEqual([]);
    expect(session.chapters).toEqual([]);
  } finally {
    session.stop();
  }
});

it('preserves custom row values and order through an indexed range', async () => {
  const rows = [new Set(['a']), new Set(['b']), new Set(['c']), new Set(['d'])];
  const source = createArrayProvider(rows, { id: 'sets', revision: '1' });
  const window = rangeProvider(source, { start: 1, end: 3 });
  const session = new DataSession(window, { pageSize: 2 });
  try {
    session.setRange('visible', 0, 2);
    await vi.waitFor(() => expect(session.has(1)).toBe(true));
    expect(window.rowCount).toBe(2);
    expect(session.read(0)).toBe(rows[1]);
    expect(session.read(1)).toBe(rows[2]);
    expect(session.has(2)).toBe(false);
  } finally {
    session.stop();
  }
});

it('requests only destination pages for a remote-shaped dataset beyond 32-bit row counts', async () => {
  type Document = { key: string; content: { title: string; labels: string[] } };
  const rowCount = 5_000_000_003;
  const fetchRows = vi.fn(async (start: number, count: number, signal: AbortSignal) => {
    signal.throwIfAborted();
    return Array.from({ length: count }, (_, offset): Document => ({
      key: `doc-${start + offset}`,
      content: { title: `Document ${start + offset}`, labels: ['archived'] },
    }));
  });
  const provider: DataProvider<Document> = { id: 'documents', revision: '1', rowCount, fetchRows };
  const session = new DataSession(provider, { pageSize: 8 });
  try {
    session.start();
    session.setRange('visible', rowCount - 10, 10);
    await vi.waitFor(() => expect(session.has(rowCount - 1)).toBe(true));
    expect(fetchRows.mock.calls.map(([start, count]) => [start, count])).toEqual([
      [4_999_999_992, 8],
      [5_000_000_000, 3],
    ]);
    expect(session.getStats().cachedRows).toBe(11);
    expect(session.read(rowCount - 1)).toEqual({
      key: 'doc-5000000002',
      content: { title: 'Document 5000000002', labels: ['archived'] },
    });
    expect(session.has(0)).toBe(false);
  } finally {
    session.stop();
  }
});

it('does not fetch rows or invent metadata for an empty dataset', async () => {
  const provider = createArrayProvider<string>([], { id: 'empty', revision: '1' });
  const fetchRows = vi.spyOn(provider, 'fetchRows');
  const session = new DataSession(provider);
  try {
    session.start();
    session.setRange('visible', 0, 20);
    await Promise.resolve();
    expect(fetchRows).not.toHaveBeenCalled();
    expect(session.has(0)).toBe(false);
    expect(session.getStats().activeRequests).toBe(0);
    expect(session.getStats().cachedRows).toBe(0);
  } finally {
    session.stop();
  }
});

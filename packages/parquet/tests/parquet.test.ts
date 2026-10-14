import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compressors } from 'hyparquet-compressors';
import { checkBuckets } from 'granum-grid/data';
import {
  createParquetProvider,
  estimateParquetRowBytes,
  openParquetFile,
  type RangeFetch,
} from '../src/index';

// 1,000 rows in ten zstd row groups of 100, with a page index: id, label, value, when.
const bytes = new Uint8Array(readFileSync(new URL('./fixtures/readings.parquet', import.meta.url)));
const URL_ = 'https://files.example/readings.parquet';
const signal = () => new AbortController().signal;

/** A file server for `bytes`. `gate` holds every range response until it resolves. */
function server({ ranges = true, gate }: { ranges?: boolean; gate?: Promise<void> } = {}) {
  const log: string[] = [];
  // Like the browser's fetch, refuse to run as a method of another object.
  const request: RangeFetch = async function (this: unknown, _url, { signal, method, headers }) {
    if (this !== undefined) throw new TypeError('Illegal invocation');
    signal.throwIfAborted();
    if (method === 'HEAD')
      return new Response(null, {
        headers: { 'content-length': String(bytes.length), etag: '"v1"' },
      });
    const range = /^bytes=(\d+)-(\d+)$/.exec(headers?.Range ?? '');
    log.push(headers?.Range ?? 'whole file');
    if (gate) await gate;
    signal.throwIfAborted();
    if (!range || !ranges) return new Response(bytes, { status: 200 });
    const start = Number(range[1]),
      end = Number(range[2]) + 1;
    return new Response(bytes.slice(start, end), {
      status: 206,
      headers: { 'content-range': `bytes ${start}-${end - 1}/${bytes.length}` },
    });
  };
  return { request, log };
}

describe('Parquet over range requests', () => {
  it('reads only the end of the file to learn the exact row count and schema', async () => {
    const { request, log } = server();
    const { file, transfer } = await openParquetFile(URL_, signal(), { request });
    expect(file).toMatchObject({ rowCount: 1000, rowGroups: 10, revision: '"v1"' });
    expect(file.columns).toEqual([
      { name: 'id', type: 'INT64', numeric: true },
      { name: 'label', type: 'BYTE_ARRAY · STRING', numeric: false },
      { name: 'value', type: 'DOUBLE', numeric: true },
      { name: 'when', type: 'INT64 · TIMESTAMP', numeric: false },
    ]);
    // One read from the end holds the footer (up to 512 KB, so all of this small fixture).
    expect(log).toEqual([`bytes=0-${bytes.length - 1}`]);
    expect(transfer).toEqual({ requests: 2, bytes: bytes.length });
    // Every column has an offset index, so a jump reads pages; the largest group is small.
    expect(file.pageIndex).toBe(true);
    expect(file.largestRowGroupBytes).toBeGreaterThan(0);
    expect(file.largestRowGroupBytes).toBeLessThan(bytes.length);
  });

  it('loads decompressors once, on the first read that needs them', async () => {
    const { request } = server();
    const { file } = await openParquetFile(URL_, signal(), { request });
    let loads = 0;
    const provider = createParquetProvider(file, {
      request,
      compressors: async () => {
        loads++;
        return compressors;
      },
    });
    expect(loads).toBe(0);
    await Promise.all([provider.fetchRows(0, 5, signal()), provider.fetchRows(500, 5, signal())]);
    await provider.fetchRows(900, 5, signal());
    expect(loads).toBe(1);
    // The fixture is zstd, which hyparquet does not decode on its own.
    await expect(
      createParquetProvider(file, { request }).fetchRows(0, 5, signal()),
    ).rejects.toThrow();
  });

  it('serves any address from its row group, across group boundaries, as plain values', async () => {
    const { request, log } = server();
    const { file } = await openParquetFile(URL_, signal(), { request });
    const provider = createParquetProvider(file, { request, compressors });
    const rows = await provider.fetchRows(95, 10, signal());
    expect(rows.map((row) => row.id)).toEqual([95, 96, 97, 98, 99, 100, 101, 102, 103, 104]);
    expect(rows[0]).toEqual({
      id: 95,
      label: 'reading 96',
      value: expect.any(Number),
      when: '2026-01-01T01:35:00.000Z',
    });
    expect((await provider.fetchRows(999, 1, signal()))[0].label).toBe('reading 1000');
    expect(await provider.fetchRows(1000, 0, signal())).toEqual([]);
    // A jump reads byte ranges, never the whole file.
    expect(log).not.toContain('whole file');
    expect(provider.transfer.bytes).toBeLessThan(bytes.length);
  });

  it('reads the footer on first use and rejects a file that no longer matches', async () => {
    const { request } = server();
    const facts = { url: URL_, byteLength: bytes.length, revision: 'pinned', rowCount: 1000 };
    const provider = createParquetProvider(facts, { metricColumn: 'value', request, compressors });
    expect(provider).toMatchObject({ id: `parquet:${URL_}`, revision: 'pinned', rowCount: 1000 });
    expect((await provider.fetchRows(500, 1, signal()))[0].id).toBe(500);
    const changed = createParquetProvider({ ...facts, rowCount: 999 }, { request, compressors });
    await expect(changed.fetchRows(0, 1, signal())).rejects.toThrow(
      'This file changed: expected 999 rows, the footer says 1000.',
    );
  });

  it('shares a range between readers and cancels it only when every reader leaves', async () => {
    const { file } = await openParquetFile(URL_, signal(), { request: server().request });
    const alone = server();
    await createParquetProvider(file, { request: alone.request, compressors }).fetchRows(
      20,
      5,
      signal(),
    );
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const { request, log } = server({ gate });
    const provider = createParquetProvider(file, { request, compressors });
    const left = new AbortController();
    const first = provider.fetchRows(20, 5, left.signal);
    const second = provider.fetchRows(20, 5, signal());
    await new Promise((resolve) => setTimeout(resolve, 10));
    left.abort();
    await expect(first).rejects.toThrow();
    open();
    expect((await second).map((row) => row.id)).toEqual([20, 21, 22, 23, 24]);
    // Two readers of the same rows cost what one reader costs.
    expect(log).toEqual(alone.log);
    const lonely = new AbortController();
    const lone = provider.fetchRows(410, 5, lonely.signal);
    lonely.abort();
    await expect(lone).rejects.toThrow();
  });

  it('reads from where a redirect led until that URL fails, then from the original', async () => {
    const { request: serve } = server();
    const { file } = await openParquetFile(URL_, signal(), { request: serve });
    const CDN = 'https://cdn.example/signed';
    const asked: string[] = [];
    let expired = false;
    const request: RangeFetch = async (url, init) => {
      asked.push(url);
      if (url === CDN && expired) return new Response('expired', { status: 403 });
      const response = await serve(url, init);
      if (url === CDN) return response;
      // Model a redirect: the original URL answers with the CDN's bytes and final URL.
      Object.defineProperties(response, { redirected: { value: true }, url: { value: CDN } });
      return response;
    };
    const provider = createParquetProvider(file, { request, compressors });
    // The first read's concurrent requests start before any redirect is known.
    await provider.fetchRows(0, 1, signal());
    expect(asked[0]).toBe(URL_);
    const first = asked.length;
    await provider.fetchRows(500, 1, signal());
    expect(asked.length).toBeGreaterThan(first);
    expect(asked.slice(first).every((url) => url === CDN)).toBe(true);
    expired = true;
    asked.length = 0;
    expect((await provider.fetchRows(900, 1, signal()))[0].id).toBe(900);
    // Concurrent reads may each try the expired URL before one returns to the original.
    expect(asked[0]).toBe(CDN);
    expect(asked).toContain(URL_);
  });

  it('refuses a server that ignores byte ranges instead of downloading the file', async () => {
    const { request } = server({ ranges: false });
    await expect(openParquetFile(URL_, signal(), { request })).rejects.toThrow(
      'This server ignores byte ranges',
    );
  });

  it('labels a sampled map: exact row-group min–max, the mean of one read group per bucket', async () => {
    const { request } = server();
    const { file } = await openParquetFile(URL_, signal(), { request });
    const provider = createParquetProvider(file, { metricColumn: 'value', request, compressors });
    expect(provider.metric).toMatchObject({ label: 'value', kind: 'value' });
    const all = await provider.fetchRows(0, 1000, signal());
    const values = all.map((row) => row.value as number);
    const fine = checkBuckets(await provider.fetchOverview!(320, signal()), {
      start: 0,
      end: 1000,
      buckets: 320,
    });
    // One bucket per row group: everything in it was read, so it is exact.
    expect(fine).toHaveLength(10);
    const group = values.slice(300, 400);
    expect(fine[3]).toMatchObject({
      start: 300,
      end: 400,
      count: 100,
      min: Math.min(...group),
      max: Math.max(...group),
      accuracy: 'exact',
    });
    expect(fine[3].avg).toBeCloseTo(group.reduce((sum, value) => sum + value, 0) / 100, 9);
    const coarse = checkBuckets(await provider.fetchOverview!(4, signal()), {
      start: 0,
      end: 1000,
      buckets: 4,
    });
    expect(coarse.map((bucket) => bucket.accuracy)).toEqual([
      'estimated',
      'estimated',
      'estimated',
      'estimated',
    ]);
    expect(coarse[0]).toMatchObject({ min: Math.min(...values.slice(0, 200)), count: 200 });
  });

  it('counts nested values toward the cache size of a row', () => {
    const flat = estimateParquetRowBytes({ tags: null });
    const nested = estimateParquetRowBytes({
      tags: ['a'.repeat(1000), { note: 'b'.repeat(1000) }],
    });
    expect(nested - flat).toBeGreaterThan(4000);
  });
});

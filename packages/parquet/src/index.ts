import type { AsyncBuffer, Compressors, FileMetaData, SchemaElement } from 'hyparquet';
import type { Bucket, DataProvider } from '@granum/core/data';

let library: Promise<typeof import('hyparquet')> | null = null;
/** hyparquet loads on first use, so a host's main bundle does not carry it. */
const parquet = () =>
  (library ??= import('hyparquet').catch((error) => {
    library = null;
    throw error;
  }));

/**
 * Decompressors for codecs hyparquet does not decode itself (it reads uncompressed and
 * Snappy pages). Pass `compressors` from `hyparquet-compressors` for zstd, gzip, Brotli, or
 * LZ4, or a function that loads them on first use.
 */
export type CompressorsOption = Compressors | (() => Promise<Compressors>);

function compressorLoader(option: CompressorsOption | undefined) {
  if (typeof option !== 'function') return () => Promise.resolve(option);
  let loaded: Promise<Compressors> | null = null;
  return () =>
    (loaded ??= option().catch((error) => {
      loaded = null;
      throw error;
    }));
}

/**
 * A load shared by every caller. A caller's signal ends only its own wait; a failed load
 * is retried by the next caller.
 */
function sharedLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  let pending: Promise<T> | null = null;
  return (signal: AbortSignal) => {
    const shared = (pending ??= load(new AbortController().signal).catch((error) => {
      pending = null;
      throw error;
    }));
    return new Promise<T>((resolve, reject) => {
      signal.throwIfAborted();
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      shared.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  };
}

/** A `fetch` replacement, for tests. */
export type RangeFetch = (
  url: string,
  init: { signal: AbortSignal; method?: 'HEAD'; headers?: Record<string, string> },
) => Promise<Response>;
// The browser's fetch rejects any other `this`, such as an object that stores it.
const browserFetch: RangeFetch = (url, init) => fetch(url, init);

/**
 * A Parquet file read in place over HTTP range requests, with no server of our own. The
 * footer holds every row group's row count, so the row count is exact and a row address
 * maps to one row group; a jump downloads only the column chunks of that group (or, with
 * a page index, only the pages that hold the rows).
 */

/** A row with JSON-safe values: large integers and binary become text, dates ISO strings. */
export type ParquetRow = Record<string, ParquetValue>;
export type ParquetValue =
  string | number | boolean | null | ParquetValue[] | { [key: string]: ParquetValue };

export interface ParquetColumn {
  name: string;
  /** Physical type, with the logical type when there is one, such as `INT64 · TIMESTAMP`. */
  type: string;
  /** A plain number column whose row-group statistics can describe the map. */
  numeric: boolean;
}

/** Bytes and requests this page has spent on one file, footer included. */
export interface ParquetTransfer {
  requests: number;
  bytes: number;
}

/** What the footer says, and the size of the file. */
export interface ParquetFile {
  url: string;
  byteLength: number;
  /** Names this version of the file: the ETag when the server exposes it, else the size. */
  revision: string;
  rowCount: number;
  rowGroups: number;
  /**
   * Compressed bytes of the largest row group. Without a page index, a jump into that
   * group downloads about this much.
   */
  largestRowGroupBytes: number;
  /** Whether every column has an offset index, so a jump reads pages instead of groups. */
  pageIndex: boolean;
  columns: ParquetColumn[];
  metadata: FileMetaData;
  /** Footer download time in milliseconds, including the size request. */
  footerMs: number;
}

/** Known facts about a file whose footer has not been read yet. */
export interface ParquetFileFacts {
  url: string;
  byteLength: number;
  revision: string;
  rowCount: number;
}

/** Cached byte ranges across reads; a row group is read once while you move inside it. */
const CACHE_BYTES = 48 * 1024 * 1024;
/** Most bytes and row groups the sampled map may read. */
const OVERVIEW_BYTES = 8 * 1024 * 1024;
const OVERVIEW_SAMPLES = 24;
const OVERVIEW_CONCURRENCY = 6;

const RANGES_IGNORED =
  'This server ignores byte ranges, so reading one row would download the whole file.';

/**
 * Byte ranges of one URL. Concurrent reads of the same range share one request, which is
 * aborted only when every reader has gone; completed ranges stay in a bounded cache.
 */
class RangeReader {
  private cache = new Map<string, ArrayBuffer>();
  private cachedBytes = 0;
  private pending = new Map<
    string,
    { promise: Promise<ArrayBuffer>; controller: AbortController; readers: number }
  >();
  readonly transfer: ParquetTransfer = { requests: 0, bytes: 0 };
  /**
   * Where a redirect led, such as a CDN's signed URL. Reusing it saves a round trip per
   * read; when it fails (a signed URL expires), reads return to the original URL.
   */
  private resolved: string | null = null;

  constructor(
    private url: string,
    readonly byteLength: number,
    private request: RangeFetch,
    private onTransfer: () => void,
  ) {}

  /** An `AsyncBuffer` for hyparquet whose reads end when `signal` aborts. */
  buffer(signal: AbortSignal): AsyncBuffer {
    return {
      byteLength: this.byteLength,
      slice: (start, end = this.byteLength) => this.read(start, end, signal),
    };
  }

  read(start: number, end: number, signal: AbortSignal): Promise<ArrayBuffer> {
    if (signal.aborted) return Promise.reject(signal.reason);
    const key = `${start}:${end}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached);
    }
    let shared = this.pending.get(key);
    if (!shared) {
      const controller = new AbortController();
      const entry = {
        controller,
        readers: 0,
        promise: this.fetchRange(start, end, controller.signal).then((buffer) => {
          this.store(key, buffer);
          return buffer;
        }),
      };
      entry.promise
        .finally(() => {
          if (this.pending.get(key) === entry) this.pending.delete(key);
        })
        .catch(() => {});
      this.pending.set(key, entry);
      shared = entry;
    }
    const entry = shared;
    entry.readers++;
    return new Promise<ArrayBuffer>((resolve, reject) => {
      let done = false;
      const leave = () => {
        if (done) return false;
        done = true;
        signal.removeEventListener('abort', abort);
        entry.readers--;
        return true;
      };
      const abort = () => {
        if (!leave()) return;
        // The last reader to leave cancels the download.
        if (entry.readers === 0 && this.pending.get(key) === entry) {
          this.pending.delete(key);
          entry.controller.abort(signal.reason);
        }
        reject(signal.reason);
      };
      signal.addEventListener('abort', abort, { once: true });
      entry.promise.then(
        (buffer) => leave() && resolve(buffer),
        (error) => leave() && reject(error),
      );
    });
  }

  private async fetchRange(start: number, end: number, signal: AbortSignal) {
    const { request, resolved } = this;
    const init = { signal, headers: { Range: `bytes=${start}-${end - 1}` } };
    let response: Response;
    try {
      response = await request(resolved ?? this.url, init);
      if (resolved && !response.ok) {
        await response.body?.cancel();
        throw new Error('The resolved URL stopped working.');
      }
    } catch (error) {
      if (signal.aborted || !resolved) throw error;
      if (this.resolved === resolved) this.resolved = null;
      response = await request(this.url, init);
    }
    if (response.redirected && response.url) this.resolved = response.url;
    this.transfer.requests++;
    if (response.status === 200) {
      await response.body?.cancel();
      throw new Error(RANGES_IGNORED);
    }
    if (response.status !== 206) throw new Error(`The file server answered ${response.status}.`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== end - start)
      throw new Error('The file server returned a different byte range than requested.');
    this.transfer.bytes += buffer.byteLength;
    this.onTransfer();
    return buffer;
  }

  private store(key: string, buffer: ArrayBuffer) {
    if (buffer.byteLength > CACHE_BYTES / 4) return;
    this.cache.set(key, buffer);
    this.cachedBytes += buffer.byteLength;
    for (const [oldest, value] of this.cache) {
      if (this.cachedBytes <= CACHE_BYTES) break;
      this.cache.delete(oldest);
      this.cachedBytes -= value.byteLength;
    }
  }
}

/** The file's size and version, from HEAD or, where HEAD is refused, a one-byte read. */
async function fileSize(url: string, request: RangeFetch, signal: AbortSignal) {
  const head = await request(url, { signal, method: 'HEAD' });
  const length = Number(head.headers.get('content-length'));
  if (head.ok && length > 0)
    return { byteLength: length, etag: head.headers.get('etag'), requests: 1 };
  const probe = await request(url, { signal, headers: { Range: 'bytes=0-0' } });
  await probe.body?.cancel();
  if (probe.status === 200) throw new Error(RANGES_IGNORED);
  const total = Number(/\/(\d+)$/.exec(probe.headers.get('content-range') ?? '')?.[1]);
  if (!probe.ok || !(total > 0)) throw new Error('The file server did not report the file size.');
  return { byteLength: total, etag: probe.headers.get('etag'), requests: 2 };
}

function describeColumn(element: SchemaElement): ParquetColumn {
  const logical = element.logical_type?.type ?? element.converted_type;
  const physical = element.type ?? 'GROUP';
  return {
    name: element.name,
    type: logical ? `${physical} · ${logical}` : physical,
    numeric:
      !logical &&
      (physical === 'INT32' ||
        physical === 'INT64' ||
        physical === 'FLOAT' ||
        physical === 'DOUBLE'),
  };
}

function readFooter(
  metadata: FileMetaData,
  parquetSchema: Awaited<ReturnType<typeof parquet>>['parquetSchema'],
) {
  const rowCount = Number(metadata.num_rows);
  if (!Number.isSafeInteger(rowCount) || rowCount < 0)
    throw new Error('The footer reports a row count this page cannot address.');
  const groupRows = metadata.row_groups.reduce((sum, group) => sum + Number(group.num_rows), 0);
  if (groupRows !== rowCount)
    throw new Error('The footer’s row groups do not add up to its row count.');
  const chunks = metadata.row_groups.flatMap((group) => group.columns);
  return {
    rowCount,
    largestRowGroupBytes: metadata.row_groups.reduce(
      (largest, group) =>
        Math.max(
          largest,
          group.columns.reduce(
            (sum, chunk) => sum + Number(chunk.meta_data?.total_compressed_size ?? 0),
            0,
          ),
        ),
      0,
    ),
    pageIndex: chunks.length > 0 && chunks.every((chunk) => chunk.offset_index_offset != null),
    columns: parquetSchema(metadata).children.map((child) => describeColumn(child.element)),
  };
}

export interface OpenParquetOptions {
  /** A `fetch` replacement, for tests or authenticated requests. */
  request?: RangeFetch;
}

/** Read the footer of the Parquet file at `url`. Nothing but the footer is downloaded. */
export async function openParquetFile(
  url: string,
  signal: AbortSignal,
  { request = browserFetch }: OpenParquetOptions = {},
): Promise<{ file: ParquetFile; transfer: ParquetTransfer }> {
  const started = performance.now();
  const { parquetMetadataAsync, parquetSchema } = await parquet();
  const size = await fileSize(url, request, signal);
  const reader = new RangeReader(url, size.byteLength, request, () => {});
  const metadata = await parquetMetadataAsync(reader.buffer(signal));
  const footer = readFooter(metadata, parquetSchema);
  return {
    file: {
      url,
      byteLength: size.byteLength,
      revision: size.etag ?? `${size.byteLength} bytes`,
      rowGroups: metadata.row_groups.length,
      ...footer,
      metadata,
      footerMs: performance.now() - started,
    },
    transfer: {
      requests: reader.transfer.requests + size.requests,
      bytes: reader.transfer.bytes,
    },
  };
}

function plain(value: unknown): ParquetValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint')
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Uint8Array) return `${value.byteLength} bytes`;
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  return String(value);
}

const statNumber = (value: unknown) => {
  const number = typeof value === 'bigint' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
};

/** Groups of rows the sampled map reads: each bucket's middle row group, within a byte budget. */
function overviewPlan(metadata: FileMetaData, column: string, buckets: number) {
  const groups: { start: number; end: number; index: number; bytes: number }[] = [];
  let start = 0;
  metadata.row_groups.forEach((group, index) => {
    const rows = Number(group.num_rows);
    const chunk = group.columns.find((c) => c.meta_data?.path_in_schema.join('.') === column);
    if (rows > 0)
      groups.push({
        start,
        end: start + rows,
        index,
        bytes: Number(chunk?.meta_data?.total_compressed_size ?? 0),
      });
    start += rows;
  });
  const average = groups.reduce((sum, group) => sum + group.bytes, 0) / (groups.length || 1);
  const count = Math.min(
    groups.length,
    buckets,
    OVERVIEW_SAMPLES,
    Math.floor(OVERVIEW_BYTES / Math.max(1, average)),
  );
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const first = Math.floor((i * groups.length) / count);
    const last = Math.floor(((i + 1) * groups.length) / count);
    return {
      groups: groups.slice(first, last),
      sample: groups[Math.floor((first + last - 1) / 2)],
    };
  });
}

async function eachLimited<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await run(items[next++]);
    }),
  );
}

export interface ParquetProviderOptions {
  /** Numeric column for the map. Default: the first plain number column, if any. */
  metricColumn?: string;
  /** Fixed map scale, for a column whose extremes would flatten its mean. */
  domain?: readonly [number, number];
  /** Called after each download, for a running total. */
  onTransfer?(transfer: ParquetTransfer): void;
  /** A `fetch` replacement, for tests or authenticated requests. */
  request?: RangeFetch;
  /** Decoders for compressed pages beyond Snappy; see `CompressorsOption`. */
  compressors?: CompressorsOption;
}

export interface ParquetProvider extends DataProvider<ParquetRow> {
  /** The footer, read once and shared by every request. */
  file(signal: AbortSignal): Promise<ParquetFile>;
  readonly transfer: ParquetTransfer;
}

/**
 * A provider over one Parquet file. Pass an opened `ParquetFile`, or known facts to read the
 * footer on first use; the footer must then match them. The map shows one numeric column:
 * its band is the exact row-group min–max from statistics, and its line is the exact mean of
 * one sampled row group per bucket, so the overview is labeled sampled.
 */
export function createParquetProvider(
  source: ParquetFile | ParquetFileFacts,
  {
    metricColumn,
    domain,
    onTransfer,
    request = browserFetch,
    compressors,
  }: ParquetProviderOptions = {},
): ParquetProvider {
  const decoders = compressorLoader(compressors);
  const reader = new RangeReader(source.url, source.byteLength, request, () =>
    onTransfer?.(reader.transfer),
  );
  const opened = 'metadata' in source ? source : null;
  const file = sharedLoad<ParquetFile>(async (signal) => {
    if (opened) return opened;
    const started = performance.now();
    const { parquetMetadataAsync, parquetSchema } = await parquet();
    const metadata = await parquetMetadataAsync(reader.buffer(signal));
    const footer = readFooter(metadata, parquetSchema);
    if (footer.rowCount !== source.rowCount)
      throw new Error(
        `This file changed: expected ${source.rowCount} rows, the footer says ${footer.rowCount}.`,
      );
    return {
      ...source,
      ...footer,
      rowGroups: metadata.row_groups.length,
      metadata,
      footerMs: performance.now() - started,
    };
  });
  const metric = metricColumn ?? opened?.columns.find((column) => column.numeric)?.name;
  return {
    id: `parquet:${source.url}`,
    revision: source.revision,
    rowCount: source.rowCount,
    transfer: reader.transfer,
    file,
    metric: metric
      ? {
          label: metric,
          kind: 'value',
          domain,
          description: `The band is each row group’s exact ${metric} min–max from the file’s statistics; the line is the mean of one row group read per bucket.`,
        }
      : undefined,
    async fetchRows(start, count, signal) {
      if (!count) return [];
      const [{ metadata }, { parquetReadObjects }, compressors] = await Promise.all([
        file(signal),
        parquet(),
        decoders(),
      ]);
      const rows = await parquetReadObjects({
        file: reader.buffer(signal),
        metadata,
        rowStart: start,
        rowEnd: start + count,
        compressors,
        useOffsetIndex: true,
      });
      signal.throwIfAborted();
      if (rows.length !== count)
        throw new Error(`Expected ${count} rows from the file, read ${rows.length}.`);
      return rows.map((row) => plain(row) as ParquetRow);
    },
    fetchOverview: metric
      ? async (buckets, signal) => {
          const [{ metadata, rowCount }, { parquetReadObjects }, compressors] = await Promise.all([
            file(signal),
            parquet(),
            decoders(),
          ]);
          const plan = overviewPlan(metadata, metric, buckets);
          // No sample fits the byte budget: say so for the whole file rather than guess.
          if (!plan.length)
            return rowCount
              ? [
                  {
                    start: 0,
                    end: rowCount,
                    count: rowCount,
                    avg: null,
                    min: null,
                    max: null,
                    accuracy: 'unavailable',
                  },
                ]
              : [];
          const means = new Map<number, number | null>();
          await eachLimited(plan, OVERVIEW_CONCURRENCY, async ({ sample }) => {
            const rows = await parquetReadObjects({
              file: reader.buffer(signal),
              metadata,
              columns: [metric],
              rowStart: sample.start,
              rowEnd: sample.end,
              compressors,
            });
            const values = rows
              .map((row) => statNumber(row[metric]))
              .filter((value) => value !== null);
            means.set(
              sample.index,
              values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
            );
          });
          signal.throwIfAborted();
          return plan.map(({ groups, sample }): Bucket => {
            const stats = groups.map(
              (group) =>
                metadata.row_groups[group.index].columns.find(
                  (c) => c.meta_data?.path_in_schema.join('.') === metric,
                )?.meta_data?.statistics,
            );
            const mins = stats.map((s) => statNumber(s?.min_value ?? s?.min));
            const maxes = stats.map((s) => statNumber(s?.max_value ?? s?.max));
            const known = (values: (number | null)[]): values is number[] =>
              values.every((value) => value !== null);
            return {
              start: groups[0].start,
              end: groups[groups.length - 1].end,
              count: groups[groups.length - 1].end - groups[0].start,
              avg: means.get(sample.index) ?? null,
              min: known(mins) ? Math.min(...mins) : null,
              max: known(maxes) ? Math.max(...maxes) : null,
              accuracy: groups.length === 1 ? 'exact' : 'estimated',
              label: `Row groups ${groups[0].index + 1}–${groups[groups.length - 1].index + 1}`,
            };
          });
        }
      : undefined,
  };
}

/** Rough in-memory size of a row, nested values included, for the explorer's cache budget. */
export function estimateParquetRowBytes(row: ParquetRow): number {
  return valueBytes(row);
}
function valueBytes(value: ParquetValue): number {
  if (typeof value === 'string') return 16 + 2 * value.length;
  if (value === null || typeof value !== 'object') return 16;
  let bytes = 32;
  for (const item of Array.isArray(value) ? value : Object.values(value)) bytes += valueBytes(item);
  return bytes;
}

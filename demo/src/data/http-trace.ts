import type { DataProvider } from '@granum-grid/react';
import type { TraceRow } from './trace';

/** Path prefix of the dev server's trace service (`demo/server/trace.ts`). */
export const TRACE_API = '/__granum-grid/trace/';

export interface RequestMeasurement {
  operation: string;
  bytes: number;
  durationMs: number;
}
type Metadata = Pick<
  DataProvider<TraceRow>,
  'id' | 'revision' | 'rowCount' | 'metric' | 'searchHelp'
>;

/** The server owns the recording. This module downloads only requested JSON responses. */
export async function connectHttpTrace(
  signal: AbortSignal,
  onRequest: (measurement: RequestMeasurement) => void,
): Promise<DataProvider<TraceRow>> {
  async function read<T>(
    operation: string,
    params: Record<string, string | number>,
    signal: AbortSignal,
  ): Promise<T> {
    const query = new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    );
    const start = performance.now();
    const response = await fetch(`${TRACE_API}${operation}?${query}`, { signal });
    if (!response.headers.get('content-type')?.includes('application/json'))
      // Static hosting answers with a 404 page or an HTML fallback; the local server uses JSON.
      throw new Error(
        response.ok || response.status === 404
          ? 'This example needs the local demo server. Run npm run dev, then open /http.html.'
          : `Request failed (${response.status})`,
      );
    const text = await response.text();
    signal.throwIfAborted();
    onRequest({
      operation,
      bytes: new TextEncoder().encode(text).byteLength,
      durationMs: performance.now() - start,
    });
    const body = JSON.parse(text);
    if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
    return body as T;
  }
  const metadata = await read<Metadata>('meta', {}, signal);
  if (
    typeof metadata.id !== 'string' ||
    typeof metadata.revision !== 'string' ||
    !Number.isSafeInteger(metadata.rowCount) ||
    metadata.rowCount < 0
  )
    throw new Error('Invalid dataset metadata');
  const { revision } = metadata;
  return {
    ...metadata,
    async fetchRows(start, count, signal) {
      const rows = await read<TraceRow[]>('rows', { revision, start, count }, signal);
      if (
        !Array.isArray(rows) ||
        rows.length !== count ||
        rows.some(
          (row) =>
            !row ||
            typeof row.name !== 'string' ||
            typeof row.thread !== 'string' ||
            typeof row.category !== 'string' ||
            !Number.isFinite(row.time) ||
            !Number.isFinite(row.duration) ||
            row.duration < 0 ||
            !['duration', 'instant'].includes(row.kind),
        )
      )
        throw new Error('Server returned invalid trace rows');
      return rows;
    },
    fetchOverview: (buckets, signal) => read('overview', { revision, buckets }, signal),
    fetchAggregates: (range, signal) => read('aggregates', { revision, ...range }, signal),
    fetchMarkers: (signal) => read('markers', { revision }, signal),
    fetchChapters: (signal) => read('chapters', { revision }, signal),
    search: (query, context) =>
      read(
        'search',
        {
          revision,
          query: JSON.stringify(query),
          fromIndex: Math.floor(context.fromIndex),
          limit: context.limit,
        },
        context.signal,
      ),
  };
}

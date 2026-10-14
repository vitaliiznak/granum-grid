import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin, ViteDevServer } from 'vite';
import { TRACE_API } from '../src/data/http-trace';
import { parseTrace, traceProvider } from '../src/data/trace';
import { NUMBER_OPERATORS } from '../src/data/search';
import { searchIssue } from '../../packages/core/src/data/search';
import type { ProviderQuery } from '../../packages/core/src/data/types';

/** A finite, immutable recording on the server, not a database or a synthetic benchmark. */
export function createTraceService(raw: string) {
  const revision = `trace-v1-${createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
  const provider = traceProvider(parseTrace(raw), revision);
  const integer = (params: URLSearchParams, name: string, min: number, max: number) => {
    const raw = params.get(name);
    const value = raw === null || raw.trim() === '' ? NaN : Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
    return value;
  };
  return async (url: URL, signal: AbortSignal): Promise<{ status: number; body: unknown }> => {
    const operation = url.pathname.slice(TRACE_API.length);
    const p = url.searchParams;
    signal.throwIfAborted();
    if (operation === 'meta')
      return {
        status: 200,
        body: {
          id: provider.id,
          revision,
          rowCount: provider.rowCount,
          metric: provider.metric,
          searchHelp: provider.searchHelp,
        },
      };
    if (p.get('revision') !== revision)
      return { status: 409, body: { error: 'Recording changed. Reload the example.' } };
    try {
      let body: unknown;
      switch (operation) {
        case 'rows': {
          const start = integer(p, 'start', 0, provider.rowCount - 1);
          const count = integer(p, 'count', 1, Math.min(1024, provider.rowCount - start));
          body = await provider.fetchRows(start, count, signal);
          break;
        }
        case 'overview':
          body = await provider.fetchOverview!(integer(p, 'buckets', 1, 512), signal);
          break;
        case 'aggregates': {
          const start = integer(p, 'start', 0, provider.rowCount - 1);
          const end = integer(p, 'end', start + 1, provider.rowCount);
          body = await provider.fetchAggregates!(
            { start, end, buckets: integer(p, 'buckets', 1, 512) },
            signal,
          );
          break;
        }
        case 'markers':
          body = await provider.fetchMarkers!(signal);
          break;
        case 'chapters':
          body = await provider.fetchChapters!(signal);
          break;
        case 'search': {
          const text = p.get('query');
          if (!text || text.length > 1024) throw new Error('Expected a bounded search query');
          const query = JSON.parse(text) as ProviderQuery;
          const validText =
            query?.kind === 'text' &&
            typeof query.value === 'string' &&
            query.value.trim().length > 0 &&
            query.value.length <= 512;
          if (
            !validText &&
            (!query ||
              query.kind !== 'predicate' ||
              typeof query.field !== 'string' ||
              !NUMBER_OPERATORS.includes(query.operator) ||
              !['number', 'string'].includes(typeof query.value) ||
              (typeof query.value === 'number' && !Number.isFinite(query.value)))
          )
            throw new Error('Expected a field, operator, and finite number or text');
          const issue = searchIssue(query, provider.searchHelp);
          if (issue) throw new Error(issue);
          body = await provider.search!(query, {
            fromIndex: integer(p, 'fromIndex', 0, provider.rowCount - 1),
            limit: integer(p, 'limit', 1, 100),
            signal,
          });
          break;
        }
        default:
          return { status: 404, body: { error: 'Unknown trace operation' } };
      }
      return { status: 200, body };
    } catch (error) {
      if (signal.aborted) throw error;
      return {
        status: 400,
        body: { error: error instanceof Error ? error.message : 'Invalid request' },
      };
    }
  };
}

/** Local dev/preview only. Static hosting deliberately has no HTTP backend. */
export function traceApiPlugin(): Plugin {
  const configure = (server: Pick<ViteDevServer, 'middlewares'>) => {
    const request = createTraceService(
      readFileSync(new URL('../src/data/fixtures/exploration-trace.json', import.meta.url), 'utf8'),
    );
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (!url.pathname.startsWith(TRACE_API)) return next();
      // Every response is JSON, so the client can tell a server error from a missing server.
      const send = (status: number, body: unknown) => {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(body));
      };
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        send(405, { error: 'Use GET' });
        return;
      }
      const controller = new AbortController();
      res.on('close', () => controller.abort());
      void request(url, controller.signal)
        .then(({ status, body }) => {
          if (!controller.signal.aborted) send(status, body);
        })
        .catch(() => {
          if (!res.destroyed) send(500, { error: 'The trace service failed. Retry the request.' });
        });
    });
  };
  return {
    name: 'granum-grid-http-trace-example',
    configureServer: configure,
    configurePreviewServer: configure,
  };
}

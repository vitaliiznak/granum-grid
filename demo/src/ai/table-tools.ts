import type {
  AggregateRequest,
  Bucket,
  DataProvider,
  DeepScrollApi,
  ProviderQuery,
} from 'deepscroll';

/** JSON Schema subset used by the tool definitions and their runtime validator. */
export interface TableToolSchema {
  type?: 'object' | 'string' | 'number' | 'integer';
  description?: string;
  properties?: Record<string, TableToolSchema>;
  required?: string[];
  additionalProperties?: false;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  enum?: string[];
  anyOf?: TableToolSchema[];
}
export interface TableToolDefinition {
  name: string;
  description: string;
  inputSchema: TableToolSchema;
  effect: 'read' | 'navigate';
}
export interface TableToolColumn {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description?: string;
}
export interface TableToolsOptions<Row> {
  provider: DataProvider<Row>;
  columns?: readonly TableToolColumn[];
  /** Read the current mounted table through the library's public integration interface. */
  getTable?: () => DeepScrollApi<Row> | null;
  timeoutMs?: number;
}
export type TableToolResult =
  | { ok: true; dataset: { id: string; revision: string; rowCount: number }; data: unknown }
  | { ok: false; error: { code: string; message: string } };

export const tableToolLimits = Object.freeze({
  rows: 100,
  matches: 100,
  buckets: 64,
  resultBytes: 65_536,
  concurrentRequests: 4,
});

class ToolError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function fail(code: string, message: string): never {
  throw new ToolError(code, message);
}
const integer = (minimum: number, maximum: number): TableToolSchema => ({
  type: 'integer',
  minimum,
  maximum,
});
const object = (properties: Record<string, TableToolSchema>): TableToolSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
function valid(schema: TableToolSchema, value: unknown): boolean {
  if (schema.anyOf) return schema.anyOf.some((branch) => valid(branch, value));
  if (schema.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
      Object.keys(record).every((key) => Object.hasOwn(schema.properties!, key)) &&
      schema.required!.every((key) => Object.hasOwn(record, key)) &&
      Object.entries(schema.properties!).every(([key, child]) => valid(child, record[key]))
    );
  }
  if (schema.type === 'string') {
    return (
      typeof value === 'string' &&
      value.length >= (schema.minLength ?? 0) &&
      value.length <= (schema.maxLength ?? Infinity) &&
      (!schema.enum || schema.enum.includes(value))
    );
  }
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (schema.type !== 'integer' || Number.isSafeInteger(value)) &&
    value >= (schema.minimum ?? -Infinity) &&
    value <= (schema.maximum ?? Infinity)
  );
}

function validateBuckets(buckets: Bucket[], range: AggregateRequest) {
  if (!Array.isArray(buckets) || buckets.length > range.buckets)
    fail('INVALID_RESULT', 'Provider returned too many summary buckets.');
  let cursor = range.start;
  for (const bucket of buckets) {
    if (
      !bucket ||
      bucket.start !== cursor ||
      !Number.isSafeInteger(bucket.end) ||
      bucket.end <= cursor ||
      bucket.end > range.end ||
      !['exact', 'estimated', 'unavailable'].includes(bucket.accuracy) ||
      [bucket.count, bucket.avg, bucket.min, bucket.max].some(
        (v) => v !== null && !Number.isFinite(v),
      ) ||
      (bucket.count !== null &&
        (!Number.isSafeInteger(bucket.count) ||
          bucket.count < 0 ||
          bucket.count > bucket.end - bucket.start))
    )
      fail('INVALID_RESULT', 'Provider returned invalid summary coverage or values.');
    cursor = bucket.end;
  }
  if (cursor !== range.end) fail('INVALID_RESULT', 'Provider did not cover the requested range.');
}

/** Demo-owned AI tools. Schemas, model policies and execution do not belong to the library. */
export function createTableTools<Row>({
  provider,
  columns = [],
  getTable,
  timeoutMs = 15_000,
}: TableToolsOptions<Row>) {
  if (!Number.isSafeInteger(provider.rowCount) || provider.rowCount < 0)
    throw new RangeError('rowCount must be a nonnegative safe integer');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647)
    throw new RangeError('timeoutMs must be positive and within the timer range');
  const dataset = { id: provider.id, revision: provider.revision, rowCount: provider.rowCount };
  const last = Math.max(0, dataset.rowCount - 1);
  const definitions: TableToolDefinition[] = [
    {
      name: 'describe_table',
      effect: 'read',
      description:
        'Describe the dataset, columns, supported tools and limits. All indices are zero-based; ranges are [start, end).',
      inputSchema: object({}),
    },
    {
      name: 'read_rows',
      effect: 'read',
      description:
        'Read at most 100 ordered rows. This is a slice, not evidence about the entire dataset.',
      inputSchema: object({ start: integer(0, last), count: integer(1, tableToolLimits.rows) }),
    },
  ];
  if (provider.search)
    definitions.push({
      name: 'search_rows',
      effect: 'read',
      description:
        'Run a provider-supported date or predicate search. Preserve complete=false and message; never present partial results as exhaustive.',
      inputSchema: object({
        query: {
          anyOf: [
            object({
              kind: { type: 'string', enum: ['date'] },
              value: { type: 'string', minLength: 1, maxLength: 64 },
            }),
            object({
              kind: { type: 'string', enum: ['predicate'] },
              field: { type: 'string', minLength: 1, maxLength: 128 },
              operator: { type: 'string', enum: ['>', '>=', '<', '<=', '=', '!='] },
              value: { anyOf: [{ type: 'number' }, { type: 'string', maxLength: 1024 }] },
            }),
          ],
        },
        fromIndex: integer(0, last),
        limit: integer(1, tableToolLimits.matches),
      }),
    });
  if (provider.fetchAggregates)
    definitions.push({
      name: 'summarize_range',
      effect: 'read',
      description:
        'Request up to 64 provider summary buckets for [start, end). Keep each bucket accuracy and null values. Sampled extrema cannot establish global extrema.',
      inputSchema: object({
        start: integer(0, last),
        end: integer(1, dataset.rowCount),
        buckets: integer(1, tableToolLimits.buckets),
      }),
    });
  if (getTable)
    definitions.push({
      name: 'navigate_to_row',
      effect: 'navigate',
      description:
        'Move the visible table to a zero-based row index. Changes view position only and records navigation history.',
      inputSchema: object({ index: integer(0, last) }),
    });
  let pending = 0;
  const assertSnapshot = () => {
    if (
      provider.id !== dataset.id ||
      provider.revision !== dataset.revision ||
      provider.rowCount !== dataset.rowCount
    )
      fail('STALE_DATASET', 'Dataset changed. Recreate the tools for the current provider.');
    if (getTable) {
      const table = getTable();
      if (!table) fail('UNAVAILABLE', 'No table is mounted.');
      if (table.provider !== provider)
        fail('STALE_DATASET', 'Mounted table changed. Recreate the demo tools.');
    }
  };

  async function request<T>(
    run: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (pending >= tableToolLimits.concurrentRequests)
      fail('BUSY', 'Four provider requests are still pending. Wait for them to settle.');
    const controller = new AbortController();
    const cancel = () => controller.abort(new ToolError('CANCELLED', 'Tool call cancelled.'));
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = setTimeout(
      () => controller.abort(new ToolError('TIMEOUT', 'Provider request timed out.')),
      timeoutMs,
    );
    let onAbort: () => void;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
    });
    pending++;
    const work = Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted();
        return run(controller.signal);
      })
      .finally(() => {
        pending--;
      });
    try {
      return await Promise.race([work, aborted]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', onAbort!);
    }
  }

  async function execute(
    name: string,
    args: unknown,
    options: { signal?: AbortSignal } = {},
  ): Promise<TableToolResult> {
    try {
      assertSnapshot();
      if (options.signal?.aborted) fail('CANCELLED', 'Tool call cancelled.');
      const definition = definitions.find((entry) => entry.name === name);
      if (!definition) fail('UNSUPPORTED_TOOL', 'Tool is not supported by this table.');
      if (!valid(definition.inputSchema, args))
        fail('INVALID_ARGUMENTS', 'Arguments must match the tool inputSchema.');
      const input = args as Record<string, unknown>;
      let data: unknown;
      if (name === 'describe_table') {
        data = {
          columns,
          metric: provider.metric ?? null,
          tools: definitions.map((d) => d.name),
          limits: tableToolLimits,
          indexing: 'zero-based; half-open ranges [start, end)',
        };
      } else if (name === 'read_rows') {
        const { start, count } = input as { start: number; count: number };
        if (start + count > dataset.rowCount)
          fail('INVALID_ARGUMENTS', 'Requested rows exceed the dataset.');
        const rows = await request(
          (signal) => provider.fetchRows(start, count, signal),
          options.signal,
        );
        if (!Array.isArray(rows) || rows.length !== count)
          fail('INVALID_RESULT', 'Provider must return exactly the requested rows.');
        data = { start, end: start + count, rows };
      } else if (name === 'search_rows') {
        const { query, fromIndex, limit } = input as {
          query: ProviderQuery;
          fromIndex: number;
          limit: number;
        };
        if (fromIndex >= dataset.rowCount)
          fail('INVALID_ARGUMENTS', 'Search start is outside the dataset.');
        const result = await request(
          (signal) => provider.search!(query, { fromIndex, limit, signal }),
          options.signal,
        );
        if (
          !result ||
          !Array.isArray(result.matches) ||
          result.matches.length > limit ||
          typeof result.complete !== 'boolean' ||
          (result.message !== undefined && typeof result.message !== 'string') ||
          result.matches.some(
            (m) =>
              !m ||
              !Number.isSafeInteger(m.index) ||
              m.index < 0 ||
              m.index >= dataset.rowCount ||
              typeof m.id !== 'string' ||
              typeof m.label !== 'string',
          )
        )
          fail('INVALID_RESULT', 'Provider returned invalid or excessive search results.');
        data = result;
      } else if (name === 'summarize_range') {
        const range = input as unknown as AggregateRequest;
        if (range.end <= range.start) fail('INVALID_ARGUMENTS', 'end must be greater than start.');
        const requestRange = {
          ...range,
          buckets: Math.min(range.buckets, range.end - range.start),
        };
        const buckets = await request(
          (signal) => provider.fetchAggregates!(requestRange, signal),
          options.signal,
        );
        validateBuckets(buckets, requestRange);
        data = { start: range.start, end: range.end, buckets };
      } else {
        const index = input.index as number;
        if (index >= dataset.rowCount)
          fail('INVALID_ARGUMENTS', 'Row index is outside the dataset.');
        const controller = getTable!()?.controller;
        if (!controller || controller.getSnapshot().rowCount !== dataset.rowCount)
          fail('UNAVAILABLE', 'No matching table controller is mounted.');
        controller.scrollToIndex(index, { align: 'start' });
        data = { index, location: controller.getLocation() };
      }
      assertSnapshot();
      if (options.signal?.aborted) fail('CANCELLED', 'Tool call cancelled.');
      const json = JSON.stringify({ ok: true, dataset, data }, (_, value) => {
        if (
          typeof value === 'bigint' ||
          typeof value === 'function' ||
          typeof value === 'symbol' ||
          (typeof value === 'number' && !Number.isFinite(value))
        )
          fail('INVALID_RESULT', 'Tool results must contain JSON-compatible values.');
        return value;
      });
      if (new TextEncoder().encode(json).byteLength > tableToolLimits.resultBytes)
        fail(
          'RESULT_TOO_LARGE',
          'Result exceeds 64 KiB. Request fewer rows, matches or buckets, or project smaller rows in your provider.',
        );
      return JSON.parse(json) as TableToolResult;
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error instanceof ToolError ? error.code : 'PROVIDER_ERROR',
          message: (error instanceof Error ? error.message : 'Provider failed.').slice(0, 500),
        },
      };
    }
  }
  return {
    // Keep externally modified schemas from changing runtime validation.
    definitions: structuredClone(definitions),
    execute,
  };
}

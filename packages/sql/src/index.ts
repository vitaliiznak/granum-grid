import type {
  AggregateRequest,
  Bucket,
  Chapter,
  DataProvider,
  Marker,
  ProviderQuery,
  SearchContext,
  SearchHelp,
  SearchResult,
} from '@granum/core/data';

/** A JSON-safe cell value. Large integers and binary become text, dates ISO strings. */
export type SqlValue = string | number | boolean | null | SqlValue[] | { [key: string]: SqlValue };
export type SqlRow = Record<string, SqlValue>;
/** A positional parameter (`?`) the host binds. */
export type SqlParam = string | number | boolean | null;

/**
 * Runs one statement in DuckDB's dialect with positional `?` parameters and returns its
 * rows as objects. The host connects it to DuckDB-WASM, DuckDB on a server, or MotherDuck;
 * this package depends on no database. Values may be bigint, Date, or binary; providers make
 * them JSON-safe. Interrupt the query when `signal` aborts if the engine can.
 */
export type SqlQuery = (
  sql: string,
  params: readonly SqlParam[],
  signal: AbortSignal,
) => Promise<Record<string, unknown>[]>;

export interface SqlColumn {
  name: string;
  /** The engine's type name, such as `BIGINT` or `TIMESTAMP WITH TIME ZONE`. */
  type: string;
  kind: 'number' | 'text' | 'time' | 'other';
}

export type SqlOperator = '>' | '>=' | '<' | '<=' | '=' | '!=';
export interface SqlFilter {
  column: string;
  operator: SqlOperator;
  value: SqlParam;
}
export interface SqlOrder {
  column: string;
  descending?: boolean;
}

/** What one revision shows: which rows, in which order, and what the map and search use. */
export interface SqlView {
  /** Conditions on columns, joined with AND and sent as parameters. */
  filters?: readonly SqlFilter[];
  /**
   * A trusted SQL condition joined with `filters`, for an engine in the reader's own page.
   * Never forward one person's text to a database another person shares.
   */
  whereSql?: string;
  /** Row order. Without it, rows keep the source's order. */
  orderBy?: readonly SqlOrder[];
  /** Numeric column for the map, with exact overview and range statistics. */
  metric?: string;
  /** Columns that plain-text search reads. Default: every text column. */
  textColumns?: readonly string[];
  /** Date or time column for date search and chapters. */
  timeColumn?: string;
  /**
   * Chapters by calendar period of `timeColumn`, coarsened until at most 4,096 remain.
   * Offered only when each period's rows are contiguous, as when rows are in time order;
   * otherwise there are no chapters rather than overlapping ones.
   */
  chapters?: 'year' | 'month' | 'day' | 'hour';
  /** Mark the rows with the largest `metric` values as spikes. Default 0. */
  peaks?: number;
}

export interface SqlSourceOptions {
  query: SqlQuery;
  /** Stable identity of the data, such as a file name. Every revision of the source shares it. */
  id: string;
  /**
   * The relation to read, as trusted SQL: a quoted table name or a table function such as
   * `read_parquet('readings.parquet')`.
   */
  from: string;
  /** Revision tables kept at once; opening another drops the oldest. Default 3. */
  keepRevisions?: number;
  /**
   * Build revisions as temporary tables, which only the connection that made them can see.
   * Use it when every `query` runs on one connection; a pool, such as DuckDB-WASM with a
   * connection per request, needs the default ordinary tables named `granum_…`.
   */
  temporary?: boolean;
}

export interface SqlProvider extends DataProvider<SqlRow> {
  readonly view: SqlView;
  readonly columns: readonly SqlColumn[];
  /** Milliseconds spent building this revision's table and counting it. */
  readonly buildMs: number;
}

export interface SqlSource {
  readonly id: string;
  /** The source's columns and their kinds. */
  columns(signal: AbortSignal): Promise<SqlColumn[]>;
  /**
   * Build the revision for `view` (filtered and ordered rows in a table of their own) and
   * return its provider. The same view returns the same revision while its table is kept.
   */
  open(view: SqlView, signal: AbortSignal): Promise<SqlProvider>;
  /** Drop every revision table this source built. Its providers stop working. */
  dispose(): Promise<void>;
}

const OPERATORS: readonly SqlOperator[] = ['>', '>=', '<', '<=', '=', '!='];
const UNITS = ['hour', 'day', 'month', 'year'] as const;
const MAX_CHAPTERS = 4096;
const MAX_PEAKS = 64;
const LABEL_CHARS = 80;

/** A double-quoted SQL identifier. */
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function columnKind(type: string): SqlColumn['kind'] {
  const t = type.toUpperCase();
  if (
    /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|REAL|DOUBLE|DECIMAL)/.test(
      t,
    )
  )
    return 'number';
  if (/^(DATE|TIMESTAMP|TIMESTAMPTZ)/.test(t)) return 'time';
  if (/^(VARCHAR|TEXT|STRING|CHAR|ENUM|UUID)/.test(t)) return 'text';
  return 'other';
}

/** A JSON-safe copy of an engine value. */
export function plainValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint')
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Uint8Array || value instanceof ArrayBuffer)
    return `${value.byteLength} bytes`;
  if (Array.isArray(value)) return value.map(plainValue);
  if (value instanceof Map)
    return Object.fromEntries([...value].map(([key, item]) => [String(key), plainValue(item)]));
  if (typeof value === 'object') {
    const json = (value as { toJSON?: () => unknown }).toJSON;
    if (typeof json === 'function') return plainValue(json.call(value));
    return Object.fromEntries(
      Object.entries(value as object).map(([key, item]) => [key, plainValue(item)]),
    );
  }
  return String(value);
}

const plainRow = (row: Record<string, unknown>): SqlRow =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [key, plainValue(value)]));

const number = (value: unknown): number | null => {
  const n = typeof value === 'bigint' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** An integer that may be written into SQL text; anything else is a programming error. */
function int(value: number): string {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Not a safe integer: ${value}`);
  return String(value);
}

/** FNV-1a, for short revision names that change whenever the view does. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** The `[start, end)` instants of `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, or null. */
function datePeriod(text: string): { start: string; end: string } | null {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(text.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y),
    month = m ? Number(m) - 1 : 0,
    day = d ? Number(d) : 1;
  const start = new Date(Date.UTC(year, month, day));
  if (start.getUTCMonth() !== month || start.getUTCDate() !== day) return null;
  const end = d
    ? new Date(Date.UTC(year, month, day + 1))
    : m
      ? new Date(Date.UTC(year, month + 1, 1))
      : new Date(Date.UTC(year + 1, 0, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/** `%text%` for ILIKE, with `\`, `%`, and `_` matched literally. */
const containing = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * A source of rows in DuckDB's dialect. Each view becomes a revision: its rows are copied,
 * filtered and ordered, into a temporary table whose insertion order is the row address, so
 * `fetchRows` is a range scan on `rowid` and the overview is exact.
 */
export function createSqlSource({
  query,
  id,
  from,
  keepRevisions = 3,
  temporary = false,
}: SqlSourceOptions): SqlSource {
  if (!Number.isSafeInteger(keepRevisions) || keepRevisions < 1)
    throw new RangeError('keepRevisions must be a positive integer');
  let described: Promise<SqlColumn[]> | null = null;
  const columns = (signal: AbortSignal) =>
    (described ??= query(`DESCRIBE SELECT * FROM ${from}`, [], signal).then(
      (rows) =>
        rows.map((row) => {
          const type = String(row.column_type);
          return { name: String(row.column_name), type, kind: columnKind(type) };
        }),
      (error) => {
        described = null;
        throw error;
      },
    ));
  /** Revision tables by name, oldest first. */
  const revisions = new Map<string, Promise<{ rowCount: number; buildMs: number }>>();
  let disposed = false;

  async function build(table: string, select: string, params: SqlParam[], signal: AbortSignal) {
    const started = performance.now();
    await query(
      `CREATE OR REPLACE ${temporary ? 'TEMP ' : ''}TABLE ${table} AS ${select}`,
      params,
      signal,
    );
    const [{ n }] = await query(`SELECT count(*) AS n FROM ${table}`, [], signal);
    const rowCount = number(n);
    if (rowCount === null || !Number.isSafeInteger(rowCount))
      throw new Error('The revision has more rows than a page can address.');
    return { rowCount, buildMs: performance.now() - started };
  }

  async function open(view: SqlView, signal: AbortSignal): Promise<SqlProvider> {
    if (disposed) throw new Error('This SQL source was disposed.');
    const known = await columns(signal);
    const byName = new Map(known.map((column) => [column.name, column]));
    const need = (name: string, kind?: SqlColumn['kind'], role = 'column') => {
      const column = byName.get(name);
      if (!column) throw new Error(`Unknown ${role} "${name}".`);
      if (kind && column.kind !== kind)
        throw new Error(`The ${role} "${name}" is ${column.type}, not a ${kind} column.`);
      return quoteIdentifier(name);
    };
    const conditions: string[] = [];
    const params: SqlParam[] = [];
    for (const filter of view.filters ?? []) {
      if (!OPERATORS.includes(filter.operator))
        throw new Error(`Unknown operator "${filter.operator}".`);
      conditions.push(`${need(filter.column, undefined, 'filter column')} ${filter.operator} ?`);
      params.push(filter.value);
    }
    if (view.whereSql?.trim()) conditions.push(`(${view.whereSql})`);
    const order = (view.orderBy ?? []).map(
      (item) => `${need(item.column, undefined, 'sort column')}${item.descending ? ' DESC' : ''}`,
    );
    const metric = view.metric ? need(view.metric, 'number', 'map column') : null;
    const time = view.timeColumn ? need(view.timeColumn, 'time', 'time column') : null;
    const textColumns = (
      view.textColumns ?? known.filter((column) => column.kind === 'text').map((c) => c.name)
    ).map((name) => need(name, undefined, 'text column'));
    const peaks = Math.min(MAX_PEAKS, Math.max(0, Math.floor(view.peaks ?? 0)));
    if (view.chapters && !time) throw new Error('Chapters need a timeColumn.');

    const select =
      `SELECT * FROM ${from}` +
      (conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '') +
      (order.length ? ` ORDER BY ${order.join(', ')}` : '');
    const revision = hash(
      JSON.stringify([from, view.filters ?? [], view.whereSql ?? '', view.orderBy ?? []]),
    );
    const table = quoteIdentifier(`granum_${hash(id)}_${revision}`);
    let built = revisions.get(table);
    if (!built) {
      built = build(table, select, params, signal);
      revisions.set(table, built);
      built.catch(() => revisions.delete(table));
      while (revisions.size > keepRevisions) {
        const [oldest] = revisions.keys();
        revisions.delete(oldest);
        query(`DROP TABLE IF EXISTS ${oldest}`, [], new AbortController().signal).catch(() => {});
      }
    } else {
      // A kept revision is reused: refresh its age.
      revisions.delete(table);
      revisions.set(table, built);
    }
    const { rowCount, buildMs } = await built;
    signal.throwIfAborted();
    return createProvider({
      query,
      id: `sql:${id}`,
      revision,
      table,
      rowCount,
      buildMs,
      view,
      columns: known,
      metric,
      time,
      textColumns,
      peaks,
    });
  }

  return {
    id,
    columns,
    open,
    async dispose() {
      disposed = true;
      const tables = [...revisions.keys()];
      revisions.clear();
      await Promise.all(
        tables.map((table) =>
          query(`DROP TABLE IF EXISTS ${table}`, [], new AbortController().signal),
        ),
      );
    },
  };
}

interface ProviderParts {
  query: SqlQuery;
  id: string;
  revision: string;
  table: string;
  rowCount: number;
  buildMs: number;
  view: SqlView;
  columns: SqlColumn[];
  metric: string | null;
  time: string | null;
  textColumns: string[];
  peaks: number;
}

/**
 * The row select list. Engines disagree on how they hand over times, decimals, and nested
 * values (DuckDB-WASM's Arrow results turn timestamps into numbers), so the database
 * converts them: times to its text form, decimals to doubles, binary to a byte count, and
 * other non-scalar values to their text form.
 */
function rowSelect(columns: readonly SqlColumn[]) {
  const replaced = columns.flatMap((column) => {
    const name = quoteIdentifier(column.name);
    const type = column.type.toUpperCase();
    if (column.kind === 'time') return [`CAST(${name} AS VARCHAR) AS ${name}`];
    if (type.startsWith('DECIMAL')) return [`CAST(${name} AS DOUBLE) AS ${name}`];
    if (/^(BLOB|BYTEA|BINARY|VARBINARY|BIT)/.test(type))
      return [`octet_length(${name}) || ' bytes' AS ${name}`];
    if (column.kind === 'other' && !/^(BOOLEAN|BOOL)$/.test(type))
      return [`CAST(${name} AS VARCHAR) AS ${name}`];
    return [];
  });
  return replaced.length ? `* REPLACE (${replaced.join(', ')})` : '*';
}

function createProvider(parts: ProviderParts): SqlProvider {
  const { query, table, rowCount, view, columns, metric, time, textColumns } = parts;
  const label = textColumns[0] ?? time;
  const labelSql = label ? `left(CAST(${label} AS VARCHAR), ${LABEL_CHARS})` : 'NULL';
  const select = rowSelect(columns);
  // Doubles, so every engine hands statistics back as plain numbers (Arrow keeps decimals).
  const value = metric ? `CAST(${metric} AS DOUBLE)` : 'NULL';

  /** Exact statistics of `metric` over `[start, end)` in at most `buckets` equal groups. */
  async function aggregate({ start, end, buckets }: AggregateRequest, signal: AbortSignal) {
    const length = end - start;
    if (!metric || length <= 0) return [];
    const groups = Math.max(1, Math.min(buckets, length));
    const rows = await query(
      `SELECT ((rowid - ${int(start)}) * ${int(groups)}) // ${int(length)} AS bucket,
        count(${value}) AS count, avg(${value}) AS avg, min(${value}) AS min, max(${value}) AS max
      FROM ${table} WHERE rowid >= ${int(start)} AND rowid < ${int(end)}
      GROUP BY bucket ORDER BY bucket`,
      [],
      signal,
    );
    const found = new Map(rows.map((row) => [number(row.bucket), row]));
    return Array.from({ length: groups }, (_, i): Bucket => {
      const row = found.get(i);
      return {
        start: start + Math.ceil((i * length) / groups),
        end: start + Math.ceil(((i + 1) * length) / groups),
        count: row ? number(row.count) : 0,
        avg: row ? number(row.avg) : null,
        min: row ? number(row.min) : null,
        max: row ? number(row.max) : null,
        accuracy: 'exact',
      };
    });
  }

  /** Rows matching `condition`, searched from `fromIndex` to the end and then from the start. */
  async function find(
    condition: string,
    params: SqlParam[],
    { fromIndex, limit, signal }: SearchContext,
    kind: Marker['kind'],
  ): Promise<SearchResult> {
    const from = int(Math.max(0, Math.min(Math.floor(fromIndex), rowCount)));
    const rows = await query(
      `SELECT rowid AS address, ${labelSql} AS label FROM ${table} WHERE ${condition}
      ORDER BY rowid < ${from}, rowid LIMIT ${int(limit + 1)}`,
      params,
      signal,
    );
    const matches = rows.slice(0, limit).map((row): Marker => {
      const index = number(row.address)!;
      return {
        id: `${kind}:${index}`,
        index,
        label: row.label == null ? `Row ${(index + 1).toLocaleString('en-US')}` : String(row.label),
        kind,
      };
    });
    const complete = rows.length <= limit;
    return {
      matches,
      complete,
      message: complete ? undefined : `Showing the first ${limit} matches from the current row.`,
    };
  }

  const fields: NonNullable<SearchHelp['fields']> = columns
    .filter((column) => column.kind === 'number' || column.kind === 'text')
    .map((column) => ({
      name: column.name,
      type: column.kind === 'number' ? ('number' as const) : ('text' as const),
      operators: column.kind === 'number' ? OPERATORS : (['=', '!='] as const),
    }));
  const exampleNumber = fields.find((field) => field.type === 'number');
  const exampleText = fields.find((field) => field.type === 'text');

  return {
    id: parts.id,
    revision: parts.revision,
    rowCount,
    view,
    columns,
    buildMs: parts.buildMs,
    metric: metric
      ? {
          label: view.metric!,
          kind: 'value',
          description: `Exact ${view.metric} statistics of every row, computed by the database.`,
        }
      : undefined,
    searchHelp: {
      examples: [
        ...(exampleNumber ? [`${exampleNumber.name} > 0`] : []),
        ...(exampleText ? [`${exampleText.name} = "…"`] : []),
        ...(time ? ['2024-01'] : []),
      ],
      text: textColumns.length > 0,
      dates: !!time,
      fields,
    },
    async fetchRows(start, count, signal) {
      if (!count) return [];
      if (start < 0 || count < 0 || start + count > rowCount)
        throw new RangeError(`Requested rows ${start}+${count} are outside ${rowCount} rows`);
      const rows = await query(
        `SELECT ${select} FROM ${table} WHERE rowid >= ${int(start)} AND rowid < ${int(start + count)} ORDER BY rowid`,
        [],
        signal,
      );
      if (rows.length !== count)
        throw new Error(`Expected ${count} rows from the database, read ${rows.length}.`);
      return rows.map(plainRow);
    },
    fetchOverview: metric
      ? (buckets, signal) => aggregate({ start: 0, end: rowCount, buckets }, signal)
      : undefined,
    fetchAggregates: metric ? aggregate : undefined,
    fetchMarkers:
      metric && parts.peaks
        ? async (signal) => {
            const rows = await query(
              `SELECT rowid AS address, ${value} AS value FROM ${table}
              WHERE ${value} IS NOT NULL ORDER BY ${value} DESC, rowid LIMIT ${int(parts.peaks)}`,
              [],
              signal,
            );
            return rows
              .map((row): Marker => {
                const index = number(row.address)!;
                return {
                  id: `peak:${index}`,
                  index,
                  label: `${view.metric} ${plainValue(row.value)}`,
                  kind: 'spike',
                };
              })
              .sort((a, b) => a.index - b.index);
          }
        : undefined,
    fetchChapters:
      time && view.chapters
        ? async (signal) => {
            for (const unit of UNITS.slice(UNITS.indexOf(view.chapters!))) {
              const rows = await query(
                `SELECT CAST(date_trunc('${unit}', ${time}) AS VARCHAR) AS period,
                  min(rowid) AS start, max(rowid) + 1 AS stop, count(*) AS rows
                FROM ${table} WHERE ${time} IS NOT NULL GROUP BY period ORDER BY start`,
                [],
                signal,
              );
              if (rows.length > MAX_CHAPTERS) continue;
              const chapters = rows.map((row): Chapter => ({
                id: `${unit}:${row.period}`,
                start: number(row.start)!,
                end: number(row.stop)!,
                label: periodLabel(String(row.period), unit),
              }));
              // A period whose rows are interleaved with another's has no single range.
              const contiguous = chapters.every(
                (chapter, i) =>
                  chapter.end - chapter.start === number(rows[i].rows) &&
                  (i === 0 || chapter.start >= chapters[i - 1].end),
              );
              return contiguous ? chapters : [];
            }
            return [];
          }
        : undefined,
    async search(request: ProviderQuery, context: SearchContext) {
      if (request.kind === 'text') {
        if (!textColumns.length || !request.value.trim())
          return { matches: [], complete: true, message: 'No text columns to search.' };
        const pattern = containing(request.value.trim());
        return find(
          `(${textColumns.map((c) => `CAST(${c} AS VARCHAR) ILIKE ? ESCAPE '\\'`).join(' OR ')})`,
          textColumns.map(() => pattern),
          context,
          'search',
        );
      }
      if (request.kind === 'date') {
        const period = datePeriod(request.value);
        if (!time || !period)
          return {
            matches: [],
            complete: true,
            message: 'Use a date such as 2024, 2024-03, or 2024-03-14.',
          };
        return find(
          `${time} >= CAST(? AS TIMESTAMP) AND ${time} < CAST(? AS TIMESTAMP)`,
          [period.start, period.end],
          context,
          'event',
        );
      }
      const field = fields.find((item) => item.name === request.field);
      if (!field || !field.operators.includes(request.operator))
        return {
          matches: [],
          complete: true,
          message: `Searchable fields: ${fields.map((f) => f.name).join(', ')}.`,
        };
      const column = quoteIdentifier(field.name);
      if (field.type === 'number') {
        if (typeof request.value !== 'number')
          return { matches: [], complete: true, message: `${field.name} needs a number.` };
        return find(`${column} ${request.operator} ?`, [request.value], context, 'search');
      }
      return find(
        `lower(CAST(${column} AS VARCHAR)) ${request.operator} lower(?)`,
        [String(request.value)],
        context,
        'search',
      );
    },
  };
}

function periodLabel(period: string, unit: (typeof UNITS)[number]) {
  const date = period.slice(0, 10);
  if (unit === 'year') return date.slice(0, 4);
  if (unit === 'month') return date.slice(0, 7);
  if (unit === 'day') return date;
  return period.slice(0, 13).replace('T', ' ') + ':00';
}

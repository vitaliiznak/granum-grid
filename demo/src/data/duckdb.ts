import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { SqlQuery } from '@granum/sql';

/**
 * One DuckDB-WASM database for the page, loaded the first time a visitor opens a file. The
 * engine is about 8 MB gzipped, so nothing loads before that. Only the `eh` build ships:
 * every browser the library supports has WebAssembly exceptions.
 */
export interface Database {
  query: SqlQuery;
  /** Make a local file readable by `name` in SQL. DuckDB reads it in place, in slices. */
  addFile(name: string, file: File): Promise<void>;
  removeFile(name: string): Promise<void>;
  /** DuckDB's version, such as `v1.4.3`. */
  version: string;
}

/** Idle connections kept for reuse; each query runs on its own so a cancel reaches only it. */
const IDLE_CONNECTIONS = 4;

let loading: Promise<Database> | null = null;
export const loadDatabase = () =>
  (loading ??= start().catch((error) => {
    loading = null;
    throw error;
  }));

async function start(): Promise<Database> {
  const [duckdb, wasm, worker] = await Promise.all([
    import('@duckdb/duckdb-wasm'),
    import('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url').then((module) => module.default),
    import('@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url').then(
      (module) => module.default,
    ),
  ]);
  const db: AsyncDuckDB = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(worker));
  await db.instantiate(wasm);
  const idle: AsyncDuckDBConnection[] = [];

  const query: SqlQuery = async (sql, params, signal) => {
    signal.throwIfAborted();
    const connection = idle.pop() ?? (await db.connect());
    const cancel = () => void connection.cancelSent();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const statement = await connection.prepare(sql);
      try {
        const table = await statement.query(...params);
        signal.throwIfAborted();
        return table.toArray().map((row) => row.toJSON() as Record<string, unknown>);
      } finally {
        await statement.close();
      }
    } finally {
      signal.removeEventListener('abort', cancel);
      if (idle.length < IDLE_CONNECTIONS) idle.push(connection);
      else void connection.close();
    }
  };

  return {
    query,
    version: await db.getVersion(),
    addFile: (name, file) =>
      db.registerFileHandle(name, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true),
    removeFile: async (name) => {
      await db.dropFile(name);
    },
  };
}

/** A SQL string literal. */
export const literal = (text: string) => `'${text.replace(/'/g, "''")}'`;

/** The table function that reads a file by its extension, or null for an unknown kind. */
export function readerFor(name: string): string | null {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (extension === 'parquet') return `read_parquet(${literal(name)})`;
  if (extension === 'csv' || extension === 'tsv' || extension === 'txt')
    return `read_csv(${literal(name)})`;
  if (extension === 'json' || extension === 'jsonl' || extension === 'ndjson')
    return `read_json(${literal(name)})`;
  return null;
}

import { createSqlSource, type SqlQuery } from '@granum-grid/sql';

/** Any table DuckDB can read becomes rows, an exact map, and complete search. */
export async function openRequests(query: SqlQuery, signal: AbortSignal) {
  const source = createSqlSource({
    query, // runs one statement in DuckDB-WASM, on a server, or in MotherDuck
    id: 'requests.parquet',
    from: "read_parquet('requests.parquet')",
  });
  // Each filter or sort is a new revision with its own row addresses.
  return source.open(
    {
      whereSql: 'status >= 500',
      orderBy: [{ column: 'time' }],
      metric: 'latency_ms',
      timeColumn: 'time',
      chapters: 'day',
    },
    signal,
  );
}

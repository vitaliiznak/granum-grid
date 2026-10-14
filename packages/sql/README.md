# @granum/sql

Rows, an exact map, and complete search from SQL, as a
[Granum Grid](https://github.com/vitaliiznak/granum-grid) data provider. You pass one
function that runs a query in DuckDB's dialect; this package builds every statement and
depends on no database. Connect it to DuckDB-WASM for files the reader opens in the page,
to DuckDB on your server, or to MotherDuck.

Each **view** (filters and a sort order) becomes a **revision**: the matching rows are
copied, in order, into a table of its own whose insertion order is the row address. Rows
are then a range scan on `rowid`, the map's statistics are exact, and search checks every
row. Sorting and filtering never happen in the browser's memory; they are a new revision,
which is how Granum Grid expects ordering to work
([server-owned ordering](https://github.com/vitaliiznak/granum-grid/blob/main/docs/GUIDE.md#server-owned-ordering)).

## Install

Not yet on npm. `granum-grid` is a peer dependency; bring your own DuckDB.

## Use

```tsx
import { GranumGrid } from 'granum-grid';
import { createSqlSource, type SqlQuery, type SqlRow } from '@granum/sql';

// DuckDB-WASM: `connection` is an AsyncDuckDBConnection. A sent query can be canceled.
const query: SqlQuery = async (sql, params, signal) => {
  const statement = await connection.prepare(sql);
  const stop = () => void connection.cancelSent();
  signal.addEventListener('abort', stop, { once: true });
  try {
    const rows = [];
    for await (const batch of await statement.send(...params))
      rows.push(...batch.toArray().map((row) => row.toJSON()));
    return rows;
  } finally {
    signal.removeEventListener('abort', stop);
    await statement.close();
  }
};

const source = createSqlSource({
  query,
  id: 'requests.parquet',
  from: "read_parquet('requests.parquet')",
});
const provider = await source.open(
  {
    filters: [{ column: 'status', operator: '>=', value: 500 }],
    orderBy: [{ column: 'time' }],
    metric: 'latency_ms', // the map: exact count, mean, min, and max per group
    timeColumn: 'time', // date search, and chapters when rows are in time order
    chapters: 'day',
    peaks: 8, // the eight slowest requests become spike markers
  },
  signal,
);

<GranumGrid
  provider={provider}
  ariaLabel="Requests"
  renderRow={({ row }: { row: SqlRow }) => <span role="gridcell">{String(row.path)}</span>}
/>;
```

`source.columns(signal)` lists the columns and their kinds (`number`, `text`, `time`,
`other`) so a host can offer filters and sorts. Opening the same view again returns the
same revision without copying rows. The source keeps three revision tables by default
(`keepRevisions`) and drops the oldest when another opens; a provider whose table was
dropped fails its next request. `source.dispose()` drops them all. Revision tables are
ordinary tables named `granum_…`, so a pool of connections sees them; pass
`temporary: true` when every query runs on one connection.

## What each capability costs

| Capability     | Statement                                                       | Cost                                            |
| -------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| `open(view)`   | `CREATE TABLE … AS SELECT * FROM from WHERE … ORDER BY …`       | Reads and sorts the source once                 |
| `fetchRows`    | `WHERE rowid >= start AND rowid < end`                          | A range scan                                    |
| Map, magnifier | `GROUP BY` bucket of `rowid`, with `count`, `avg`, `min`, `max` | Scans the requested range, labeled exact        |
| Search         | `ILIKE` on text columns, a predicate, or a date period; `LIMIT` | Scans until enough matches                      |
| Chapters       | `date_trunc` periods of `timeColumn`                            | One scan; none unless each period is contiguous |
| Peaks          | `ORDER BY metric DESC LIMIT n`                                  | One scan                                        |

Search starts at the current row, continues to the end, then wraps to the start. When it
finds more than the requested limit it says so (`complete: false`); otherwise the result
is every match in the revision. Text search matches a substring case-insensitively, with
`%` and `_` taken literally; text predicates compare case-insensitively.

Values become JSON-safe: integers beyond 2^53 and binary become text, dates ISO strings.

## Measured in DuckDB-WASM

Measured on 2026-10-14 on one Apple M2 Max in headless Chromium, Firefox, and WebKit with
DuckDB-WASM 1.32.0 (DuckDB v1.4.3), on a five-column table. Numbers will differ elsewhere.

| Rows | Build a sorted revision | `fetchRows` at the last page | 320-group map | Rare text search |
| ---- | ----------------------- | ---------------------------- | ------------- | ---------------- |
| 10M  | 1.9–2.9 s               | 3–5 ms                       | 0.2–0.3 s     | 0.3–0.5 s        |
| 30M  | runs out of memory      | 6.5–11 ms                    | 0.6–1.0 s     | 0.8–1.3 s        |

- The ceiling is memory, not speed. WebAssembly memory stops at 4 GB, DuckDB's default
  limit is 3.1 GB, an in-memory database cannot spill to disk, and each revision is a
  copy (about 60 bytes per row here). Plan for files of roughly ten million rows.
- Write row addresses into SQL as integers, as this package does. A JavaScript number
  bound to a prepared statement becomes a DOUBLE, and a `rowid >= ?` range then scans
  every row group instead of skipping to one (27–46 ms instead of under 1 ms at 10M).
- Run queries with `statement.send()`, not `query()`. Only a sent query can be canceled
  (`connection.cancelSent()`), and a long search run with `query()` holds up every row
  request behind it. With `db.open({ query: { queryPollingInterval: 10 } })` a cancel
  lands within about 20 ms.
- `ORDER BY … LIMIT … OFFSET` is not an alternative: at the middle of 10M rows it took
  2–3 s, and at the end it ran out of memory.

## Trust and safety

- `from` and `whereSql` are SQL you write and trust. Everything a reader types into
  filters and search is sent as parameters, and column names are checked against the
  source and quoted.
- `whereSql` exists for an engine inside the reader's own page, where they could run any
  SQL anyway. Never forward one person's text to a database another person shares; with a
  server, expose a narrow endpoint rather than `query` itself.
- The package ships DuckDB's dialect only. Another engine needs `rowid` addressing (a
  materialized order column with an index); PostgreSQL's `OFFSET` is linear and does not
  qualify.

## License

Apache-2.0

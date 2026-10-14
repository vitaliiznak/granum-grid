# @granum/sql

Rows, an exact map, and complete search from SQL, as a
[Granum Grid](https://github.com/vitaliiznak/granum-grid) data provider. You pass one
function that runs a query in DuckDB's dialect; this package builds every statement and
depends on no database. Connect it to DuckDB-WASM for files the reader opens in the page,
to DuckDB on your server, or to MotherDuck.

Each **view** (filters and a sort order) becomes a **revision**: the matching rows are
copied, in order, into a temporary table whose insertion order is the row address. Rows
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

// DuckDB-WASM: `connection` is an AsyncDuckDBConnection.
const query: SqlQuery = async (sql, params, signal) => {
  const statement = await connection.prepare(sql);
  const stop = () => void connection.cancelSent();
  signal.addEventListener('abort', stop, { once: true });
  try {
    return (await statement.query(...params)).toArray().map((row) => row.toJSON());
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
dropped fails its next request. `source.dispose()` drops them all.

## What each capability costs

| Capability     | Statement                                                       | Cost                                            |
| -------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| `open(view)`   | `CREATE TEMP TABLE … AS SELECT * FROM from WHERE … ORDER BY …`  | Reads and sorts the source once                 |
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

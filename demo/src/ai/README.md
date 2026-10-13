# AI-callable tools example

This folder belongs to the demo application. It is not exported or shipped by the `granum-grid` package. The library provides the `GranumGridApi<Row>` interface, accessible through `apiRef` on the mounted component or `api` on the headless hook.

Open **Try AI-callable tools** below the main table to run structured calls and inspect results and tool definitions. This is a manual tool demonstration; no model is connected.

```ts
import { createTableTools } from './table-tools';

const tools = createTableTools({
  provider,
  getTable: () => apiRef.current, // GranumGridApi<Row> | null
  columns: [{ name: 'value', type: 'number' }],
});
const result = await tools.execute('read_rows', { start: 73_499_999, count: 5 });
```

An application can register `tools.definitions` (`name`, `description`, JSON Schema `inputSchema`, and `effect`) with its chosen agent framework and forward parsed calls to `execute(name, args, { signal })`. The app supplies the model connection and total call/query budgets. Results use `{ ok: true, dataset, data }` or `{ ok: false, error: { code, message } }`.

| Tool              | Arguments                     | Behavior                                                                                    |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| `describe_table`  | `{}`                          | Dataset identity/count, supplied columns, metric, available tools and limits; no data fetch |
| `read_rows`       | `start`, `count`              | At most 100 ordered rows from `fetchRows`                                                   |
| `search_rows`     | `query`, `fromIndex`, `limit` | Requires provider `search`; at most 100 matches, preserving `complete` and `message`        |
| `summarize_range` | `start`, `end`, `buckets`     | Requires `fetchAggregates`; at most 64 buckets, preserving accuracy and null values         |
| `navigate_to_row` | `index`                       | Requires `getTable`; moves the mounted table and records Back history                       |

All addresses are zero-based and ranges are half-open `[start, end)`. Search uses the existing provider date/predicate query contract. Summaries delegate to the provider without materializing every row. Sampled extrema cannot establish global extrema. Column metadata describes fields; it does not filter or redact row values.

The demo owns input validation, a 64 KiB successful response limit, four outstanding requests per adapter instance, cancellation, and a default 15-second timeout (`timeoutMs`). Oversized results fail explicitly. Timed-out provider transports retain their slots until they settle; providers must honor `AbortSignal`. Backend query work and total agent call count require separate host budgets.

Recreate the adapter for a new provider, revision, or row count. `getTable` must return the mounted table for that exact provider. The example rejects stale handles, including late results after a dataset switch. The panel aborts requests on unmount and dataset changes. Navigation executes on the client; a server-side agent needs an application-owned route to the mounted client. Data-only integrations can omit `getTable`.

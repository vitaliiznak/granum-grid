# 3. Search application logs

[All lessons](Home.md) · [Previous: Sensors](Sensors.md) · [Next: HTTP](HTTP-recording.md)

**Build:** a log explorer that can search text and supported fields, navigate to
matches, and clearly explain truncated results.
**Run:** `/tutorials.html?lesson=logs` on your local demo server.

## 1. Define searchable records

The fixture contains 600 generated entries cycling through `auth`, `api`, and
`worker`. Every thirtieth entry has status 503 and the message `Upstream unavailable`.
The remaining entries have status 200. There are exactly 20 errors and 200 auth rows.
These associations are chosen for teaching, not evidence of real service behavior.

## 2. Add the search contract

Create `src/logs.ts`. `searchHelp` tells the dialog which examples and operators to
show. The provider separately validates every query, because callers can invoke it
directly without the dialog.

<!-- source: demo/src/tutorials/logs.ts -->
```ts
import {
  createArrayProvider,
  type DataProvider,
  type Marker,
  type ProviderQuery,
} from 'granum-grid';

export type Log = { service: string; status: number; message: string };
const rows: Log[] = Array.from({ length: 600 }, (_, index) => ({
  service: ['auth', 'api', 'worker'][index % 3],
  status: index % 30 === 0 ? 503 : 200,
  message: index % 30 === 0 ? 'Upstream unavailable' : 'Request completed',
}));

function matches(query: ProviderQuery): (row: Log) => boolean {
  if (query.kind === 'text' && query.value.trim()) {
    const text = query.value.trim().toLowerCase();
    return (row) => `${row.service} ${row.status} ${row.message}`.toLowerCase().includes(text);
  }
  if (query.kind === 'predicate') {
    const value = query.value;
    if (
      query.field === 'status' &&
      query.operator === '>=' &&
      typeof value === 'number' &&
      Number.isFinite(value)
    )
      return (row) => row.status >= value;
    if (query.field === 'service' && query.operator === '=' && typeof value === 'string')
      return (row) => row.service.toLowerCase() === value.toLowerCase();
  }
  throw new Error('Use text, status >= number, or service = "name". Dates are not supported.');
}

export const logs: DataProvider<Log> = {
  ...createArrayProvider(rows, { id: 'tutorial-logs', revision: '1' }),
  searchHelp: {
    examples: ['status >= 500', 'service = "auth"', 'unavailable'],
    text: true,
    dates: false,
    fields: [
      { name: 'status', type: 'number', operators: ['>='] },
      { name: 'service', type: 'text', operators: ['='] },
    ],
  },
  async search(query, { limit, signal }) {
    signal.throwIfAborted();
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new RangeError('Expected a result limit from 1 to 100');
    const match = matches(query);
    const found: Marker[] = [];
    // A bounded 600-row fixture, searched in row order. Remote datasets need a server query.
    for (let index = 0; index < rows.length; index++) {
      if (!match(rows[index])) continue;
      if (found.length === limit)
        return {
          matches: found,
          complete: false,
          message: 'More matches exist; narrow the query.',
        };
      found.push({
        id: `log-${index}`,
        index,
        label: `${rows[index].service} · ${rows[index].status} · ${rows[index].message}`,
        kind: 'search',
      });
    }
    return { matches: found, complete: true };
  },
};
```

A match includes the original zero-based row index. The UI uses it to navigate;
returning the index within a filtered result list would jump to the wrong record.
This provider searches in row order and deliberately does not rank by `fromIndex`.

The loop includes a crucial distinction: filling the result limit does not by
itself prove there are more matches. It reports `complete: false` only after finding
another matching row. If the search finishes with exactly the limit, it can still
report complete. The built-in dialog requests at most 100 results and does not
paginate them; the user can narrow the query or the app can supply custom controls.

This scan is limited to the 600-record fixture. A large dataset needs a server query
or an index; do not put a full billion-row scan in `search`.

## 3. Open search from your application

Replace `src/App.tsx` with this component:

<!-- source: demo/src/tutorials/LogsLesson.tsx -->
```tsx
import { useRef } from 'react';
import { GranumGrid, type GranumGridApi } from 'granum-grid';
import { logs, type Log } from './logs';
import 'granum-grid/styles.css';

export default function Logs() {
  const api = useRef<GranumGridApi<Log>>(null);
  return (
    <section aria-label="Log search lesson">
      <p>600 generated log entries. Find the 20 errors, then search for auth.</p>
      <button
        onClick={(event) => {
          event.currentTarget.focus();
          api.current?.openSearch('status >= 500');
        }}
      >
        Find errors
      </button>
      <GranumGrid
        provider={logs}
        apiRef={api}
        ariaLabel="Application logs"
        rowHeight={48}
        style={{ height: 560, marginTop: 16 }}
        hints={false}
        tools={false}
        rail={false}
        renderRow={({ row, rowNumber }) => (
          <span role="gridcell">
            {rowNumber}. {row.service} · {row.status} · {row.message}
          </span>
        )}
      />
    </section>
  );
}
```

`openSearch` fills the dialog but does not navigate. Selecting a result performs
the jump. Focus the custom button before opening so Escape restores focus even in
browsers that do not focus a button when it is clicked.

## 4. Check the result

| Action/query | Expected result |
| --- | --- |
| **Find errors** / `status >= 500` | 20 matching rows; complete |
| `unavailable` | The same 20 matching rows; complete |
| `auth` or `service = "auth"` | First 100 matches; partial because 200 exist |
| `missing-service` | No matching rows; complete |
| `duration > 10` | Guidance naming the supported fields |
| `2026-10` | Date search is unsupported |

Choose the second error result. It should reach visible row **31** (index 30).
Use **Back** to recover the previous position. Close search with Escape and check
that focus returns to the button that opened it.

## 5. Extend one capability

**Exercise:** add `status = 503`. Update both `searchHelp.fields` and the provider's
validator/evaluator. It should return the same 20 errors. Changing only the help
text is not an implementation of the operator.

To adapt this to your server, forward `signal` to `fetch`, return stable addresses
for the requested revision, and preserve the server's completeness/message. The
next lesson shows that transport boundary.

**Next: [Investigate a recording over HTTP](HTTP-recording.md).**

# 4. Investigate a recording over HTTP

[All lessons](Home.md) · [Previous: Logs](Logs.md) · [Next: Compose](Compose.md)

**Build:** an explorer whose rows stay on the server, then inspect a slow event,
compare nearby ranges, and share a saved location and selection.

This lesson uses the repository's real, redacted Chromium recording. Read its
[provenance and supported event types](../../demo/src/data/fixtures/README.md).
Event durations overlap; their sum is not CPU time. The bounded recording makes the
example reproducible without credentials or an external data service.

## 1. Start both sides

From the repository root:

```sh
npm run dev
```

Open `/http.html` on the URL Vite prints. The existing
[server integration](../../demo/server/trace.ts) starts with Vite. The separate
[client entry](../../demo/src/http-main.tsx) loads the page without importing the
recording into its browser bundle. A static host has no such backend; run locally
for this lesson.

## 2. Follow one row request

Read [`connectHttpTrace`](../../demo/src/data/http-trace.ts) alongside the following
sequence. These are the actual operations implemented by the companion:

1. `GET /__granum-grid/trace/meta` returns the dataset ID, revision (a hash of the
   recording's contents), row count, metric, and search hints.
2. The client constructs a `DataProvider` with that metadata.
3. When the library requests `fetchRows(start, count, signal)`, the adapter sends
   `GET /__granum-grid/trace/rows?revision=…&start=…&count=…`.
4. The server validates the revision and range, and returns exactly `count` rows in
   the same order. A stale revision returns HTTP 409.
5. The adapter validates the response and forwards the rows to the library.

For example, `start=10&count=2` must return event indices **10 and 11**. Pagination
never changes their addresses. The cache normally requests 256-row pages; the server
caps each request at 1,024 rows, 512 summary buckets, or 100 search matches. A jump
directly addresses the requested page without walking earlier pages. Request cancellation passes through the fetch `signal`.

Open your browser's Network panel to inspect the `meta`, `rows`, `overview`,
`aggregates`, and `search` requests. The page's counters report JSON response bytes
and elapsed response/body-reading time, not compressed wire traffic or heap usage.

## 3. Connect the UI to the public API

Read [`HttpExample.tsx`](../../demo/src/HttpExample.tsx). Its connection effect uses an
AbortController and creates the provider only after metadata loads. It passes that
provider and a typed `apiRef` to `GranumGrid`.

| Application action | Public API used | Responsibility |
| --- | --- | --- |
| Find slow events | `openSearch('duration > 10')` | Open a query; wait for a selected result before navigating |
| Select nearby events | `setSelection({ start, end })` | Clamp the range to the dataset bounds |
| Remember view | `getView()` | Keep the detached snapshot in application state |
| Restore view | `restoreView(saved)` | Validate dataset/revision before restoring |
| Create share link | `encodeView(api.getView())` | Let the host choose the URL and sharing policy |
| Open a link | `decodeView(text, provider)` | Validate before supplying initial location/selection |

The full code is already runnable; there is no imaginary `/api` endpoint to supply.
To build it in your own application, reuse the
[HTTP provider recipe](../QUICK_START.md#connect-an-http-api), replace its endpoint
and row validation, and pass the resulting provider to the same component.
The Vite server here is a local teaching fixture, not a production deployment plan.

## 4. Check the result

1. Wait for recorded event rows, then choose **Find slow events**. The query is
   `duration > 10`; selecting a result navigates to the original event row.
2. Choose **Select nearby events**, then **Show summary**. It reports exact
   statistics over supported events in this recording.
3. Choose **Remember view**, navigate elsewhere, then **Restore view**. Both the
   location and selected range return.
4. Choose **Create share link** and reload. The encoded view restores for the same
   dataset revision. Open the link in a second tab served by the same local server.
5. Inspect Network: the client receives pages and summaries on demand, not a full
   recording download.

The server holds the whole finite fixture and can scan it for search/summaries.
For a production archive, replace that storage with indexed reads and appropriate
aggregate queries. The server, not the browser, owns authorization and query policy.

## 5. Exercise: replace the row type

Adapt the transport to your own ordered events. Keep the contract in this order:

1. Define the typed row and known snapshot metadata.
2. Implement a bounded `fetchRows` endpoint and validate every returned row.
3. Handle cancellation and reject an obsolete revision.
4. Add optional search/summary capabilities only when the server can supply them.
5. Test an exact jump, a fast second jump, and a saved view from an older revision.

A saved view contains navigation and selection, not data or credentials. A URL works
only while its dataset/revision remains available to the person opening it.

**Next: [Compose your own explorer](Compose.md).**

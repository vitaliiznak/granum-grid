# Manifest

Granum Grid is a way to stay oriented inside a large ordered index. A person can
stand on one row address, see that address on a map of the whole count, and move
between a single record, its surroundings, and a summary of a range without losing
the place.

## Who it is for

It is for application teams whose data already lives in an order a server can
count and slice. Production logs, traces, sensor archives, inventories, market
tapes, and reference sequences fit when the server can answer two questions:
how many rows are in this order, and what are the rows from this address through
that address.

The reader is someone investigating a place in that order. They arrive with a
row number, a percentage, an event name, or a query, and they need to leave with
the same place saved, shared, or compared with another range.

Use it when the dataset is too large to download, and when a known count plus a
slice is a truthful description of the data. Arrays already in memory fit the
same contract through `createArrayProvider`. Unknown-length streams do not: the
address model needs a count.

A spreadsheet grid fits when the work is arranging a dataset the client already
holds: column layout, client-side sorting, and cell editing of that local copy.
Granum Grid starts after the server has published an order. Drawing the current
window as rows is one scale of that order, alongside range summaries and the map.

## What stays on the server

Columns, sorting, filtering, and editing are server operations. A large index
cannot be rearranged in the browser, and the library does not try. The server
publishes which columns exist and which of them may be sorted, filtered, or
edited. The host sends an intent. The server returns the next ordered snapshot:
the same dataset `id`, a new `revision`, a `rowCount`, and `fetchRows` for that
order.

Addresses belong to one revision. A saved view, a selection, and a cached page
from the previous order are not reused after the server changes the order or
rewrites a row. Append-only growth is the exception: a live feed may keep the
revision while it adds rows past the previous end.

The server returns rows as a cursor and a window size. The cursor is an opaque
position in the current revision. Null starts at the first row. The window size
is the maximum number of rows in that response, and the response includes the
address of its first row plus the cursor for the next window. A jump asks the
server for the cursor at that address, then reads only the windows needed to
fill the requested slice.

Search is a different server question. It looks for addresses inside the current
revision. A filter replaces the revision.

## What the library keeps

The library keeps the place. One zero-based address is shared by the row window
and range summaries. The map always covers the whole count. Back
returns to the previous address and scale. The host renders each row; the library
does not read fields, sort values, or scan the index to imitate a capability the
server did not provide.

Work stays bounded by the visible rows, the requested pages, and the requested
summary buckets.

## The server action contract

`ServerDataset<Row>` is the host's interface to those server operations. The
explorer does not call it.

- `columns(signal)` returns the server's column model.
- `cursorAt(index, signal)` asks for the opaque cursor at one address. Null is
  the first row.
- `fetchWindow({ cursor, windowSize }, signal)` returns at most `windowSize`
  rows from that cursor, the address of the first row, and the next cursor.
- `sort(keys, signal)` asks for a new order.
- `filter(filters, signal)` asks for the rows that satisfy the constraints.
- `edit(edit, signal)` asks the server to change one address, either by replacing
  the opaque row or by writing one editable column.

`serverActionIssue(action, columns, rowCount)` checks the intent against that
published model before the request is sent. An empty sort or filter list asks
the server for its snapshot with that operation cleared. `acceptServerRevision`
installs the provider the server returns and refuses a result that changes the
dataset id, keeps the current revision, or reports an invalid count.

```ts
import { acceptServerRevision, createCursorProvider, serverActionIssue } from 'granum-grid';

const columns = await server.columns(signal);
const action = {
  kind: 'sort' as const,
  keys: [{ columnId: 'level', direction: 'desc' as const }],
};
const issue = serverActionIssue(action, columns, provider.rowCount);
if (!issue && server.sort) {
  const next = await server.sort(action.keys, signal);
  setProvider(acceptServerRevision(provider, next));
}

const readings = createCursorProvider(server, {
  id: 'logs',
  revision: '7',
  rowCount: 4_000_000_000,
});
```

The integration guide states the navigation contract the returned provider must
satisfy. This manifest states why that contract is shaped this way.

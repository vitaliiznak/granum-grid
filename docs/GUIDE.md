# Granum Grid integration guide

[Documentation home](README.md) · [Quick start](QUICK_START.md) · [Styling](../STYLING.md) · [Library overview](../README.md)

This guide covers provider rules, server-owned ordering, search, navigation, summaries,
selection and host tools, page layout, live feeds, and limits. Start with the
[quick start](QUICK_START.md) for installation and a first component. The exact types are in
[`index.ts`](../granum-grid/src/index.ts), [`data/types.ts`](../granum-grid/src/data/types.ts),
[`core/engine.ts`](../granum-grid/src/core/engine.ts), and
[`core/api.ts`](../granum-grid/src/core/api.ts). [DESIGN.md](../DESIGN.md) records the
rationale and decisions.

## Provider contract

A `DataProvider<Row>` needs `id`, `revision`, `rowCount`, and
`fetchRows(start, count, signal)`. API indices are zero-based, visible row numbers are
one-based, and ranges are half-open `[start, end)`. A provider rebuilt during render keeps
its data session and cached rows while its `id`, `revision`, `rowCount`, and summary
methods stay the same, so change `revision` whenever rows change. Define providers outside
render or memoize them anyway: the `api` handle follows provider identity.

- `Row` is opaque. The library passes it to your renderer without inspecting or
  serializing it, so primitive, nested, nullable, and non-JSON values work. Parsing
  files, flattening trees, and mapping cursors to indices belong to the adapter.
  `createCursorProvider` does that mapping for a server that returns a cursor,
  a window of rows, the address of the first row, and the next cursor.
- `rowCount` is a known, nonnegative safe integer. Zero rows shows an empty state with
  no active row. Unknown-length streams are unsupported.
- `id` identifies the dataset and `revision` its ordered snapshot. Sorting, filtering,
  or changing existing rows needs a new revision. A new ID or revision discards cached
  rows, metadata, measurements, history, the visited trail, and searches, and restarts
  at the initial address clamped to the new count. Append-only growth can keep the
  revision; see [append mode](#append-only-live-feeds).
- Return exactly the requested rows, in order, or reject. A short page is an error, not
  the end of the data.
- Pass `signal` to your transport. Late or superseded responses are discarded even when
  a provider ignores cancellation, but ignored cancellation still occupies request slots.
- Buckets cover the requested range in order, without gaps or overlap, and never exceed
  the requested count. Use `accuracy: 'unavailable'` with `null` count and values for
  missing coverage. With zero valid values, `count` is `0` and the values are `null`.
  An estimated count estimates the range; it is never the number of sampled rows.
- `metric.kind: 'value'` shows the mean and min–max range; `'density'` shows valid count
  per row span. A time-density chart needs a time coordinate model, which this API does
  not provide. With `metric.domain` the scale is fixed; otherwise it comes from the
  global overview and stays stable while exploring regions.
- Markers are a bounded set of landmarks, and chapters are ordered, non-overlapping
  ranges with optional gaps. Use `search` for large event sets.

## Provider capabilities

Only `id`, `revision`, `rowCount`, and `fetchRows` are required. Optional capabilities progressively enrich the explorer:

| Capability                                         | Purpose                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `fetchOverview(buckets, signal)`                   | Global profile on the dataset map and loading estimates.                                                  |
| `fetchAggregates({ start, end, buckets }, signal)` | Range statistics: sub-range maps through `rangeProvider`, and any summary your page shows.                |
| `fetchOverviewTracks(buckets, signal)`             | Up to four additional profiles sharing the same row addresses; enable with `rail={{ showTracks: true }}`. |
| `fetchMarkers(signal)`                             | A bounded set of named events and snap targets.                                                           |
| `fetchChapters(signal)`                            | Ordered non-overlapping index ranges and breadcrumbs.                                                     |
| `search(query, { fromIndex, limit, signal })`      | Date, predicate, and opt-in plain-text queries performed by your provider.                                |

Sorting, filtering, and editing belong to the server; see
[server-owned ordering](#server-owned-ordering).

`fetchOverview` supplies the permanent whole-dataset map. `fetchAggregates` supplies
range statistics: `rangeProvider` turns it into a sub-range's map, and a host calls it
directly for a summary panel. The explorer itself never requests range statistics.
Without an overview, row navigation still works with a neutral map. Markers closer than
28 px on screen share one button named after the most severe marker, with a +N count of
the others; a searchable, paged dialog lists the individual markers. On a compact map the
button's number is that named marker's place among all markers in row order, not the
number of markers in the button. Host places passed through `markers` with kind
`bookmark` draw as ★, ranked after errors and spikes. No capability falls back
to a browser scan of the dataset. Resolutions and counts are listed under
[limits and defaults](#limits-and-defaults); map presentation is in
[map configuration and styling](../STYLING.md#configure-the-dataset-map).

In the signal demo, the map has 320 groups of 312,500 rows. The worker estimates each
group's mean, minimum, and maximum from 64 evenly spaced samples, and the UI labels
them as sampled. See the [demo limitations](../README.md#demo-limitations).

Use `metric.description` for a plain-language explanation of the source and calculation.
It appears in map help with the scale and group size. Hover details stay short: the
metric, the group's value and accuracy, the jump row, and a few row examples.
An additional track supplies its own `metric.description`; it does not inherit the
primary metric's explanation. `showMagnifier` (off by default) adds a crop of the same
overview buckets and does not fetch finer aggregates. Short rails hide the magnifier and
row examples so the metric and jump target remain readable.

## Server-owned ordering

A large index cannot be rearranged in the browser, so sorting, filtering, and editing
happen on the server. The explorer reads one ordered revision. When the order or contents
change, give it a new provider with the same `id` and a new `revision`: cached pages,
history, selection, and saved views belong to the previous revision and are dropped. A
filter is a new revision with its own `rowCount`; search finds addresses in the current
revision only.

The library has no column model and no sort or filter controls. Put them in
`toolbar={{ actions }}` or `panel`, send the intent to your server, and install the
provider it returns.

A server that pages with an opaque cursor can satisfy `fetchRows` through
`createCursorProvider(source, { id, revision, rowCount })`. The source has two methods:

- `cursorAt(index, signal)` returns the opaque cursor at one address; null is valid
  only at address 0.
- `fetchWindow({ cursor, windowSize }, signal)` returns at most `windowSize` rows from
  that cursor, the address of the first row, and the next cursor (null at the end).

`createCursorProvider` seeks once and follows the next cursor only until the requested
slice is full. `cursorWindowIssue` and `acceptCursorWindow` from `granum-grid/data`
expose the same window checks for a host's own transport.

Random access is the hard part, and it is yours. `cursorAt` must find an address without
reading the rows before it: a dense sequence number, a fixed-cadence timestamp, or
row-group offsets in a columnar file. SQL `OFFSET` reads every skipped row, so it does
not scale to deep addresses.

```ts
import { createCursorProvider } from 'granum-grid';

const logs = createCursorProvider(server, {
  id: 'logs',
  revision: '7',
  rowCount: 4_000_000_000,
});
```

### A file without a server: Parquet over HTTP

A Parquet file's footer lists every row group's row count, so `rowCount` is exact and an
address maps to one row group. [`@granum/parquet`](../packages/parquet/README.md)'s
`createParquetProvider` reads the footer once with an HTTP range request, then downloads
only the column chunks that hold the requested rows (only their pages when the file has a
page index). It is a separate package with [hyparquet](https://github.com/hyparam/hyparquet)
as a peer dependency, so the explorer itself stays free of it. The server must answer byte
ranges with `206` and allow cross-origin reads; the adapter refuses a server that sends the
whole file instead. `file.largestRowGroupBytes` and `file.pageIndex` tell a host what one
jump will cost before it opens the file.

Measured on 14 October 2026 from one machine, against a 2.15 GB FineWeb file on Hugging
Face (973,991 rows in 974 row groups of about 1,000): the footer took about 2 s and
3.7 MB; a jump to row 486,996 then took about 0.7 s and 2.1 MB from Node, and 1.4–1.9 s
in the playground, which also prefetches the next group. The first rows appeared about
3 s after the playground opened the file. A jump costs one row group, so a file written
with very large row groups and no page index costs far more per jump. The map's min–max
come exact from the footer's statistics; its line reads one row group per map group and
is labeled sampled.

### SQL with an exact map: `@granum/sql`

[`@granum/sql`](../packages/sql/README.md) turns any relation DuckDB can read (a table, a
Parquet or CSV file, a query) into providers. The host passes one `query(sql, params,
signal)` function; the package builds every statement. Each view (filters, a trusted
`whereSql`, and a sort order) becomes a revision: its rows are copied in order into a
table of its own, so `fetchRows` is a `rowid` range scan, the overview and range statistics
are exact, and search reads every row, wrapping from the current row. Opening a view is
the expensive step (one read and sort of the source); keep the number of kept revisions
small (`keepRevisions`, default 3). With DuckDB-WASM this needs no server; with a server,
expose a narrow endpoint rather than raw SQL.

## Search

**Go to…** (Cmd/Ctrl+K inside the explorer, or `/` in the viewport) resolves some input
locally and sends the rest to `provider.search`:

| Input                                | Handled by                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `73,500,000`                         | Locally: a one-based row number, with optional thousands separators                                             |
| `50%`                                | Locally: index `Math.round(0.5 * (rowCount - 1))`                                                               |
| `next spike`, `previous event`       | Locally: the next or previous loaded marker (`spike`, `error`, `event`, `bookmark`, or `marker`)                |
| `2017-03`, `2017-03-14`, `date 2026` | Provider: `{ kind: 'date', value }`. Bare digits stay row numbers.                                              |
| `value > 120`, `service = "auth"`    | Provider: `{ kind: 'predicate', field, operator, value }` with `>`, `>=`, `<`, `<=`, `=`, or `!=`               |
| `auth`                               | Provider: `{ kind: 'text', value }` when `searchHelp.text` is true; otherwise named markers only, with a notice |

The dialog requests up to 100 matches and does not paginate. Typing does not navigate;
choosing a result does. Providers validate every query and return exact matching
addresses. `complete: false` marks partial results: they stay navigable and labeled,
and an empty partial result is never shown as "No matching rows". `message` is rendered
as text, not HTML. Without `search`, date and predicate queries explain that the
provider does not support them; row numbers and percentages still work.

`searchHelp: { examples, placeholder?, dates?, text?, fields? }` describes the mounted
provider. Fields declare `name`, `type: 'number' | 'text'`, and their `operators`. The
dialog shows up to four examples, offers field help, and rejects undeclared fields or
operators before calling `search`. `dates: false` disables date queries. Without
`searchHelp`, the provider keeps its own behavior. See the
[search recipe](QUICK_START.md#add-search-and-a-dataset-map).

The demo providers match plain text case-insensitively as a substring of text fields
and use case-insensitive equality for text predicates. For logs, plain text covers
service, level, route, message, and trace ID; `service = "auth"` restricts the match to
one field. Named markers appear separately, and their count is never a count of matching
rows. Generated datasets verify up to 100 matches from a bounded sample and report
partial results. Gene and chromosome shortcuts show a representative range start and
disclose that more matching bases exist.

## Dynamic heights and standard list APIs

Open **debug** and enable **Dynamic row heights** in the signal demo to try wrapped notes, expansion, scroll alignment, and save/restore at 100 million rows.

```tsx
import { useRef } from 'react';
import { GranumGrid, type GranumGridApi } from 'granum-grid';

function Notes() {
  const api = useRef<GranumGridApi<Note>>(null);
  return (
    <>
      <button onClick={() => api.current?.scrollToIndex(73_499_999, { align: 'center' })}>
        Find row 73,500,000
      </button>
      <GranumGrid
        provider={provider}
        ariaLabel="Notes"
        apiRef={api}
        dynamicRowHeight
        rowHeight={80}
        overscan={3}
        renderRow={({ row }) => (
          <div role="gridcell" style={{ padding: 12 }}>
            {row.value}
          </div>
        )}
      />
    </>
  );
}
```

With `dynamicRowHeight`, `rowHeight` is the estimate for unloaded/unmeasured rows. Changing
`rowHeight` or `dynamicRowHeight` keeps the current row and history. One `ResizeObserver` measures the border boxes of loaded DOM rows and batches corrections. Wrapping, expansion, and late content changes are measured automatically. Use padding inside rows rather than external vertical margins; margins are not part of a measured border box. In a headless layout, spread `getRowProps(slot)` on the actual row element, including its measurement `ref`, and do not impose a fixed height on that element.

The engine keeps a sparse cache of measured heights, not an array of 100 million sizes. The hook keeps up to 4,096 measurements, and mounted rows stay measured beyond that budget; the framework-independent `createEngine` takes `maxMeasuredRows` to change it. `onStats.measuredRows` reports the count separately from the row-data byte estimate. A width change clears old width-dependent measurements and remeasures mounted content. Provider identity/revision changes create a fresh measurement cache. Hosts can call `api.resetMeasurements()` when offscreen content or typography changes.

Rows retain the leading row address and pixel offset while content changes, clamping the offset if the anchor row becomes shorter. The dataset map stays in row-address coordinates, so no global pixel height depends on unseen rows.

- `overscan`: extra rows mounted before and after the viewport.
- `apiRef`: the mounted handle on the component. The hook returns the same object as `api`.
- `scrollToIndex(index, { align: 'start' | 'center' | 'end' | 'auto' })`: aligns the target row. Default `auto` leaves an already-visible row in place. New measurements maintain alignment until another navigation input. Boundary clamping and rows taller than the viewport can prevent full alignment. Aligned jumps are immediate; `goTo(index)` retains the animated exploration behavior.
- `getView()` / `restoreView(view)` / `initialView`: save and restore the row address, fractional offset, and selection. A view does not contain cached data or measurements, and it is accepted only by the same dataset revision. Offscreen estimates can reflow on remount. A matching `initialView` takes precedence over `initialIndex`; both are initial values, not controlled props.
- `getRowKey(row, index)`: optional stable React key for loaded rows. Keep keys unique; the default is the row index. Expansion/selection state that must survive virtualization belongs in the host application.
- `emptyContent`: optional custom empty state. Existing row placeholders/retries and fixed column-heading slot remain available.

## Navigation

- Drag the right-hand dataset map to travel across the dataset. Move horizontally away while dragging for half, quarter, or fine precision. Shift bypasses magnetic markers. Escape cancels a scrub.
- Use Cmd/Ctrl+K inside the component, `/` in the viewport, or **Go to…** in the `toolbar`. See [search](#search) for the accepted input.
- Arrows move one row; PageUp/PageDown move a visible span; Home/End reach the endpoints. N/P visit markers. Cmd/Ctrl+Up/Down visit chapter boundaries.
- Alt+Left/Right and the `toolbar`'s Back/Forward restore committed jumps. Wheel motion is not a history entry. Mouse back/forward interception depends on the browser.
- Read one record per line. The current address is the first visible row. Scrolling stops when the last row ends at the bottom of the viewport; a jump to a row below that point shows it there and keeps it current until the reader scrolls. A wheel gesture that starts by pushing past either end scrolls the page, as a native scroller does, while one that starts by moving rows keeps them to its end, resisting and springing back while elastic edges are on. Elastic edges are off by default in an embedded explorer, which stops at its ends like a plain scroller, and on with `layout="page"`; set `features={{ edgeElasticity }}` to choose. Set `overscroll-behavior: contain` on the viewport to keep every wheel gesture in the rows. Sideways wheels pass through to wide content. The dataset map always covers the whole dataset. Ctrl+wheel and pinch remain browser zoom gestures.
- Reduced motion follows the system preference or `reducedMotion={true}`. The component retains direct navigation while suppressing flights, touch inertia, elastic edges, and the fast-fling overview.

`goTo(index)` accepts a safe integer, clamps it to the dataset, chooses an animated or
immediate jump from the distance and reduced motion, and records history unless
`history: 'skip'`. `onNavigate` fires after committed navigation, not on every animation
frame; subscribe to snapshots for continuous position. Keep live position in the engine
instead of mirroring it in host state. `granum-grid/core` has no React, DOM, or network
imports: `createEngine` takes numeric dimensions and normalized input, and the caller
drives flights with `step(timestamp)`. Snapshots keep their identity until a value
changes, so React subscribes through `useSyncExternalStore`.

## Selection and host tools

The explorer keeps one half-open selection. `selection` and `onSelectionChange` support
controlled or internal range state, and `initialView` can start with a saved selection.
The hook exposes `selection`; the handle offers `getSelection`, `setSelection`, and
`getVisibleRange`. Selected rows carry `data-selected`, and the map shades the range. API
ranges are zero-based and half-open (`{ start: 99, end: 200 }` selects rows 100–200).

The explorer ships no selection card, bookmarks, range comparison, or first-run hints.
Those are application features; the playground builds all of them on the public API in
[`demo/src/explorer`](../demo/src/explorer/index.tsx). The pieces a host uses:

- `panel` renders host content between the toolbar and the rows. Its function form
  receives the hook state and runs on every frame; memoize what it renders.
- `rail={{ selecting, onSelectingChange }}` lets a host button switch the map into
  drawing a selection. The map calls `onSelectingChange(false)` when the drag ends or
  Escape cancels it.
- `api.getVisibleRange()` reads the rows in view without re-rendering, for "select
  what is on screen".
- `markers` adds host places, such as saved bookmarks, to the provider's markers for the
  map, N/P, snapping, and named-marker search.
- `api.getView()`, `encodeView`, `decodeView`, and `readView` (from `granum-grid/core`)
  save and validate a place. The library writes no browser storage.
- Your provider's `fetchAggregates({ start, end, buckets: 1 }, signal)` returns a
  range's statistics with `exact`, `estimated`, or `unavailable` accuracy;
  `checkBuckets` from `granum-grid/data` validates the response.
- `rangeProvider(provider, range)` reads a sub-range as its own provider, for a second
  explorer beside the first, without materializing rows.

With `layout="page"`, a panel that scrolls on its own needs `data-ds-native-scroll`, so
the wheel scrolls the panel instead of the rows.

`stickyChapters` keeps the current provider chapter above the rows. The `toolbar`
shows **Back** and **Go to…**; diagnostics are under **debug** in the demo, and
`onStats` reports cache, request, and measurement counts to a host.

## Open in a separate tab and scroll the window

The demo's **Open full page** link opens the same location and selected range in a separate tab. Its URL updates while navigating and restores after reload. **Back to normal view** returns to the embedded demo in that tab, keeping the dataset, position, selection, and current debug and simulation settings. The **debug** button opens one panel in both layouts for behavior switches, reduced-motion emulation, row-height testing, and performance statistics. Generated datasets also expose simulated server latency from 0–10 seconds (default: 1 second); changes apply to new requests while cached rows remain instant. Recorded traces do not expose simulated latency. For a host application, add a route that renders one `GranumGrid` with `layout="page"`, then pass a URL builder to the embedded instance:

```tsx
import { encodeView, decodeView } from 'granum-grid';

// Embedded instance:
<GranumGrid
  {...props}
  toolbar={{ fullPageUrl: (view) => `/explorer?page=1#view=${encodeView(view)}` }}
/>;

// In the client-side full-page route, using the same provider:
const view = decodeView(location.hash.replace(/^#view=/, ''), provider);
<GranumGrid {...props} layout="page" initialView={view} />;
```

`decodeView` returns `null` for malformed, oversized, out-of-range, or other-revision input. The library does not install a router or rewrite host URLs; the host chooses the route and sharing policy.

The library owns the full viewport in page mode. Mount one page-mode explorer per document, outside ancestors with transforms that establish fixed-position containing blocks. The native scrollbar and dataset map show the same global progress: dragging either halfway reaches the middle of the dataset. The document scroll range is capped (see [limits](#limits-and-defaults)), so native scrollbar dragging is approximate for very large datasets. Wheel input, touch panning over the rows, and keyboard steps retain precise local movement; Go to selects an exact row. Native `window.scrollTo`/`scrollBy` offsets use the compressed global range. On unmount the spacer and listeners are removed and the previous scroll-restoration setting returns. The headless hook takes the same `layout: 'page'` for custom full-page layouts; the host supplies the fixed viewport.

## Append-only live feeds

Pass `dataMode="append"` and replace the provider with a larger known `rowCount`,
preserving its ID, revision, and all previous rows/addresses. A smaller count is
rejected. `dataMode="follow"` also follows when the viewport is already at the end.
Cached complete pages and measurements are retained; the old partial final page is
refreshed. Reading earlier rows preserves the address, counts new rows in `unseenRows`,
and shows **Jump to latest**. Plain append mode preserves position. The default is
`snapshot`, which rebuilds on any count change. Changed/reordered/deleted rows need a
new revision.

## Limits and defaults

| Setting                 | Default or limit                                                                            | Configure with           |
| ----------------------- | ------------------------------------------------------------------------------------------- | ------------------------ |
| Component height        | 600 px                                                                                      | `style` or `className`   |
| Row height              | 32 px; the estimate for unmeasured rows with `dynamicRowHeight`                             | `rowHeight`              |
| Overscan                | 2 rows per side; allowed 0–1,000                                                            | `overscan`               |
| Measured heights        | 4,096 sparse entries; mounted rows are kept beyond the budget                               | Fixed (`createEngine`)   |
| Page size               | 256 rows                                                                                    | `cache.pageSize`         |
| Cache budget            | 32 MiB, estimated, including cached metadata                                                | `cache.maxBytes`         |
| Row size estimate       | 256 bytes per row plus 64 bytes per page; not a heap measurement                            | `cache.estimateRowBytes` |
| Row request deadline    | 15,000 ms, then the page offers a retry                                                     | `cache.requestTimeoutMs` |
| Concurrent row requests | 4; at most 8 unsettled transports, including canceled ones                                  | Fixed                    |
| Overview                | 320 buckets                                                                                 | Fixed                    |
| Extra map tracks        | Up to 4, with 160 buckets each                                                              | `fetchOverviewTracks`    |
| Markers and chapters    | At most 4,096 each; markers closer than 28 px are grouped, and group lists show 40 per page | Fixed                    |
| Search dialog           | 100 matches without pagination; up to 4 examples from `searchHelp`                          | Fixed                    |
| Saved view text         | 8,192 characters for `decodeView`                                                           | Fixed                    |
| Page layout scroll      | Native document scroll range capped at 1,000,000 CSS px                                     | `layout="page"`          |

Row requests are scheduled for visible rows first, then map previews, then the predicted
stopping point. Visible and preview pages stay cached even above the budget, and
`budgetOverage` reports the excess; prefetch is skipped when it would exceed the budget.
A canceled request frees its slot at once but counts toward the transport cap until the
provider settles it; pages blocked by the cap show a waiting message and load once a
transport settles. Provide `estimateRowBytes` for
large rows. `onStats` reports cached rows and bytes, overage, active, aborted, and
completed requests, frame rate, and measured rows; frame rate is sampled only while a
host supplies `onStats`. These defaults are not performance guarantees.

## Composition and packaging

`useGranumGrid` returns the `api` handle, the navigation `snapshot`, bounded row slots,
viewport, row, and announcement prop getters, and display state: `selection`,
`markers`, the current `chapter`, `traveling`, `edgeOffset`, `unseenRows`, and `stats`.
It fetches data and binds browser input; custom layouts choose the row content and place
the map. Its data session and coordinate mapping are internal to the library's widgets.
`onNavigate` reports committed jumps, and `onStats` reports cache and request counts and
frame rate. The ready-made component adds the map and the Go to dialog; the toolbar,
footer, and column headings are opt-in.
`features` switches motion and data behavior; `defaultFeatures` lists every flag with its
embedded default (`layout="page"` also turns on `edgeElasticity`). The component's regions
(`toolbar`, `rail`, `footer`) each take `true` or options to show the built-in region,
`false` to hide it, or a render function; only `rail` is shown when omitted. `panel` holds
host content; map layers are `rail` options. Layers and package entry points are listed in the
[package README](../granum-grid/README.md#layers). Custom controls, headless
layouts, and styling hooks are in [STYLING.md](../STYLING.md).

## Integration interface

### Row activation

Pass `onRowActivate={({ row, index, rowNumber }) => ...}` to `GranumGrid` or
`useGranumGrid` to inspect a loaded record in your own panel. `index` is zero-based;
`rowNumber` is one-based. `RowActivationContext<Row>` is exported from both
`granum-grid` and `granum-grid/headless`.

Click/tap activates a loaded row; Enter activates the focused loaded row. Arrow keys
move row focus and scroll only enough to reveal it. Activation itself preserves the
scroll anchor, navigation history, and range selection. Controls inside a row,
modified clicks/keys, text selection, loading/error placeholders, and touch pans
do not activate records. Without the callback, existing navigation is unchanged.

The hook's `focusedIndex`, `getRowProps`, and `getViewportProps` keep the highlight
and `aria-activedescendant` in sync. Scrolling or replacing the data session resets
pointer focus to the scroll anchor. The host owns the panel, Escape handling,
restoring DOM focus, and discarding inspected data when the provider changes.
The Bitcoin demo shows this pattern, including copying the loaded candle as JSON.
The Hacker News demo uses it to read an item's text, links, and thread.

### Mounted API

`GranumGridApi<Row>` is the one imperative handle: `apiRef` on the component and `api`
on `useGranumGrid` hold the same object. The
[custom controls recipe](QUICK_START.md#build-custom-controls) calls it from a button.

```ts
interface GranumGridApi<Row> {
  readonly provider: DataProvider<Row>;
  // Navigation
  goTo(index: number, options?: GoToOptions): void;
  scrollToIndex(index: number, options?: ScrollToOptions): void;
  back(): void;
  forward(): void;
  nextMarker(kind?: string): void;
  previousMarker(kind?: string): void;
  nextChapter(): void;
  previousChapter(): void;
  cancel(): void;
  // State
  getSnapshot(): NavigationSnapshot;
  subscribe(listener: () => void): () => void;
  onNavigate(listener: (event: NavigationEvent) => void): () => void;
  // Selection, places, and the explorer
  getSelection(): RowRange | null;
  setSelection(range: RowRange | null): void;
  getVisibleRange(): RowRange;
  getView(): SavedView;
  restoreView(view: SavedView): void;
  openSearch(query?: string): void;
  retry(): void;
  resetMeasurements(): void;
}
```

Input, measurement, and animation adapters stay on the framework-independent engine in
`granum-grid/core`, together with its raw `getLocation` and `restore`.

- `openSearch(query)` opens the dialog without navigating and replaces the query in an
  already-open dialog; choosing a result navigates. Search closes when the dataset or
  revision changes. Headless hosts pass `onOpenSearch` to the hook and render a
  controlled `JumpBar` or their own search UI ([layers](../granum-grid/README.md#layers)).
- When a custom button opens search, call `event.currentTarget.focus()` first so closing
  the dialog returns focus to it, including in browsers that do not focus buttons on
  pointer clicks.
- `setSelection` serves contextual range tools. With controlled selection,
  `setSelection` and `restoreView` call `onSelectionChange`; the host must accept the
  new prop value.
- `getView()` captures a detached location and selection snapshot. `restoreView(view)`
  rejects malformed or foreign dataset/revision views before changing state. For URLs,
  use `encodeView(api.getView())` and `decodeView(text, provider)`, as in the
  [full-page example](#open-in-a-separate-tab-and-scroll-the-window). Saved views
  contain no row payloads.
- `retry()` requests failed row pages and summaries again, for a custom
  `renderPlaceholder(slot, retry)` or error banner.
- The ref updates with the mounted provider and becomes null on
  unmount. Read `api.current` when an action runs rather than retaining a handle across
  datasets. Provider reads preserve cancellation, accuracy, and completeness.

AI schemas, prompts, validation, execution limits, and model connections belong to the application. The library ships no AI tool runtime or AI package entry. A backend query may still be expensive even when the returned result is small.

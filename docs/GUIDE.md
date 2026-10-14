# Granum Grid integration guide

[Documentation home](README.md) · [Quick start](QUICK_START.md) · [Styling](../STYLING.md) · [Library overview](../README.md)

This guide covers provider rules, search, navigation, summaries, exploration, page
layout, live feeds, and limits. Start with the [quick start](QUICK_START.md) for
installation and a first component. The exact types are in
[`index.ts`](../granum-grid/src/index.ts), [`data/types.ts`](../granum-grid/src/data/types.ts),
[`core/engine.ts`](../granum-grid/src/core/engine.ts), and
[`core/api.ts`](../granum-grid/src/core/api.ts). [DESIGN.md](../DESIGN.md) records the
rationale and decisions.

## Provider contract

A `DataProvider<Row>` needs `id`, `revision`, `rowCount`, and
`fetchRows(start, count, signal)`. API indices are zero-based, visible row numbers are
one-based, and ranges are half-open `[start, end)`. Define providers outside render or
memoize them.

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

| Capability                                         | Purpose                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `fetchOverview(buckets, signal)`                   | Global profile on the dataset map and loading estimates.                                                   |
| `fetchAggregates({ start, end, buckets }, signal)` | Range summaries, selection summaries, and comparison.                                                      |
| `fetchOverviewTracks(buckets, signal)`             | Up to four additional profiles sharing the same row addresses; enable with `atlas={{ showTracks: true }}`. |
| `fetchMarkers(signal)`                             | A bounded set of named events and snap targets.                                                            |
| `fetchChapters(signal)`                            | Ordered non-overlapping index ranges and breadcrumbs.                                                      |
| `search(query, { fromIndex, limit, signal })`      | Date, predicate, and opt-in plain-text queries performed by your provider.                                 |

Sorting, filtering, and editing are server operations on
[`ServerDataset`](MANIFEST.md#the-server-action-contract). The host checks the intent
with `serverActionIssue`, the server returns a new ordered provider, and
`acceptServerRevision` installs it. The component then navigates that revision.
The same server returns each page through `fetchWindow({ cursor, windowSize })`.
`createCursorProvider` seeks with `cursorAt` and follows the next cursor only
until the requested slice is full. Search finds addresses in the current revision;
a filter replaces the revision.
Text filters use equality or `contains`, numbers and times use comparison, and
booleans use equality. Time values are strings. A column can be sorted, filtered,
or edited only when the server marks it so.

`fetchOverview` supplies the permanent whole-dataset map; `fetchAggregates` supplies
detail for the visible or selected range at the requested resolution. Without regional
aggregates, Range summaries keeps the canvas overview and the **Inspect rows** action
and does not imply finer detail. Without any overview, row navigation still works with
a neutral map. Regional requests are debounced. Markers closer than 28 px on screen share
one button named after the most severe marker, with a +N count of the others; a searchable,
paged dialog lists the individual markers. On a compact map the button's number is that
named marker's place in the Bookmarks list, not the number of markers in the button. The reader's bookmarks join the same layer as
`bookmark` markers (★), ranked after errors and spikes. No capability falls back
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
import { GranumGrid, type GranumGridEngine } from 'granum-grid';

function Notes() {
  const controller = useRef<GranumGridEngine>(null);
  return (
    <>
      <button onClick={() => controller.current?.scrollToIndex(73_499_999, { align: 'center' })}>
        Find row 73,500,000
      </button>
      <GranumGrid
        provider={provider}
        ariaLabel="Notes"
        controllerRef={controller}
        dynamicRowHeight
        rowHeight={80}
        overscan={3}
        maxMeasuredRows={4096}
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

With `dynamicRowHeight`, `rowHeight` is the estimate for unloaded/unmeasured rows. One `ResizeObserver` measures the border boxes of loaded DOM rows and batches corrections. Wrapping, expansion, and late content changes are measured automatically. Use padding inside rows rather than external vertical margins; margins are not part of a measured border box. In a headless layout, spread `getRowProps(slot)` on the actual row element, including its measurement `ref`, and do not impose a fixed height on that element.

The engine keeps a sparse cache of measured heights, not an array of 100 million sizes. Mounted rows stay measured even when they exceed a very small `maxMeasuredRows`. `onStats.measuredRows` reports the count separately from the row-data byte estimate. A width change clears old width-dependent measurements and remeasures mounted content. Provider identity/revision changes create a fresh measurement cache. Hosts can call `resetMeasurements()` when offscreen content or typography changes.

Rows retain the leading row address and pixel offset while content changes, clamping the offset if the anchor row becomes shorter. Detailed Range summaries use natural heights. Coarse summaries and the dataset map stay in row-address coordinates, so no global pixel height depends on unseen rows.

- `overscan`: extra rows before and after the viewport in Rows and detailed Range summaries.
- `controllerRef`: imperative access on the component. The hook exposes the same engine as `controller`.
- `scrollToIndex(index, { align: 'start' | 'center' | 'end' | 'auto' })`: shows the Rows view and aligns the target. Default `auto` leaves an already-visible row in place. New measurements maintain alignment until another navigation input. Boundary clamping and rows taller than the viewport can prevent full alignment. Aligned jumps are immediate; `goTo(index)` retains the animated exploration behavior.
- `getLocation()` / `restore(location)` / `initialLocation`: save and restore row address, view, and zoom. A location does not contain cached data or measurements; restore against the same dataset revision. Offscreen estimates can reflow on remount. `initialLocation` takes precedence over `initialIndex` and `initialView`, which are initial values, not controlled props.
- `getRowKey(row, index)`: optional stable React key for loaded rows. Keep keys unique; the default is the row index. Expansion/selection state that must survive virtualization belongs in the host application.
- `emptyContent`: optional custom empty state. Existing row placeholders/retries and fixed column-heading slot remain available.

## Navigation

- Drag the right-hand dataset map to travel across the dataset. Move horizontally away while dragging for half, quarter, or fine precision. Shift bypasses magnetic markers. Escape cancels a scrub.
- Use **Go to…**, Cmd/Ctrl+K inside the component, or `/` in the viewport. See [search](#search) for the accepted input.
- Arrows move one row; PageUp/PageDown move a visible span; Home/End reach the endpoints. N/P visit markers. Cmd/Ctrl+Up/Down visit chapter boundaries.
- Back/Forward and Alt+Left/Right restore committed jumps. Wheel motion is not a history entry. Mouse back/forward interception depends on the browser.
- **Rows** (API: `rows`) is the default: one record per line. The current address is the first visible row, so the final row can rest at the top of the viewport; the space below it is marked as the end of the dataset. Pulling past either end resists and springs back while elastic edges are on. **Range summaries** (API: `zoom`) groups rows into summary bands; zoom in to read individual records. Summaries keep the current row centered, so near either end the space without rows is marked as the start or end of the dataset. Choosing Range summaries from the built-in menu zooms out from row detail to one row per pixel, capped by dataset size, and preserves the current row. An existing summary scale is retained; the public `setView` method continues to preserve zoom. Use **Fit dataset** for the whole dataset, **Zoom in** to narrow a range, and **Inspect rows** to return to a list. **Compare views** opens an illustrated guide; the separate dataset map always covers the whole dataset.
- Reduced motion follows the system preference or `reducedMotion={true}`. The component retains direct navigation while suppressing flights, touch inertia, elastic edges, and automatic speed zoom.

`goTo(index)` accepts a safe integer, clamps it to the dataset, chooses an animated or
immediate jump from the distance and reduced motion, and records history unless
`history: 'skip'`. `onNavigate` fires after committed navigation, not on every animation
frame; subscribe to snapshots for continuous position. Keep live position in the engine
instead of mirroring it in host state. `granum-grid/core` has no React, DOM, or network
imports: `createEngine` takes numeric dimensions and normalized input, and the caller
drives flights with `step(timestamp)`. Snapshots keep their identity until a value
changes, so React subscribes through `useSyncExternalStore`.

## Range summaries and custom bands

With `fetchAggregates`, **Range summaries** shows bounded, interactive summary bands.
Each band is one group. The default view compares averages with horizontal bars on a
shared scale that includes zero, with min–max whiskers when both values are supplied.
The scale is computed from the current groups; it can change when navigating. Negative
values extend left of zero. Missing values have no bar, and estimated bars use a dashed
outline. Range labels, coverage, row boundaries, units, and accuracy remain available;
the chart's accessible description includes the numeric average and available extremes.
**Zoom in**
fills the view with that group and splits it into smaller groups; **Inspect rows**
reads the records, and **Select** selects every row in it. The accuracy
label stays visible with a custom renderer. While a new range loads, stale bands are
replaced by a loading state. The library never fetches all rows to build a summary.

```tsx
<GranumGrid
  provider={provider}
  ariaLabel="Readings"
  aggregateRowHeight={140}
  formatRange={({ start, end }) => `Readings ${start + 1}–${end}`}
  renderAggregate={({ bucket }) => (
    <p>
      {bucket.end - bucket.start} readings · peak {bucket.max ?? 'unavailable'}
    </p>
  )}
  renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
/>
```

`renderAggregate` receives an `AggregateRenderContext` with `bucket`, `visibleRange`,
and `rowsPerPixel`, so content can change with scale. Keep it synchronous and cheap;
expensive summaries belong in the provider. `formatRange` must handle any valid range in
the current revision; it labels a range and does not make row addresses a time axis.
`aggregateRowHeight` sets the target band height and therefore the requested resolution.

The **Group size** control changes zoom around the current location, using a bounded
number of summary cards. Choose a preset or enter how many rows each group should
cover. This is a target size, not a fixed partition: panning, viewport changes and
provider resolution can change the actual sizes shown on the cards. Back restores the
previous range and scale.
Hosts can supply `summaryBucketSizes={[{ label: '1 hour', rows: 3600 }]}` and
`formatBucketSize={(rows) => String(rows / 3600) + ' hours'}` for data with one row per second.
Duration presets do not imply calendar-aligned boundaries. The default presets use rows.

`controller.zoomToRange({ start, end })` validates a nonempty half-open range, fits it in
Range summaries, and records the previous location once. The fit follows viewport
resizes until another navigation. `scrollToIndex(start, { align: 'start' })` inspects the
rows and also records the prior scale, so Back and Forward move between a range and its
context. The hook exposes `visibleRange` and `aggregateBuckets` for custom layouts. Band
styling is in [STYLING.md](../STYLING.md#summary-bands).

## Explore, compare, and save

Choose **Select rows**, then choose **Rows on screen**, **Draw on map**, or **Enter row numbers**. Exact row entry shows an inclusive From/To range and its row count before you apply it with **Use these rows**. Editing a selection leaves the existing selection intact until you apply the new one; Cancel or Escape returns to it.

The selection card identifies the selected rows and offers **View selection**, **Compare ranges**, and **Save bookmark**. A single row offers **Open row**. **Show summary** reveals provider-backed statistics with exact/estimated/unavailable status and units; a single row shows one value. Summaries load only when opened and never scan the whole dataset.

**Compare ranges** keeps the first range visible while **Choose second range** opens the same selection choices. **Show comparison** opens two virtualized panes after you choose different rows. **Change second range** lets you revise the pair; **Cancel comparison** returns to your selection. **Scroll together** matches relative progress through the two ranges, not timestamps or record identity. Each pane reads its range through `rangeProvider(provider, range)`, which does not materialize rows.

**Save bookmark** asks for a name only when saving. **Bookmarks** lists your saved locations and also lets you save your current position without selecting rows. Bookmarks save the current location, view, zoom, and selection, but no row data. They remain in memory unless the host supplies `bookmarkStorageKey`; the demo opts into local storage. Restore validates the dataset ID, revision, and row bounds. A blocked/full browser store leaves bookmarks usable for the current session.

Bookmarks and provider markers form one set of places. Each bookmark appears on the dataset map as a ★ marker at its selection start or saved row, and N/P, magnetic snapping, and named-marker search in **Go to…** include it. Clicking it on the map jumps to that row; choosing it in **Bookmarks** also restores the saved view and selection. The **Bookmarks** panel lists the provider's markers under **From this dataset**, 40 at a time, and numbers every saved place and dataset marker in that shared row order. Custom tools can publish their own saved places with `setBookmarkMarkers`; the hook's `markers` holds provider markers and bookmarks in row order.

`selection`, `initialSelection`, and `onSelectionChange` support controlled or internal range state; the hook also exposes `selection`, `setSelection`, `selectionMode`, and `setSelectionMode`. API ranges are zero-based and half-open (`{ start: 99, end: 200 }` selects rows 100–200). Set `exploration={false}` to hide these controls. `stickyChapters` keeps the current provider chapter above the rows. Normal navigation shows **Back**, a **View** menu, and **Go to…**; diagnostics are under **debug** in the demo or enabled by `showStats` in the component. Automatic aggregation while scrolling is opt-in with `features={{ automaticAggregation: true }}`.

## Open in a separate tab and scroll the window

The demo's **Open full page** link opens the same location and selected range in a separate tab. Its URL updates while navigating and restores after reload. **Back to normal view** returns to the embedded demo in that tab, keeping the dataset, position, view, selection, and current debug and simulation settings. The **debug** button opens one panel in both layouts for behavior switches, reduced-motion emulation, row-height testing, and performance statistics. Generated datasets also expose simulated server latency from 0–10 seconds (default: 1 second); changes apply to new requests while cached rows remain instant. Recorded traces do not expose simulated latency. For a host application, add a route that renders one `GranumGrid` with `layout="page"`, then pass a URL builder to the embedded instance:

```tsx
import { encodeView, decodeView } from 'granum-grid';

// Embedded instance:
<GranumGrid {...props} fullPageUrl={(view) => `/explorer?page=1#view=${encodeView(view)}`} />;

// In the client-side full-page route, using the same provider:
const view = decodeView(location.hash.replace(/^#view=/, ''), provider);
<GranumGrid
  {...props}
  layout="page"
  initialLocation={view?.location}
  initialSelection={view?.selection}
/>;
```

`decodeView` returns `null` for malformed, oversized, out-of-range, or other-revision input. The library does not install a router or rewrite host URLs; the host chooses the route and sharing policy.

The library owns the full viewport in page mode. Mount one page-mode explorer per document, outside ancestors with transforms that establish fixed-position containing blocks. The native scrollbar and dataset map show the same global progress: dragging either halfway reaches the middle of the dataset. The document scroll range is capped (see [limits](#limits-and-defaults)), so native scrollbar dragging is approximate for very large datasets. Wheel input, touch panning over the rows, and keyboard steps retain precise local movement; Go to selects an exact row. Native `window.scrollTo`/`scrollBy` offsets use the compressed global range. On unmount the spacer and listeners are removed and the previous scroll-restoration setting returns. The headless hook exposes `scrollMode: 'window'` for custom full-page layouts; the host supplies the fixed viewport.

## Append-only live feeds

Pass `dataMode="append"` and replace the provider with a larger known `rowCount`,
preserving its ID, revision, and all previous rows/addresses. A smaller count is
rejected. Add `followOutput` to follow when the Rows view is already at the end. Cached
complete pages and measurements are retained; the old partial final page is refreshed.
Reading earlier rows preserves the address, counts new rows in `unseenRows`, and shows
**Jump to latest**. Without `followOutput`, append mode preserves position. The default
is snapshot mode, which rejects `followOutput`. Changed/reordered/deleted rows need a
new revision. Expand **Try a live feed** in the demo to start and pause generated
events.

## Limits and defaults

| Setting                 | Default or limit                                                                            | Configure with           |
| ----------------------- | ------------------------------------------------------------------------------------------- | ------------------------ |
| Component height        | 600 px                                                                                      | `style` or `className`   |
| Row height              | 32 px; the estimate for unmeasured rows with `dynamicRowHeight`                             | `rowHeight`              |
| Overscan                | 2 rows per side; allowed 0–1,000                                                            | `overscan`               |
| Measured heights        | 4,096 sparse entries; mounted rows are kept beyond the budget                               | `maxMeasuredRows`        |
| Summary band height     | 120 px in `GranumGrid`; 4 px in the hook, for canvas rendering                              | `aggregateRowHeight`     |
| Page size               | 256 rows                                                                                    | `cache.pageSize`         |
| Cache budget            | 32 MiB, estimated, including cached metadata                                                | `cache.maxBytes`         |
| Row size estimate       | 256 bytes per row plus 64 bytes per page; not a heap measurement                            | `cache.estimateRowBytes` |
| Row request deadline    | 15,000 ms, then the page offers a retry                                                     | `cache.requestTimeoutMs` |
| Concurrent row requests | 4; at most 8 unsettled transports, including canceled ones                                  | Fixed                    |
| Overview                | 320 buckets                                                                                 | Fixed                    |
| Range summaries         | At most 160 buckets per request; a selection summary requests 1                             | `aggregateRowHeight`     |
| Extra map tracks        | Up to 4, with 160 buckets each                                                              | `fetchOverviewTracks`    |
| Markers and chapters    | At most 4,096 each; markers closer than 28 px are grouped, and group lists show 40 per page | Fixed                    |
| Search dialog           | 100 matches without pagination; up to 4 examples from `searchHelp`                          | Fixed                    |
| Bookmarks               | 40 bookmarks                                                                                | `bookmarkStorageKey`     |
| Saved view text         | 8,192 characters for `decodeView`                                                           | Fixed                    |
| Page layout scroll      | Native document scroll range capped at 1,000,000 CSS px                                     | `layout="page"`          |

Row requests are scheduled for visible rows first, then map previews, then the predicted
stopping point. Visible and preview pages stay cached even above the budget, and
`budgetOverage` reports the excess; prefetch is skipped when it would exceed the budget.
A canceled request frees its slot at once but counts toward the transport cap until the
provider settles it; pages blocked by the cap show a waiting message and load once a
transport settles. Provide `estimateRowBytes` for
large rows. `onStats` and `showStats` report cached rows and bytes, overage, active,
aborted, and completed requests, frame rate, and measured rows. These defaults are not
performance guarantees.

## Composition and packaging

`useGranumGrid` returns the controller, snapshot, bounded row slots, viewport and row
prop getters, announcements, the data session, and statistics. It fetches data and binds
browser input; custom layouts choose the row content and place the map. `onNavigate`
reports committed jumps, and `onStats` reports cache and request counts and frame rate.
Set `measureFrameRate` to sample frame rate without `onStats`; each sample re-renders the
explorer. The ready-made component adds the views, the Go to dialog, and the exploration
controls. `features` switches behaviors such as `overview`, `markers`, `magnetism`,
`preview`, `inertia`, `flight`, and `prefetch` (the full list is `defaultFeatures`); all
default on except `automaticAggregation`, and a disabled feature cannot be re-enabled by
a map option. Package entry points are listed in the
[package README](../granum-grid/README.md#entry-points). Custom controls, headless
layouts, and styling hooks are in [STYLING.md](../STYLING.md).

## Integration interface and AI demo

The library exposes `GranumGridApi<Row>` through `apiRef` on the component or `api` on `useGranumGrid`. It offers common actions plus the mounted provider and expert navigation controller:

```ts
interface GranumGridApi<Row> {
  scrollToIndex(index: number, options?: ScrollToOptions): void;
  zoomToRange(range: RowRange): void;
  back(): void;
  forward(): void;
  openSearch(query?: string): void;
  setSelection(range: RowRange | null): void;
  getView(): SavedView;
  restoreView(view: SavedView): void;
  readonly provider: DataProvider<Row>;
  /** Navigation methods; input and measurement adapters stay internal. */
  readonly controller: NavigationController;
}
```

```tsx
import { useRef } from 'react';
import { GranumGrid, type GranumGridApi, type DataProvider } from 'granum-grid';

function Explorer({ provider }: { provider: DataProvider<{ value: number }> }) {
  const api = useRef<GranumGridApi<{ value: number }>>(null);
  return (
    <>
      <button onClick={() => api.current?.scrollToIndex(0)}>First row</button>
      <GranumGrid
        provider={provider}
        apiRef={api}
        ariaLabel="Readings"
        renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
      />
    </>
  );
}
```

Use `api.current.openSearch(query)` for a prefilled dialog and `setSelection` for
contextual range tools. `getView`/`restoreView` capture and validate both navigation
and selection. Controlled selection still requires the host's `onSelectionChange`
update. Headless hosts render `JumpBar` for the search dialog. Provider reads and
expert controller navigation remain available. The ref updates with the mounted
provider/controller and becomes null on unmount. Read it at execution time rather
than retaining a handle across datasets. Provider reads preserve cancellation,
accuracy, and completeness. See the [array, HTTP, and controls recipes](QUICK_START.md).

AI schemas, prompts, validation, execution limits, and model connections belong to the application. The library ships no AI tool runtime or AI package entry. The example adapter and interactive **Try AI-callable tools** panel live in [demo/src/ai](../demo/src/ai/README.md). They demonstrate five tools through this public interface, with bounded results and explicit partial/estimated evidence. No live model is connected. A backend query may still be expensive even when the returned result is small.

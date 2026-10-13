# deepscroll: public API and workspace proposal

Status: implemented surface and API direction. README.md tracks current verification and limitations, including measured heights, exploration, full-page scrolling, and append-only updates.

## Design decisions

- Ship a ready-to-use React explorer and a hook for custom layouts, backed by a framework-independent engine.
- Make row count, asynchronous row fetching, and a row renderer sufficient for useful navigation. Add overview, chapters, markers, regional aggregates, and search as optional provider capabilities.
- Use fixed row height by default, with opt-in dynamic measurement. Keep rows and interactive summary bands as customizable DOM content; retain canvas for focus context and animated travel.
- Keep the dataset position independent of browser scroll height. Neither the engine nor the React viewport creates a dataset-height spacer.
- Keep the library independent of the demo's signal, timestamps, worker, and artificial latency.
- Give every address an explicit convention: API indices are zero-based, user-visible row numbers are one-based, and ranges are half-open `[start, end)`.

The current styling/composition contract is documented in [STYLING.md](./STYLING.md): optional skin, structural-only CSS, per-part classes/styles, replaceable toolbar/footer/rail, and a CSS-free headless hook. This supersedes the initial proposal’s styling surface.

## Ready-to-use component

```tsx
import { DeepScroll, type DataProvider } from 'deepscroll';
import 'deepscroll/styles.css';

type Reading = {
  timestamp: string;
  category: string;
  value: number;
};

// Define this outside render or memoize it. This example describes a host API.
const provider: DataProvider<Reading> = {
  id: 'sensor-readings',
  revision: 'snapshot-1',
  rowCount: 100_000_000,
  async fetchRows(start, count, signal) {
    const response = await fetch(`/api/readings?start=${start}&count=${count}`, {
      signal,
    });
    if (!response.ok) throw new Error('Could not load readings');
    return response.json(); // Validate the response in a production adapter.
  },
};

export function ReadingsExplorer() {
  return (
    <DeepScroll
      provider={provider}
      ariaLabel="Sensor readings"
      rowHeight={36}
      style={{ height: 640 }}
      renderRow={({ row, rowNumber }) => (
        <>
          <span role="gridcell">{rowNumber.toLocaleString()}</span>
          <span role="gridcell">{row.timestamp}</span>
          <span role="gridcell">{row.category}</span>
          <span role="gridcell">{row.value.toFixed(1)}</span>
        </>
      )}
    />
  );
}
```

`DeepScroll` includes the viewport, Atlas rail, Rows/Lens/Zoom selector, breadcrumb, Jump dialog, history buttons, and position readout. Sensible defaults include a 32 px row height, 600 px component height, Rows view, system theme, and system reduced-motion preference. All dimensions stay bounded by the actual viewport.

The library owns row wrappers, positioning, IDs, focus, `aria-rowindex`, and local loading/error states. `renderRow` only receives loaded data. Default placeholders use available aggregate information; applications can override their content without taking over loading geometry. Plain-text row renderers are wrapped as one grid cell; multi-cell renderers follow the gridcell contract shown above.

```ts
type View = 'rows' | 'lens' | 'zoom';

interface RowRenderContext<Row> {
  row: Row;
  index: number;       // zero-based integer
  rowNumber: number;   // index + 1
  focused: boolean;
}

interface DeepScrollProps<Row> {
  provider: DataProvider<Row>;
  renderRow(context: RowRenderContext<Row>): React.ReactNode;
  ariaLabel: string;
  rowHeight?: number;
  dynamicRowHeight?: boolean; // rowHeight becomes the estimate
  maxMeasuredRows?: number; // 4096; mounted rows may temporarily exceed the budget
  overscan?: number; // 2 per side in Rows/detail Zoom
  aggregateRowHeight?: number; // target summary height: component 120px, hook 4px
  renderAggregate?(context: AggregateRenderContext): React.ReactNode;
  formatRange?(range: RowRange): string; // domain labels for half-open ranges
  initialLocation?: NavigationLocation;
  controllerRef?: React.Ref<DeepScrollEngine>;
  apiRef?: React.Ref<DeepScrollApi<Row>>; // mounted provider and controller for host integrations
  getRowKey?(row: Row, index: number): React.Key;
  emptyContent?: React.ReactNode;
  initialIndex?: number;
  initialView?: View;
  theme?: 'system' | 'light' | 'dark';
  unstyled?: boolean;
  classNames?: Partial<Record<DeepScrollPart, string>>;
  styles?: Partial<Record<DeepScrollPart, React.CSSProperties>>;
  atlas?: AtlasRailOptions;
  layout?: 'embedded' | 'page'; // one page-mode explorer per document
  scrollMode?: 'embedded' | 'window'; // hook/custom layout; page implies window
  selection?: RowRange | null;
  initialSelection?: RowRange | null;
  onSelectionChange?(range: RowRange | null): void;
  exploration?: boolean; // true; range tools, comparison, bookmarks
  bookmarkStorageKey?: string; // opt-in localStorage persistence
  fullPageUrl?(view: SavedView): string; // host route, opened in a separate tab
  stickyChapters?: boolean; // false
  showStats?: boolean; // false
  followOutput?: boolean; // omitted = immutable snapshot; false = append without following
  renderToolbar?(scroll: DeepScrollState<Row>): React.ReactNode;
  renderFooter?(scroll: DeepScrollState<Row>): React.ReactNode;
  renderRail?(scroll: DeepScrollState<Row>): React.ReactNode;
  reducedMotion?: 'system' | boolean;
  features?: Partial<Features>;
  cache?: CacheOptions<Row>;
  renderPlaceholder?(slot: PendingRowSlot): React.ReactNode;
  onNavigate?(event: NavigationEvent): void;
  className?: string;
  style?: React.CSSProperties;
}
```

`initialIndex` and `initialView` are initialization values, not controlled props. Live external navigation goes through the hook/controller described below; avoid competing position state in the host and engine. Theme overrides also use documented CSS custom properties. The default rail remains visible in every view.

`AtlasRailOptions` configures presentation independently of navigation: `variant: 'profile' | 'markers'`, `axis: 'chapters' | 'rows'`, `axisLabel`, `title`, `showRange`, `showTracks`, `markerLabels: 'label' | 'number' | 'none'`, `layout: 'auto' | 'expanded' | 'compact'`, and `formatValue(value)`. Defaults are profile, chapters (falling back to rows), no range band, named events, and automatic compact layout below 650px. The map uses row order vertically and provider values horizontally; its position handle does not represent visible range. See [STYLING.md](./STYLING.md#configure-the-dataset-map) for semantics, scale, widths, and a complete example. The standalone `AtlasRail` accepts the configuration through `options`.

`initialLocation` takes precedence over `initialIndex`/`initialView`. The component's `controllerRef` and hook's `controller` expose `scrollToIndex(index, { align })`, `getLocation()`, `restore(location)`, and `resetMeasurements()`. Alignment supports `start`, `center`, `end`, and `auto` (default); it is immediate, enters Rows view, and follows new measurements until subsequent navigation. `goTo(index)` retains animated travel. Locations serialize address/view/scale, not cached data or measured heights, and must be scoped to a provider revision by the host.

Automatic measurement uses natural row border-box heights. `getRowProps` supplies the measurement ref for headless consumers. Width changes invalidate measurements; offscreen rows remain estimated until they mount. Row-address navigation and the global Atlas do not require measuring the entire dataset. Lens and detail Zoom use full-size measured content; coarse views summarize ranges.

## Data provider

```ts
interface DataProvider<Row> {
  id: string;
  revision: string;
  rowCount: number;
  metric?: {
    label: string;
    unit?: string;
    kind: 'value' | 'density';
    domain?: readonly [number, number];
  };

  fetchRows(start: number, count: number, signal: AbortSignal): Promise<Row[]>;
  fetchOverview?(buckets: number, signal: AbortSignal): Promise<Bucket[]>;
  fetchOverviewTracks?(buckets: number, signal: AbortSignal): Promise<OverviewTrack[]>;
  fetchAggregates?(range: AggregateRequest, signal: AbortSignal): Promise<Bucket[]>;
  fetchMarkers?(signal: AbortSignal): Promise<Marker[]>;
  fetchChapters?(signal: AbortSignal): Promise<Chapter[]>;
  search?(query: ProviderQuery, context: SearchContext): Promise<SearchResult>;
}

interface RowRange { start: number; end: number } // zero-based, half-open
interface OverviewTrack {
  id: string;
  label: string;
  buckets: Bucket[];
  metric?: DataProvider<unknown>['metric'];
}

interface AggregateRequest {
  start: number;
  end: number;
  buckets: number;
}

interface Bucket {
  start: number;
  end: number;
  count: number | null; // rows with valid metric values; null when unavailable
  avg: number | null;
  min: number | null;
  max: number | null;
  accuracy: 'exact' | 'estimated' | 'unavailable';
  label?: string;
}

interface Marker {
  id: string;
  index: number;
  label: string;
  kind: 'spike' | 'error' | 'search' | 'selection' | 'event';
  color?: string;
}

interface Chapter {
  id: string;
  start: number;
  end: number;
  label: string;
  breadcrumb?: readonly string[];
}
```

Provider rules:

- `rowCount` is a known, nonnegative safe integer. A dataset with zero rows has an explicit empty state and no active row. Unknown-length streams are outside the initial release.
- `id` identifies a dataset; `revision` identifies its stable ordered snapshot. Sorting, filtering, or changing existing rows requires a new revision. With `followOutput` explicitly set, append-only increases to a known row count keep the same revision and preserve all prior addresses; decreasing counts are rejected. A revision change clears source-dependent cache, history, trail, and searches and resets to the initial address, clamped to the new count.
- Page requests contain integer indices and at most the remaining row count. Return exactly the requested rows, in order, or reject. A short page inside an immutable snapshot is an error, not an implicit end of data.
- Buckets cover the requested range in order without overlap or gaps. Use explicit unavailable buckets for missing aggregate coverage. For zero valid values, count is zero and metric values are `null`. Unavailable coverage uses `null` for count and metrics. An estimated count shares the bucket's estimated accuracy; it is never the number of sampled rows.
- `buckets` is the maximum requested resolution; never return more buckets than requested or create empty index intervals. Every bucket refers to actual row-index boundaries.
- For `metric.kind = 'value'`, show mean and range; for density, show valid count per row-index span with an explicit label. A count-derived density across a uniformly populated index domain may be flat. A time-density chart needs a separate time-based coordinate model and is not implied by this API.
- When a metric domain is supplied, use it consistently. Otherwise establish the display domain from the global overview and keep it stable while exploring regional aggregates.
- Markers are a bounded set of display landmarks, and chapters are ordered, non-overlapping intervals with optional gaps. They are not an API for downloading millions of events. The demo supplies years/months and a small curated set of spikes; large event search uses the search capability.
- Abort signals are passed to all asynchronous work. Responses are also guarded by revision and request generation so ignored cancellation cannot restore stale data.

The two aggregate methods have distinct roles: `fetchOverview` supplies the permanent global rail; `fetchAggregates` supplies detail at the visible range and requested resolution. Without regional aggregates, Lens/Zoom can reuse the overview but must disclose its coarse resolution. They cannot imply newly computed detail. Without any overview, exact-row navigation still works with a neutral rail and address-based placeholders.

## Search without scanning the dataset in the component

```ts
type ProviderQuery =
  | { kind: 'date'; value: string }
  | {
      kind: 'predicate';
      field: string;
      operator: '>' | '>=' | '<' | '<=' | '=' | '!=';
      value: number | string;
    };

interface SearchContext {
  fromIndex: number;
  limit: number;
  signal: AbortSignal;
}

interface SearchResult {
  matches: Marker[];
  complete: boolean;
  message?: string;
}
```

The jump parser resolves row numbers, percentages, and next/previous known markers locally. For `50%`, the target is `Math.round(0.5 * (rowCount - 1))`. It validates one-based row input before converting to an index. Dates accept documented ISO year/month/day forms; predicates use the operators above. This grammar is deliberately bounded and does not require an AI service.

Date and predicate queries go to `search`, with a default limit of 100 results. Providers validate supported fields/operators and return exact matching addresses. `complete: false` means the returned matches are not exhaustive; sampled candidate locations cannot be presented as verified matches. `message` is rendered as text, never HTML. No library fallback walks 100 million rows.

Partial results remain navigable and are labeled. A fulfilled empty, incomplete result must not be displayed as “No matches.” A provider without search gets a clear unsupported-query response while exact row and percentage jumps continue to work.

## Custom React layouts

```tsx
import { AtlasRail, useDeepScroll } from 'deepscroll';
import 'deepscroll/base.css';

function CustomExplorer({ provider }: { provider: DataProvider<Reading> }) {
  const scroll = useDeepScroll({ provider, rowHeight: 36, features: { flight: false, automaticAggregation: false } });

  return (
    <section>
      <button onClick={() => scroll.controller.goTo(73_499_999)}>
        Go to row 73,500,000
      </button>
      <div className="explorer-layout">
        <div {...scroll.getViewportProps({ 'aria-label': 'Sensor readings' })}>
          {scroll.rows.map(slot => (
            <div key={slot.index} {...scroll.getRowProps(slot)}>
              <span role="gridcell">
                {slot.status === 'ready' ? slot.row.value : 'Loading…'}
              </span>
            </div>
          ))}
        </div>
        <AtlasRail scroll={scroll} ariaLabel="Dataset position" />
      </div>
      <div {...scroll.getAnnouncementProps()} />
    </section>
  );
}
```

The host supplies a bounded-height layout in the headless example. `getViewportProps` attaches the measured viewport ref, focus semantics, and input bindings; `getRowProps` supplies row position, dimensions, and absolute indices. Callers pass classes, styles, and handlers through these getters. Spread the returned props to retain the internal viewport and measurement refs. The announcement props own a visually hidden, polite live region.

The hook exposes a stable controller, immutable navigation snapshot, bounded visible row slots, and data statistics. Slots are discriminated unions: ready slots contain `row`; loading and error slots contain optional aggregate estimates, and error slots have retry information. Placeholder estimates never masquerade as `Row` objects.

`AtlasRail` reuses this hook instance and its cache; it does not create a second engine. Preview rendering has a compact default showing row addresses, with an optional `renderPreviewRow` prop for domain-specific content.

## Controller and framework-independent engine

```ts
interface NavigationLocation {
  position: number;       // zero-based floating focus address
  view: View;
  rowsPerPixel: number;   // user-selected Zoom scale
}

interface NavigationSnapshot extends NavigationLocation {
  rowCount: number;
  activeIndex: number | null;
  progress: number;       // 0..1; zero for empty and single-row datasets
  canGoBack: boolean;
  canGoForward: boolean;
  moving: boolean;
  targetIndex: number | null; // destination while an animated jump is in progress
  backLocation: NavigationLocation | null;
}

interface NavigationController {
  goTo(index: number, options?: {
    motion?: 'auto' | 'instant';
    history?: 'record' | 'skip';
  }): void;
  back(): void;
  forward(): void;
  setView(view: View): void;
  setZoom(rowsPerPixel: number, anchorY?: number): void;
  nextMarker(kind?: Marker['kind']): void;
  previousMarker(kind?: Marker['kind']): void;
  nextChapter(): void;
  previousChapter(): void;
  cancel(): void;
  appendRows(rowCount: number, follow?: boolean): void;
}

interface NavigationEvent {
  from: NavigationLocation;
  to: NavigationLocation;
  reason: 'jump' | 'scrub' | 'marker' | 'chapter' | 'history' | 'keyboard' | 'lens';
}
```

`goTo` accepts an integer index, defaults to an animated-or-immediate jump based on distance and reduced motion, and records history by default. Clamp out-of-range finite indices and reject nonintegers/NaN. Continuous input uses the engine's float position. `onNavigate` fires after committed navigation, not on every animation frame. Custom integrations subscribe to snapshots for continuous movement.

The `deepscroll/core` entry exports `createEngine`, shared navigation types, and pure mapping functions. It has no React, DOM, canvas, or network imports. The engine exposes controller methods plus `getSnapshot`, `subscribe`, `setViewport`, normalized pixel-pan/scrub methods, metadata updates, `step(timestamp)`, and `destroy`. It receives numeric dimensions and normalized input rather than browser event objects.

Browser adapters convert wheel/touch/keyboard events and drive `step` with requestAnimationFrame. A test can supply dimensions and deterministic timestamps without a browser. Snapshots retain reference identity until changed, allowing React to subscribe through `useSyncExternalStore`. DOM listeners, resize observers, animation frames, and requests are cleaned up on unmount and tolerate Strict Mode setup/cleanup.

Only the data layer fetches or caches. Only the visual layer draws. Rows, Lens, and Zoom share the same position/history state and independently tested invertible mappings.

## Saved views, ranges, and layout

```ts
interface SavedView {
  version: 1;
  dataset: string;
  revision: string;
  location: NavigationLocation;
  selection: RowRange | null;
}
interface Bookmark extends SavedView { id: string; name: string }
encodeView(view: SavedView): string;
decodeView(text: string, provider: { id: string; revision: string; rowCount: number }): SavedView | null;
rangeProvider<Row>(provider: DataProvider<Row>, range: RowRange): DataProvider<Row>;
```

Saved views contain no row payloads. `decodeView` rejects malformed, oversized, out-of-range, or mismatched dataset/revision input. Use `initialLocation` and `initialSelection` to restore. The library does not install a router or rewrite host URLs. `fullPageUrl` renders a normal new-tab link; the demo's full-page route also updates its hash for reload/share. The host chooses that persistence policy.

`layout="page"` fixes the component to the viewport and maps native window scrolling to global dataset progress, matching Atlas. The document scroll range is capped at one million CSS pixels; dragging its scrollbar or calling `window.scrollTo`/`scrollBy` navigates that compressed global range. Wheel input, touch panning over rows, and keyboard steps pan the engine in local pixels and synchronize the native position without rounding the engine's row address. Native dragging is approximate for large datasets; Go to and the controller APIs provide exact addresses. Mount only one such explorer in a document, outside transformed ancestors. Cleanup removes the spacer/listeners and restores the prior scroll-restoration setting. The headless `scrollMode: 'window'` expects the host to provide equivalent fixed viewport geometry.

Range controls use one-based inclusive fields but emit half-open zero-based indices. The hook exposes `selection`, `setSelection`, `selectionMode`, and `setSelectionMode`. Range summaries request one aggregate bucket and disclose provider accuracy. Comparison wraps the provider with `rangeProvider` and uses independently bounded virtual panes; linked scrolling synchronizes relative progress. It does not align by time or join records. `bookmarkStorageKey` enables local storage (40 bookmarks maximum); failures fall back to the current session.

`followOutput` opts into append-only provider updates: `true` follows only from the end of List view; `false` retains position. Complete cached pages and sparse measurements survive growth, while a partial final page is refreshed. `unseenRows` reports appends while away from the end; the default component provides Jump to latest. Unknown lengths, prepends, edits and reordering require another contract/revision.

`fetchOverviewTracks` returns up to four uniquely identified profiles of at most 160 contiguous buckets each, on the same row coordinate system. `atlas.showTracks` displays them; each can define its own metric/domain. Markers remain capped at 4,096 metadata entries and are grouped into 28-pixel screen bins; clicking a group opens a searchable list of 40 events per page.

## Features, cache, and diagnostics

`Features` has optional switches for overview, chapters, markers, magnetism, magnifier, precision, preview, trail, inertia, edge elasticity, automatic aggregation, flight, transitions, progressive estimates, prefetch, and hints. Features default on except `automaticAggregation`, which is opt-in, subject to provider capabilities and reduced motion. The demo Developer tools controls those same switches; it does not maintain a separate behavior implementation. Unimplemented features are not advertised as available during earlier phases.

```ts
interface CacheOptions<Row> {
  maxBytes?: number;                     // default: 32 MiB
  pageSize?: number;                     // default: 256 rows
  requestTimeoutMs?: number;             // default: 15,000 ms; row-request deadline
  estimateRowBytes?(row: Row): number;    // fallback: documented heuristic
}
```

Cache statistics distinguish estimated bytes from exact heap measurements. The byte budget includes cached pages and cached aggregate/marker/chapter metadata; snapshots reference existing entries rather than duplicating them. Temporary request buffers and caller-owned row objects are reported as outside the enforceable cache budget. Visible pages may temporarily exceed it, and the excess is exposed explicitly.

The hook reports cached rows, estimated cached bytes, budget overage, active row/metadata/search requests, and aborted requests. The demo measures frame rate during motion separately. At most four useful row requests run concurrently; visible rows outrank previews and predicted-stop prefetch. Aborted requests immediately release a useful slot, but remain counted until the provider settles them. A hard cap of eight physical unsettled row requests prevents unlimited transport growth when cancellation is ignored. Reaching it exposes a retry error; a deadline also aborts and exposes a retry state. Late results are discarded. Providers must propagate `AbortSignal` into their transport. Coalesce desired ranges before dispatch and drop stale queued work. Cancellation of one preview consumer must not abort a shared page still needed by visible rows.

Default page size, memory budget, concurrency, animation durations, and precision thresholds are starting values to verify during implementation, not published performance guarantees.

## Workspace and package output

```text
vit-scroll-lib/
  DESIGN.md
  API.md
  README.md
  package.json                 # private; workspaces: ["deepscroll", "demo"]
  package-lock.json
  tsconfig.base.json
  playwright.config.ts
  .gitignore
  deepscroll/
    package.json
    tsconfig.json
    src/
      index.ts                 # React public API and shared public types
      styles.css
      core/
        index.ts
        engine.ts
        mappings.ts
        history.ts
        navigation.ts
      data/
        index.ts
        types.ts
        cache.ts
        scheduler.ts
        session.ts
      visuals/
        atlas.ts
        lens.ts
        zoom.ts
      react/
        useDeepScroll.ts
        DeepScroll.tsx
        AtlasRail.tsx
        JumpBar.tsx
        input.ts
    tests/
      mappings.test.ts
      engine.test.ts
      cache.test.ts
      scheduler.test.ts
      navigation.test.ts
  demo/
    package.json
    index.html
    tsconfig.json
    vite.config.ts
    src/
      main.tsx
      App.tsx
      styles.css
      Playground.tsx
      data/
        signal.ts
        provider.ts
        aggregates.worker.ts
        worker-client.ts
    tests/
      acceptance.spec.ts
      interactions.spec.ts
      performance.spec.ts
```

Root scripts:

| Command | Responsibility |
| --- | --- |
| `npm run dev` | Start the Vite demo with the library resolved from source. |
| `npm run build` | Build ESM and declarations, then typecheck/build the demo. |
| `npm test` | Run deterministic core/data unit tests. |
| `npm run test:e2e` | Run the browser acceptance and interaction checks. |
| `npm run test:perf` | Run explicit performance scenarios and report measurements. |

Public package entries are `deepscroll`, `deepscroll/core`, `deepscroll/data`, `deepscroll/base.css`, and `deepscroll/styles.css`. ESM and `.d.ts` files are built with TypeScript; generated module specifiers must resolve without the demo's alias. CSS is copied to the distributable and declared as a side effect. Internal source paths are not package exports.

`DeepScrollApi<Row>` is exported from `deepscroll` and contains the current `provider: DataProvider<Row>` and `controller: DeepScrollEngine`. Access it through the component's `apiRef` or the hook's `api` value. Refs follow provider/controller changes and clear on unmount. AI tool schemas, dispatch, budgets, and model integration live in application code; the working example is under `demo/src/ai`. See [Integration interface and AI demo](./README.md#integration-interface-and-ai-demo).

React and React DOM are peer dependencies. The implementation plan requires no additional runtime dependencies. Proposed development tools are TypeScript, Vite with its React plugin, Vitest, and Playwright. No grid library, animation framework, charting package, or DuckDB-WASM is needed for this scope. Package-name availability and publication remain separate from creating this local workspace.

The demo imports the library by name with explicit Vite source aliases for package entries. Verification also includes an ESM import/type smoke check against the built package so source aliases cannot hide a broken distribution.

## Build phases after approval

1. Engine and Rows at 100M addresses, basic Atlas rail, exact indices, runnable synthetic demo, mapping/input tests.
2. Provider/session, bounded page cache, cancellation, local failures, progressive placeholders, worker overview, latency control.
3. Full Atlas overview, chapters, magnetic markers, drag labels, magnifier, precision, and real-row previews.
4. Fly-to, reversible history, Jump/search, keyboard and accessibility behavior; the five acceptance scripts.
5. Lens and Zoom mappings, regional aggregates, pinch/zoom, and view transitions that preserve the focus address.
6. Speed-dependent aggregation, visited trail, hints, full Playground, themes/responsive polish, and browser/performance validation.

Each phase ends with an appropriate check and commit while leaving the demo runnable. Browser sessions are headless unless requested otherwise, named/reused per task, and explicitly closed. A browser launched in code is closed in `finally`.

Approval of this proposal authorizes the six implementation phases. Further questions are reserved for material changes to the agreed design or dependencies, as requested in the brief.

## Meaningful zoom and range inspection

When a provider supplies `fetchAggregates`, the ready-made component displays bounded,
interactive summary bands in Overview. Each band exposes **Zoom into range**, **Inspect
these rows**, and **Select**. Accuracy remains visible even with a custom renderer. The
library does not fetch all rows to construct these summaries. While a new range loads,
stale summaries are replaced with a loading state. Providers without regional aggregates
keep the canvas overview and the global Inspect rows action.

```tsx
<DeepScroll
  provider={provider}
  ariaLabel="Readings"
  aggregateRowHeight={140}
  formatRange={({ start, end }) => `Readings ${start + 1}–${end}`}
  renderAggregate={({ bucket, visibleRange, rowsPerPixel }) => (
    <p>{bucket.end - bucket.start} readings · peak {bucket.max ?? 'unavailable'}</p>
  )}
  renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
/>
```

`AggregateRenderContext` is exported from `deepscroll` and contains `bucket: Bucket`,
`visibleRange: RowRange`, and `rowsPerPixel: number`. Hosts can choose different content
at different scales, using the same provider summary contract. Keep renderers synchronous
and cheap; expensive domain summaries belong in the provider. `formatRange` must handle
any valid range in the current provider revision. It describes the range, not a claim
that its row addresses form a uniform time axis.

`controller.zoomToRange({ start, end })` validates a nonempty half-open range, enters
Overview, fits it to the viewport, and records the previous location once. An active fit
adapts when the viewport changes size; panning or another navigation releases that fit.
`scrollToIndex(start, { align: 'start' })` inspects rows and also records the prior scale.
Back and Forward therefore support drilling into a range and returning to its context.

The headless hook also exposes `visibleRange` and `aggregateBuckets`. Its default
aggregate resolution remains suitable for canvas rendering; set `aggregateRowHeight`
when building larger custom summary bands. Requests remain capped at 160 buckets.

Selected ranges expose a compact Inspect / Compare / Bookmark action bar. Compare pins
the first range as A; selecting another range enables comparison with A. Detailed range
entry, summaries, and saved bookmarks remain available under Explore.

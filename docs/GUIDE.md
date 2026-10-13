# deepscroll integration guide

[← Library overview](../README.md) · [Media studio](../media/README.md)

An overview-first React + TypeScript explorer for indexed datasets too large to fit in a browser. The demo navigates 100 million deterministic readings without allocating 100 million rows.

```sh
npm install
npm run dev
```

The Vite demo prints its local URL. To select a port explicitly:

```sh
npm run dev -w demo -- --port 5187
```

## Library usage

```tsx
import { DeepScroll, type DataProvider } from 'deepscroll';
import 'deepscroll/styles.css';

type Reading = { value: number };
const provider: DataProvider<Reading> = {
  id: 'readings',
  revision: 'snapshot-1',
  rowCount: 100_000_000,
  async fetchRows(start, count, signal) {
    const response = await fetch(`/api/readings?start=${start}&count=${count}`, { signal });
    if (!response.ok) throw new Error('Could not fetch readings');
    return response.json(); // Validate your server's response in this adapter.
  },
};

export function Explorer() {
  return <DeepScroll provider={provider} ariaLabel="Readings" rowHeight={36}
    renderRow={({ row, rowNumber }) => <>
      <span role="gridcell">{rowNumber.toLocaleString()}</span>
      <span role="gridcell">{row.value}</span>
    </>}/>;
}
```

Memoize providers or define them outside render. All API indices are zero-based; user-facing row numbers are one-based. `fetchRows` returns exactly the requested, ordered rows. Sorting, filtering, or changing existing rows requires a new `revision` and resets navigation/cache state. Append-only growth can preserve state with `followOutput`. A known row count is required.

## Dynamic heights and standard list APIs

Enable **Dynamic row heights** above the demo to try wrapped notes, expansion, scroll alignment, and save/restore at 100 million rows.

```tsx
import { useRef } from 'react';
import { DeepScroll, type DeepScrollEngine } from 'deepscroll';

function Notes() {
  const controller = useRef<DeepScrollEngine>(null);
  return <>
    <button onClick={() => controller.current?.scrollToIndex(73_499_999, { align: 'center' })}>
      Find row 73,500,000
    </button>
    <DeepScroll provider={provider} ariaLabel="Notes" controllerRef={controller}
      dynamicRowHeight rowHeight={80} overscan={3} maxMeasuredRows={4096}
      renderRow={({ row }) => <div role="gridcell" style={{ padding: 12 }}>{row.value}</div>}
    />
  </>;
}
```

With `dynamicRowHeight`, `rowHeight` is the estimate for unloaded/unmeasured rows. One `ResizeObserver` measures the border boxes of loaded DOM rows and batches corrections. Wrapping, expansion, and late content changes are measured automatically. Use padding inside rows rather than external vertical margins; margins are not part of a measured border box. In a headless layout, spread `getRowProps(slot)` on the actual row element, including its measurement `ref`, and do not impose a fixed height on that element.

The engine keeps a sparse cache of measured heights, not an array of 100 million sizes. `maxMeasuredRows` defaults to 4,096; mounted rows are retained even when this temporarily exceeds a very small configured budget. `onStats.measuredRows` reports the count separately from the row-data byte estimate. A width change clears old width-dependent measurements and remeasures mounted content. Provider identity/revision changes create a fresh measurement cache. Hosts can call `resetMeasurements()` when offscreen content or typography changes.

Rows retain the leading row address and pixel offset while content changes, clamping the offset if the anchor row becomes shorter. Lens retains full-size measured focus rows; detail Zoom also uses natural heights. Coarse Zoom and the Atlas rail remain row-address based, so no global pixel-height claim depends on unseen rows.

- `overscan`: extra rows before and after the viewport in Rows/detail Zoom; default 2, allowed 0–1,000. Lens renders its focus band.
- `controllerRef`: imperative access on the component. The hook exposes the same engine as `controller`.
- `scrollToIndex(index, { align: 'start' | 'center' | 'end' | 'auto' })`: shows the Rows view and aligns the target. Default `auto` leaves an already-visible row in place. New measurements maintain alignment until another navigation input. Boundary clamping and rows taller than the viewport can prevent full alignment. Aligned jumps are immediate; `goTo(index)` retains the animated exploration behavior.
- `getLocation()` / `restore(location)` / `initialLocation`: save and restore row address, view, and zoom. A location does not contain cached data or measurements; restore against the same dataset revision. Offscreen estimates can reflow on remount.
- `getRowKey(row, index)`: optional stable React key for loaded rows. Keep keys unique; the default is the row index. Expansion/selection state that must survive virtualization belongs in the host application.
- `emptyContent`: optional custom empty state. Existing row placeholders/retries and fixed column-heading slot remain available.

| Capability | Current support |
| --- | --- |
| Fixed and automatically measured row heights | Yes, including resize and expandable content |
| Overscan, exact index navigation, alignment, restoration | Yes |
| Keyboard navigation, ARIA row addresses, reduced motion | Yes; screen-reader user testing remains outstanding |
| Headless hook, custom rows/keys, empty/loading/error content | Yes |
| Remote paging, cancellation, prefetch, bounded caching | Yes |
| Server rendering | Deterministic placeholder markup verified; DOM measurement begins on the client |
| Sorting and filtering | Provider responsibility: return a new ordered revision and row count |
| Chapter heading and range selection | Optional persistent chapter heading; range selection and comparison |
| Append-only growth and follow-output | Supported with a known, increasing count; prepend and unknown-length streams remain unsupported |
| Separate tab and full-page scrolling | Host route via `fullPageUrl`; native window scrolling with `layout="page"` |
| Bookmarks and shareable views | Versioned, dataset-scoped views; optional local storage |
| Horizontal/column virtualization and RTL scrolling | Not implemented |
| Column resizing/pinning/reordering and editing | No built-in grid layer; host-managed content can provide controls |

This is a large-dataset explorer with an expanding virtual-list API, not full feature parity with every virtualizer or data grid.

The default component is 600 px tall. Set `style` or `className` to give it another bounded height. The embedded view has no dataset-height spacer. Page layout maps a bounded native document scroll range to global dataset progress. A floating row index drives a bounded set of DOM rows.

## Navigation

- Drag the right-hand Atlas rail to travel across the dataset. Move horizontally away while dragging for half, quarter, or fine precision. Shift bypasses magnetic markers. Escape cancels a scrub.
- Use **Go to…**, Cmd/Ctrl+K inside the component, or `/` in the viewport. Try `73,500,000`, `50%`, `2017-03`, `next spike`, or `value > 120`.
- Arrows move one row; PageUp/PageDown move a visible span; Home/End reach the endpoints. N/P visit markers. Cmd/Ctrl+Up/Down visit chapter boundaries.
- Back/Forward and Alt+Left/Right restore committed jumps. Wheel motion is not a history entry. Mouse back/forward interception depends on the browser.
- **List** is the default. **Focus + context** (API: `lens`) keeps a full-size focus with logarithmic surrounding context. **Overview** (API: `zoom`) changes continuously between aggregate bands and exact rows; use the controls, touch pinch, or Ctrl+wheel over the focused viewport.
- Reduced motion follows the system preference or `reducedMotion={true}`. The component retains direct navigation while suppressing flights, touch inertia, elastic edges, and automatic speed zoom.

## Explore, compare, and save

Open **Explore** to select visible rows, enter a first/last row, or drag a range on the dataset map. Selection stays separate from your current position. The panel shows a provider-backed summary with its exact/estimated/unavailable status; it never scans the whole dataset. **Use as comparison A**, select another range, then **Compare A with selection** opens two virtualized panes. Linked scrolling matches relative progress through the two ranges, not timestamps or record identity.

Bookmarks save the current location, view, zoom, and selection. They remain in memory unless the host supplies `bookmarkStorageKey`; the demo opts into local storage. Up to 40 named bookmarks are kept. Restore validates the dataset ID, revision, and row bounds. A blocked/full browser store leaves bookmarks usable for the current session.

`selection`, `initialSelection`, and `onSelectionChange` support controlled or internal range state. API ranges are zero-based and half-open (`{ start: 99, end: 200 }` selects rows 100–200). Set `exploration={false}` to hide these controls. `stickyChapters` keeps the current provider chapter above the rows. Normal navigation shows **Back**, a **View** menu, and **Go to…**; diagnostics are under **Developer tools** in the demo or enabled by `showStats` in the component. Automatic aggregation while scrolling is opt-in with `features={{ automaticAggregation: true }}`.

## Open in a separate tab and scroll the window

The demo's **Open full page** link opens the same location and selected range in a separate tab. Its URL updates while navigating and restores after reload. **Back to normal view** returns to the embedded demo in that tab, keeping the dataset, position, view, selection, and current debug settings. **Debug** is available in both layouts and opens a dialog to configure simulated server latency from 0–2,000 ms; changes apply to new requests while cached rows remain instant. For a host application, add a route that renders one `DeepScroll` with `layout="page"`, then pass a URL builder to the embedded instance:

```tsx
import { encodeView, decodeView } from 'deepscroll';

// Embedded instance:
<DeepScroll {...props}
  fullPageUrl={view => `/explorer?page=1#view=${encodeView(view)}`}
/>;

// In the client-side full-page route, using the same provider:
const view = decodeView(location.hash.replace(/^#view=/, ''), provider);
<DeepScroll {...props} layout="page"
  initialLocation={view?.location} initialSelection={view?.selection}
/>;
```

The library owns the full viewport in page mode. Mount one page-mode explorer per document, outside ancestors with transforms that establish fixed-position containing blocks. The native scrollbar and dataset map show the same global progress: dragging either halfway reaches the middle of the dataset. The document scroll range is capped at one million CSS pixels, so native scrollbar dragging is approximate for very large datasets. Wheel input, touch panning over the rows, and keyboard steps retain precise local movement; Go to selects an exact row. Native `window.scrollTo`/`scrollBy` offsets use the compressed global range. Listeners and the spacer are removed on unmount. The headless hook exposes `scrollMode: 'window'` for custom full-page layouts; the host supplies the fixed viewport.

## Append-only live feeds

Pass `followOutput={true}` and replace the provider with a larger known `rowCount`, preserving its ID, revision, and all previous rows/addresses. Cached complete pages and measurements are retained; the old partial final page is refreshed. Growth follows only when the List view is already at the end. Reading earlier rows keeps the current address and shows a new-row count with **Jump to latest**. `followOutput={false}` opts into append updates without automatic following. Omit the prop for immutable snapshot behavior. Changed/reordered/deleted rows still need a new revision. Expand **Try a live feed** in the demo to start and pause generated events.

## Provider capabilities

The **Dataset map** separates row order (vertical), mean signal (horizontal), named events, and the current-row indicator. Open **Map settings** to switch between the signal profile and events only, choose years or row numbers, change event labels, use a compact width, or show the sampled min–max band. The question-mark button explains the encoding, and hovering shows the summarized row range and value.

In this demo, the map has 320 groups of 312,500 rows. The worker uses 64 evenly spaced samples per group to estimate its mean, minimum, and maximum. These are sampled summaries, not a scan of all 100 million readings. The position handle has a fixed size and does not represent the visible fraction of the dataset.

Applications configure the same presentation through `atlas: AtlasRailOptions` on `DeepScroll` or `options` on `AtlasRail`. See [map configuration and styling](../STYLING.md#configure-the-dataset-map).

Only `id`, `revision`, `rowCount`, and `fetchRows` are required. Optional capabilities progressively enrich the explorer:

| Capability | Purpose |
| --- | --- |
| `fetchOverview(buckets, signal)` | Global profile and informative loading estimates. |
| `fetchAggregates({ start, end, buckets }, signal)` | Regional detail, selection summaries, and comparison. |
| `fetchOverviewTracks(buckets, signal)` | Up to four additional profiles sharing the same row addresses; enable with `atlas={{ showTracks: true }}`. |
| `fetchMarkers(signal)` | A bounded set of named events and snap targets. |
| `fetchChapters(signal)` | Ordered non-overlapping index ranges and breadcrumbs. |
| `search(query, { fromIndex, limit, signal })` | Date and predicate queries performed by your provider. |

Buckets are contiguous half-open ranges. They carry count, mean, min, max, and `accuracy: 'exact' | 'estimated' | 'unavailable'`. A missing value is null, not zero. Metadata is bounded: 320 global buckets, 160 requested regional buckets, up to four 160-bucket tracks, and at most 4,096 markers or chapters. Nearby events are clustered by screen space; a searchable, paged dialog exposes individual events. The visible range and selected range have separate map indicators. Regional requests are debounced. No provider search falls back to a browser scan of the entire dataset.

`complete: false` search results are explicitly partial. The demo verifies matches among a bounded sample, while date lookup is direct. Its aggregate means/minima/maxima are sampled and labeled accordingly. The data describes a synthetic signal, not observations from a real sensor.

The default page cache uses 256-row pages, a 32 MiB estimated budget, and at most four useful concurrent row fetches. Canceled transports release scheduling slots immediately, with a hard ceiling of eight unsettled row transports. Providers must honor `AbortSignal`; an uncooperative provider can exhaust that ceiling and exposes a retry state. Row requests have a 15-second deadline; late responses cannot populate the cache. Configure `cache={{ maxBytes, pageSize, estimateRowBytes, requestTimeoutMs }}` for your row shape. Provide an estimator for large rows: the default heuristic is 256 bytes per row and cannot measure retained JavaScript heap. Cache stats include estimated metadata size; request buffers and caller-owned data are outside this estimate. Visible pages may temporarily exceed the budget, and `budgetOverage` reports that condition.

## Styling without a prescribed UI

The demo uses a restrained light/dark theme; your application can use any design system. The library has no CSS-framework dependency and imports no styles automatically.

- Import `deepscroll/styles.css` for the optional default skin, or `deepscroll/base.css` for layout only.
- Set `unstyled` to skip the skin on an individual instance, even if the full stylesheet is loaded.
- Use `classNames` and `styles` for individual parts, plus `--ds-*` tokens and ordinary `className`/`style` on the root.
- Supply `renderToolbar`, `renderFooter`, or `renderRail` to use your own React controls. Return `null` to hide a region.
- Use `toolbarActions` to append host controls to the built-in toolbar.
- Use `useDeepScroll` with no CSS import to own the entire layout. Its prop getters provide the required positioning and measurement hooks.

Styles use a low-priority `deepscroll` layer and zero-specificity selectors. The default skin only styles library-owned controls, leaving caller-rendered buttons and inputs alone. For CSS Modules, utility-class, custom-control, and headless examples, see [STYLING.md](../STYLING.md) or expand **Use it in your app** in the demo.

## Composition and packaging

- `deepscroll`: `DeepScroll`, `useDeepScroll`, `AtlasRail`, feature defaults, and public types.
- `deepscroll/core`: React-free engine and pure mapping/navigation functions. The caller drives animations with `step(timestamp)`.
- `deepscroll/data`: provider types, page cache, and data session.
- `deepscroll/base.css`: structural layout without a visual skin.
- `deepscroll/styles.css`: optional skin with `--ds-*` CSS variables (includes base layout).

`useDeepScroll` supplies the controller, snapshot, visible row slots, viewport/row prop getters, announcements, session, and statistics. It performs fetching and browser input binding; custom layouts choose their own row content and arrange the rail. `onNavigate` reports committed jumps; `onStats` reports cache/request counts and measured frame rate. The ready-made component handles the visual views, Go to dialog, and optional exploration controls. `encodeView`/`decodeView` serialize validated saved views; `rangeProvider(provider, range)` creates an indexed subrange without materializing rows.

The library builds to ESM and declarations, with React/React DOM as peer dependencies and no additional runtime dependencies. The demo resolves `deepscroll` from source for hot reload. This local working package has not been published to npm.

## Integration interface and AI demo

The library exposes `DeepScrollApi<Row>` through `apiRef` on the component or `api` on `useDeepScroll`. It pairs the mounted provider with its navigation controller:

```ts
interface DeepScrollApi<Row> {
  readonly provider: DataProvider<Row>;
  readonly controller: DeepScrollEngine;
}
```

```tsx
import { useRef } from 'react';
import { DeepScroll, type DeepScrollApi, type DataProvider } from 'deepscroll';

function Explorer({ provider }: { provider: DataProvider<{ value: number }> }) {
  const api = useRef<DeepScrollApi<{ value: number }>>(null);
  return <>
    <button onClick={() => api.current?.controller.scrollToIndex(0)}>First row</button>
    <DeepScroll provider={provider} apiRef={api} ariaLabel="Readings"
      renderRow={({ row }) => <span role="gridcell">{row.value}</span>} />
  </>;
}
```

Host integrations can call `api.current.provider.fetchRows`, optional `search`/`fetchAggregates`, and controller navigation. The ref updates with the mounted provider/controller and becomes null on unmount. Read it at execution time rather than retaining a handle across dataset changes. `controllerRef` remains available for navigation-only integrations. All indices are zero-based and ranges are half-open. Provider calls retain their existing cancellation, accuracy, and completeness contracts.

AI schemas, prompts, validation, execution limits, and model connections belong to the application. The library ships no AI tool runtime or AI package entry. The example adapter and interactive **Try AI-callable tools** panel live in [demo/src/ai](../demo/src/ai/README.md). They demonstrate five tools through this public interface, with bounded results and explicit partial/estimated evidence. No live model is connected. A backend query may still be expensive even when the returned result is small.

## Verification

```sh
npm run build
npm test
npm run test:package
npx playwright install chromium firefox webkit
npm run test:e2e
npm run test:perf
```

Unit tests cover coordinate round trips, Lens derivatives, endpoints, cache eviction, cancellation races, history, and query parsing. Browser tests exercise the acceptance tasks, navigation across views, and interaction regressions. Playwright runs headless, one worker at a time, and closes its browser fixtures. Interactive CLI checks use one named session and explicitly close it.

Browser automation cannot establish that a first-time user understands the overview in two seconds or discovers Spike 3 unaided in ten seconds. Those human acceptance checks remain outstanding. WebKit coverage does not establish verification in the installed Safari application. Frame-rate results are measurements on the test machine, not a 60fps guarantee across devices or real remote providers.

The optional DuckDB-WASM/local CSV or Parquet import is not included. Unknown-length streams, built-in editing/sorting controls, and live revision reconciliation remain outside the implemented surface.

## Frontend CI/CD

[Frontend CI/CD](../.github/workflows/frontend.yml) uses GitHub Actions and deploys the static demo to GitHub Pages. Node.js 22 is selected through [`.nvmrc`](../.nvmrc); dependencies are installed with `npm ci` from the committed lockfile.

Every branch push and pull request runs unit tests, TypeScript checks, the library/demo production build, package/consumer checks, and the existing Chromium, Firefox, and WebKit tests. In CI, Playwright serves `demo/dist` with Vite preview, rejects `test.only`, retries failures twice, and uploads the browser report and failure traces for 14 days. It closes its browser fixtures and preview server when finished.

Only a successful run on the repository's default branch deploys. The deploy job publishes the same `demo/dist` artifact that passed verification, with Pages/OIDC write permissions confined to that job. Pull requests and other branches never deploy. Relative asset and home links support both project paths (for example `/vit-scroll-lib/`) and domain-root hosting; the demo's query/hash URLs need no server-side routing fallback.

### Enable deployment

1. Push this workspace, including the workflow and lockfile, to a GitHub repository. This checkout currently has no Git remote configured.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source. See [GitHub's Pages setup instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
3. In **Settings → Environments → github-pages**, allow deployments from the default branch. For protected merges, require the **Verify frontend** status check in the default branch's ruleset.
4. Push to the default branch or run **Actions → Frontend CI/CD → Run workflow** with that branch selected. The deployment URL appears in the workflow's `github-pages` environment.

No deploy token or other repository secret is required. For a failed deployment, inspect the deploy log and verify the Pages source and environment branch rules. To roll back, revert the unwanted commit on the default branch; the same checks run before publishing the replacement. Hosting activation and the first remote workflow run remain to be verified after connecting a repository.

To reproduce the CI checks locally (use `nvm use` first if you use nvm):

```sh
npm ci
npm test
npm run build
npm run test:package
npx playwright install chromium firefox webkit
CI=1 PLAYWRIGHT_PORT=5188 npm run test:e2e
```

Use an unused `PLAYWRIGHT_PORT` when a development server is already running. `npm run test:e2e` without `CI` retains the normal development-server workflow. To inspect the production frontend manually, run `npm run preview -w demo -- --port 5188 --strictPort` after building.

## Local verification snapshot — 13 October 2026

- Production build, 44 unit tests (32 library and 12 demo), built ESM/SSR checks, and the standalone consumer TypeScript check passed.
- Demo-owned AI tools are tested separately from the library. Package checks verify the public `DeepScrollApi` consumer types and that the removed tool runtime is absent from package exports and generated output. A live model connection remains outside this example.
- The AI tools demo passed a headless Chromium flow covering all five calls, rejected oversized reads, partial search, estimated summaries, controller replacement, and switching from signal to genome. Desktop/light and mobile/dark screenshots are under `output/playwright/ai-tools-interface/`; no browser errors were observed. The named browser session was closed afterward.
- All 55 distinct browser cases passed across the final suite and focused rerun. Coverage includes Chromium, Firefox, and WebKit: existing navigation, dynamic heights, selection summaries, linked comparison, focus restoration, persistent bookmarks, separate-tab restoration, native window scrolling, map selection cancellation, four channel tracks, and live append/follow behavior. Two CDP-only touch cases are intentionally skipped on Firefox/WebKit. The console test now waits for worker bootstrap before reload to avoid a Firefox automation-worker cancellation race; all nine repeat checks passed.
- Desktop, comparison, full-page, phone-sized, and channel-track captures are under `output/playwright/implementation/`. No runtime errors were observed in the combined flow. Native Safari, physical touch devices, and timed first-time-user tasks remain unverified.
- The existing demo scroll test now keeps List view active and checks a 50 ms p95 frame budget instead of 150 ms. It mounted at most 13 rows with 768 rows cached in the three-engine run. This is a regression threshold for the fixture, not a device guarantee.

The additional production-mode benchmark uses 100 million synthetic rows, an immediate in-memory provider, a 1280×800 viewport, and 150 synthetic wheel frames (10 CSS pixels each). Automatic aggregation, prefetch and transitions are disabled. The before/after snapshots use the same local headless Chromium version; they include the current map/toolbar layout, so visible-row and DOM counts can differ slightly even in the sparse case.

| Measurement | Before | After |
| --- | ---: | ---: |
| 4,096 markers: p95 frame interval | 66.7 ms | 16.8 ms |
| 4,096 markers: DOM elements | 8,317 | 196 |
| 4,096 markers + 4,096 chapters: p95 | 83.4 ms | 16.8 ms |
| Sparse List: row-content render calls / 150 frames | 2,612 | 112 |
| Focus + context: new ResizeObservers / 150 frames | 151 | 0 |
| Focus + context: canvas clears / 150 frames | 301 | 75 |
| Jump to row 73,500,000: row page fetches | 26 | 1 |

The dense metadata changes bound rendered marker buttons by available height. Row contents are memoized independently of moving wrappers, canvas observers survive navigation, and flights request their destination. The comparison includes the recent map presentation changes already in the working tree. These timings describe this workload on this machine, not a guarantee for real providers or other devices. Raw measurements and the production harness are in `output/playwright/performance-review/` (before) and `output/playwright/implementation/` (after).

The design rationale and API direction are in [DESIGN.md](../DESIGN.md) and [API.md](../API.md).

# deepscroll

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

Memoize providers or define them outside render. All API indices are zero-based; user-facing row numbers are one-based. `fetchRows` returns exactly the requested, ordered rows. Sorting, filtering, or changing source contents requires a new `revision` and resets navigation/cache state. A known row count is required.

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
| Fixed top heading | Yes; sticky group headers are not implemented |
| Unknown-length streams, append/prepend anchoring, follow-output | Not implemented |
| Horizontal/column virtualization and RTL scrolling | Not implemented |
| Row selection, column resizing/pinning/reordering, editing | No built-in grid layer; host-managed content can provide controls |

This is a large-dataset explorer with an expanding virtual-list API, not full feature parity with every virtualizer or data grid.

The default component is 600 px tall. Set `style` or `className` to give it another bounded height. The main view has no dataset-height spacer and never uses native vertical scrolling. A floating row index drives a bounded set of DOM rows.

## Navigation

- Drag the right-hand Atlas rail to travel across the dataset. Move horizontally away while dragging for half, quarter, or fine precision. Shift bypasses magnetic markers. Escape cancels a scrub.
- Use Jump, Cmd/Ctrl+K inside the component, or `/` in the viewport. Try `73,500,000`, `50%`, `2017-03`, `next spike`, or `value > 120`.
- Arrows move one row; PageUp/PageDown move a visible span; Home/End reach the endpoints. N/P visit markers. Cmd/Ctrl+Up/Down visit chapter boundaries.
- Back/Forward and Alt+Left/Right restore committed jumps. Wheel motion is not a history entry. Mouse back/forward interception depends on the browser.
- Rows is the default. Lens keeps a full-size focus with logarithmic surrounding context. Zoom changes continuously between aggregate bands and exact rows; use the controls, touch pinch, or Ctrl+wheel over the focused viewport.
- Reduced motion follows the system preference or `reducedMotion={true}`. The component retains direct navigation while suppressing flights, touch inertia, elastic edges, and automatic speed zoom.

## Provider capabilities

Only `id`, `revision`, `rowCount`, and `fetchRows` are required. Optional capabilities progressively enrich the explorer:

| Capability | Purpose |
| --- | --- |
| `fetchOverview(buckets, signal)` | Global profile and informative loading estimates. |
| `fetchAggregates({ start, end, buckets }, signal)` | Regional detail for aggregate views. |
| `fetchMarkers(signal)` | A bounded set of named events and snap targets. |
| `fetchChapters(signal)` | Ordered non-overlapping index ranges and breadcrumbs. |
| `search(query, { fromIndex, limit, signal })` | Date and predicate queries performed by your provider. |

Buckets are contiguous half-open ranges. They carry count, mean, min, max, and `accuracy: 'exact' | 'estimated' | 'unavailable'`. A missing value is null, not zero. Metadata is bounded: 320 global buckets, 160 requested regional buckets, and at most 4,096 markers or chapters. Regional requests are debounced. No provider search falls back to a browser scan of the entire dataset.

`complete: false` search results are explicitly partial. The demo verifies matches among a bounded sample, while date lookup is direct. Its aggregate means/minima/maxima are sampled and labeled accordingly. The data describes a synthetic signal, not observations from a real sensor.

The default page cache uses 256-row pages, a 32 MiB estimated budget, and at most four outstanding row fetches. Configure `cache={{ maxBytes, pageSize, estimateRowBytes }}` for your row shape. Provide an estimator for large rows: the default heuristic is 256 bytes per row and cannot measure retained JavaScript heap. Cache stats include estimated metadata size; request buffers and caller-owned data are outside this estimate. Visible pages may temporarily exceed the budget, and `budgetOverage` reports that condition.

## Composition and packaging

- `deepscroll`: `DeepScroll`, `useDeepScroll`, `AtlasRail`, feature defaults, and public types.
- `deepscroll/core`: React-free engine and pure mapping/navigation functions. The caller drives animations with `step(timestamp)`.
- `deepscroll/data`: provider types, page cache, and data session.
- `deepscroll/styles.css`: component styling with `--ds-*` CSS variables.

`useDeepScroll` supplies the controller, snapshot, visible row slots, viewport/row prop getters, announcements, session, and statistics. It performs fetching and browser input binding; custom layouts choose their own row content and arrange the rail. `onNavigate` reports committed jumps; `onStats` reports cache/request counts and measured frame rate. The ready-made component handles the visual views and Jump dialog.

The library builds to ESM and declarations, with React/React DOM as peer dependencies and no additional runtime dependencies. The demo resolves `deepscroll` from source for hot reload. This local working package has not been published to npm.

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

## Local verification snapshot — 13 October 2026

- Build, 22 unit tests, built ESM import/SSR smoke checks, and the standalone consumer TypeScript check passed.
- 43 browser checks passed across Chromium, Firefox, and WebKit, including dynamic expansion, late content resizing, distant alignment, restoration, and mobile reflow. Two CDP-only touch cases are intentionally skipped on Firefox/WebKit.
- Fresh-load console checks passed. Desktop/mobile dynamic-height screenshots are saved as `output/playwright/dynamic-desktop.png` and `dynamic-mobile.png`; earlier view/theme captures are also in that folder.
- The fixed-height 100-frame sustained-scroll scenario mounted at most 9 DOM rows and ended with 1,024 rows cached in each browser. Dynamic-height correctness and sparse-cache bounds were tested separately; the timings below are not dynamic-height benchmarks.

| Browser engine | Median frame interval | 95th percentile |
| --- | ---: | ---: |
| Chromium | 16.7 ms | 16.8 ms |
| Firefox | 8.34 ms | 9.08 ms |
| WebKit | 17 ms | 24 ms |

These headless measurements describe this synthetic workload on the test machine. Native Safari, physical touch devices, real remote providers, and timed first-time-user tasks have not been verified.

The design rationale and API direction are in [DESIGN.md](./DESIGN.md) and [API.md](./API.md).

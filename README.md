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

Memoize providers or define them outside render. All API indices are zero-based; user-facing row numbers are one-based. `fetchRows` returns exactly the requested, ordered rows. Sorting, filtering, or changing source contents requires a new `revision` and resets navigation/cache state. The initial release requires a known row count and fixed row height.

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

The optional DuckDB-WASM/local CSV or Parquet import is not included. Variable row heights, unknown-length streams, editing, sorting controls, and live revision reconciliation are outside the initial release.

## Local verification snapshot — 13 October 2026

- Build, 14 unit tests, built ESM import smoke check, and standalone consumer TypeScript check passed.
- 34 browser checks passed across Chromium, Firefox, and WebKit. The Chromium touch test was rerun successfully after correcting a double-release in its test cleanup. Two CDP-only touch cases are intentionally skipped on Firefox/WebKit.
- Fresh-load console checks passed. Desktop, Lens, and mobile light-theme screenshots are saved under `output/playwright/`.
- The 100-frame sustained-scroll scenario mounted at most 9 DOM rows and ended with 1,024 rows cached in each browser.

| Browser engine | Median frame interval | 95th percentile |
| --- | ---: | ---: |
| Chromium | 16.7 ms | 16.7 ms |
| Firefox | 8.34 ms | 9.18 ms |
| WebKit | 17 ms | 26 ms |

These headless measurements describe this synthetic workload on the test machine. Native Safari, physical touch devices, real remote providers, and timed first-time-user tasks have not been verified.

The design rationale and API direction are in [DESIGN.md](./DESIGN.md) and [API.md](./API.md).

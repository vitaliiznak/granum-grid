# deepscroll

A React + TypeScript explorer for very large indexed datasets. A floating row address drives a bounded viewport, avoiding browser element-height limits. The Atlas rail shows dataset shape, chapters, events, and your position.

## Use

```tsx
import { DeepScroll, type DataProvider } from 'deepscroll';
import 'deepscroll/styles.css';

type Reading = { value: number };
const provider: DataProvider<Reading> = {
  id: 'readings', revision: 'snapshot-1', rowCount: 100_000_000,
  async fetchRows(start, count, signal) {
    const response = await fetch(`/api/readings?start=${start}&count=${count}`, { signal });
    if (!response.ok) throw new Error('Could not load readings');
    return response.json();
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

Use a stable provider and a known row count. API indices are zero-based; the UI displays one-based row numbers. Change the provider's `revision` when data order or contents change. Fetch exactly the requested count of rows.

Set `dynamicRowHeight` for automatic measurement of wrapped, expandable, or asynchronously resized content. `rowHeight` then estimates unmeasured rows. Loaded rows use natural height; include padding inside rows and avoid external vertical margins. Measurements are sparse: `maxMeasuredRows` defaults to 4,096, with mounted rows retained if they temporarily exceed a tiny budget. Width and provider revision changes invalidate old measurements. The Atlas rail remains based on row addresses.

`overscan` controls extra rows on each side (default 2). Pass `controllerRef={useRef<DeepScrollEngine>(null)}` to access `scrollToIndex(index, { align: 'start' | 'center' | 'end' | 'auto' })`, `getLocation()`, `restore(location)`, and `resetMeasurements()`. Aligned navigation is immediate, switches to Rows, and corrects alignment as measurements arrive; `goTo(index)` retains animated exploration. Save locations only for the same ordered dataset revision. `initialLocation` restores on mount; measurements are reacquired.

`getRowKey(row, index)` optionally supplies stable React keys; `emptyContent` customizes the empty state. In headless layouts, spread `getRowProps(slot)` including its measurement `ref` onto each row. Keep persistent expansion or selection state in your application, since virtual rows unmount offscreen.

## Features

- Rows, logarithmic Lens, and continuous Zoom views sharing one address.
- Canvas overview, event markers, chapters, hover previews, magnifier, and precision scrubbing.
- Exact jumps, percentages, reversible history, keyboard navigation, and provider-backed search.
- Cancelable page requests, progressive estimates, and a memory-budgeted LRU cache.
- Touch pan/pinch, inertia, optional speed-driven aggregation, and reduced-motion support.
- Light/dark/system themes, accessible DOM rows, and customizable content.
- Dynamic row heights, configurable overscan, scroll alignment, and location restoration.

`DeepScroll` is 600 px tall by default; customize its bounded height with `style` or `className`. Use `theme`, `reducedMotion`, and `features` to configure behavior. `header` supplies optional column-heading content. `onNavigate` reports committed jumps, and `onStats` reports request/cache statistics and sampled frame rate.

`fetchOverview`, `fetchAggregates`, `fetchMarkers`, `fetchChapters`, and `search` are optional provider methods. Aggregates state their exact/estimated/unavailable accuracy. Search results state whether they are exhaustive. The library never scans the full dataset to synthesize unavailable search or aggregate capabilities.

Cache defaults: 256-row pages, 32 MiB estimated budget, four concurrent row fetches. Supply `cache.estimateRowBytes` for your row shape; the fallback is 256 bytes per row, not an actual heap measurement. Visible pages may exceed a small budget temporarily, reported as `budgetOverage`.

## Exports

| Entry | Surface |
| --- | --- |
| `deepscroll` | `DeepScroll`, `useDeepScroll`, `AtlasRail`, defaults and types |
| `deepscroll/core` | Framework-independent engine and pure coordinate mappings |
| `deepscroll/data` | Provider types, `PageCache`, `DataSession` |
| `deepscroll/styles.css` | Component styles and `--ds-*` theme variables |

React and React DOM 18.2 or 19 are peers. There are no other runtime dependencies. Output is ESM with TypeScript declarations. This is an initial local release; the package has not been published to npm.

Not yet implemented: sticky group headers, unknown-length streams, append/prepend anchoring, horizontal/column virtualization, or a built-in grid layer for sorting/filtering/selection/editing. Sorting and filtering currently belong to the provider and require a fresh revision/count. Server-rendered placeholders are supported; measurement begins on the client.

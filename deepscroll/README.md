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

Use a stable provider and a known row count. API indices are zero-based; the UI displays one-based row numbers. Change the provider's `revision` when data order or contents change. Fetch exactly the requested count of rows. Fixed row height is required.

## Features

- Rows, logarithmic Lens, and continuous Zoom views sharing one address.
- Canvas overview, event markers, chapters, hover previews, magnifier, and precision scrubbing.
- Exact jumps, percentages, reversible history, keyboard navigation, and provider-backed search.
- Cancelable page requests, progressive estimates, and a memory-budgeted LRU cache.
- Touch pan/pinch, inertia, optional speed-driven aggregation, and reduced-motion support.
- Light/dark/system themes, accessible DOM rows, and customizable content.

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

# deepscroll

A React + TypeScript explorer for very large indexed datasets. A floating row address drives a bounded viewport, avoiding browser element-height limits. The Atlas rail shows dataset shape, chapters, events, and your position.

## Install

React and React DOM 18.2–19 are required. The package ships ESM JavaScript and TypeScript declarations; use an ESM-capable bundler and TypeScript 5+ for typed consumers.

```sh
npm install deepscroll
```

For local testing, install the verified `deepscroll-0.1.0.tgz` archive produced by `npm run release:check` in the repository.

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

## Styling and custom controls

The default dataset map shows row order vertically, a group mean horizontally (density for density metrics), event diamonds, and a current-row line. Its fixed-size handle does not indicate visible range. The question-mark button explains the encoding; hovering shows the actual group range and summary. Chapter labels are supplied by the provider and fall back to row numbers.

Configure it with `atlas`: choose `layout`, `maxAxisTicks`, `showMarkers`, `showTracks`, `showRange`, `showVisibleRange`, `showTrail`, and `showLegend`. Set `preview` to `'rows'`, `'summary'`, or `'none'`, choose `previewRows` (1–10), and toggle `showMagnifier` or `snapToMarkers`. Summary-only hover does not request exact rows. Global feature flags still take precedence, and changing map options preserves your current row.

Configure it with `atlas={{ variant: 'profile', axis: 'chapters', axisLabel: 'Year', showRange: false, markerLabels: 'label', layout: 'auto' }}`. Alternatives are `variant: 'markers'`, `axis: 'rows'`, `markerLabels: 'number' | 'none'`, and `layout: 'expanded' | 'compact'`. Automatic layout becomes compact below 650 px. `showRange` enables min–max shading for value metrics. `title` and `formatValue(value)` customize labels. Set `axisLabel` to match your provider; dates are not inferred. `AtlasRail` accepts the same `AtlasRailOptions` as its `options` prop.

No stylesheet is imported automatically. Choose `deepscroll/styles.css` for the default theme, `deepscroll/base.css` for layout only, or no CSS when using the headless hook. `unstyled` skips the skin for an individual component, including when the full stylesheet is loaded elsewhere.

```tsx
<DeepScroll
  unstyled
  provider={provider}
  ariaLabel="Readings"
  className="my-explorer"
  classNames={{ row: 'my-row', toolbar: 'my-toolbar' }}
  styles={{ footer: { fontSize: 12 } }}
  renderToolbar={({ controller }) => (
    <button className="my-button" onClick={() => controller.scrollToIndex(0)}>First row</button>
  )}
  renderFooter={() => null}
  renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
/>
```

`classNames` and `styles` support `toolbar`, `header`, `scale`, `body`, `viewport`, `row`, `rail`, `footer`, `jump`, and `hint`. Each has a stable `data-ds-part` hook. Row states are `data-focused` and `data-status`. Replacement `renderToolbar`, `renderFooter`, and `renderRail` callbacks receive the full `DeepScrollState`; return any React content or `null`. Replacement wrappers own their styling. Use the hook for complete markup control.

Default tokens: `--ds-bg`, `--ds-panel`, `--ds-text`, `--ds-muted`, `--ds-line`, `--ds-accent`, `--ds-hover`, `--ds-mark`, `--ds-radius`, `--ds-rail-width` (232px), `--ds-rail-width-mobile` (72px), and `--ds-rail-width-compact` (76px). Override them on your root class. Typography is inherited. Styles use the `deepscroll` cascade layer and zero-specificity selectors, so ordinary unlayered application CSS wins. With layered frameworks, declare `deepscroll` before your framework's layers. No descendant reset targets your own buttons or inputs.

`getViewportProps({ className, style, ...handlers })` and `getRowProps(slot, { className, style, ...handlers })` compose application styles and events. Spread all returned props, including measurement refs. The engine retains row geometry (position, transform, height and border-box sizing). Use dynamic row heights for content-driven sizing. The hook provides structural inline styles and hidden announcements without any CSS import; give the viewport a bounded height. For a rows-only headless list, disable `automaticAggregation` and `flight`, or render `ViewCanvas` when using aggregate views.

## Exports

| Entry | Surface |
| --- | --- |
| `deepscroll` | `DeepScroll`, `useDeepScroll`, `AtlasRail`, `JumpBar`, `ViewCanvas`, defaults and types |
| `deepscroll/core` | Framework-independent engine and pure coordinate mappings |
| `deepscroll/data` | Provider types, `PageCache`, `DataSession` |
| `deepscroll/base.css` | Structural layout only |
| `deepscroll/styles.css` | Optional skin and `--ds-*` theme variables; includes base layout |

React and React DOM 18.2 or 19 are peers. There are no other runtime dependencies. Output is ESM with TypeScript declarations; CommonJS `require()` is not supported.

Not yet implemented: unknown-length streams, prepend anchoring, horizontal/column virtualization, or a built-in grid layer for sorting/filtering/editing. Sorting and filtering currently belong to the provider and require a fresh revision/count. Server-rendered placeholders are supported; measurement begins on the client.

## Exploration and full-page use

- The **View** menu offers List, Focus + context, and Overview. **Go to…** accepts addresses, provider searches, and loaded event names. Automatic speed aggregation defaults off.
- **Explore** selects a half-open `RowRange`, requests a provider summary, compares two ranges, and saves named bookmarks. `selection`/`onSelectionChange` support controlled use; `exploration={false}` hides the panel. Comparison links relative progress, not matching records.
- `bookmarkStorageKey` opts into persistent browser bookmarks. `encodeView` and `decodeView` serialize location, zoom, selection, dataset ID and revision. Invalid or mismatched views are rejected.
- `fullPageUrl(view)` adds **Open full page**, targeting a host route in a new tab. That route renders `layout="page"` with restored `initialLocation`/`initialSelection`. Page mode owns the viewport; its bounded native scrollbar and dataset map both represent global progress. Wheel, touch panning over rows, and keyboard steps retain local precision. Native scrollbar dragging is approximate; Go to selects exact rows. Mount one page-mode explorer per document.
- `stickyChapters` keeps the current chapter visible. `atlas={{ showTracks: true }}` shows up to four provider-supplied `fetchOverviewTracks` profiles.
- `followOutput={true}` accepts append-only count growth with the same ID/revision and follows when the List view is already at its end. `false` preserves the current address; omitted keeps immutable snapshot behavior. Existing rows must not change. Unknown counts and prepends are unsupported.
- `cache.requestTimeoutMs` defaults to 15,000 ms. Four useful row requests run concurrently; at most eight unsettled row transports are retained. Providers must honor cancellation. `showStats` enables footer diagnostics.

For frameworks with React Server Components, render the explorer inside a component marked `'use client'`. Pass row renderers, refs, and provider functions within that client boundary.

## Host integration interface

`DeepScrollApi<Row>` is a public type exported from `deepscroll`. Pass a React ref as `apiRef` to `DeepScroll`, or read `api` from `useDeepScroll`, to access the mounted table's `provider: DataProvider<Row>` and `controller: DeepScrollEngine`. The ref updates with the provider/controller and is cleared on unmount. Read the current ref when executing an action. Existing `controllerRef` integrations continue to work.

Applications can use this interface for custom controls, automation, or AI-callable tools. The application owns tool definitions, argument validation, request budgets, result serialization, and its model connection. These are not shipped as library features. Provider reads/searches/aggregates and controller navigation retain their existing contracts; optional capabilities remain optional.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE).

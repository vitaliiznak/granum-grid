# deepscroll

**Big tables. A sense of place.**

A React + TypeScript library for exploring enormous indexed datasets: inspect individual rows, navigate a map of the whole dataset, and move between detail and overview without losing your place.

![deepscroll showing a live table near row 73,500,000 and a map of 100 million synthetic readings](media/images/hero.png)

[Quick start](#quick-start) · [Visual tour](#visual-tour) · [Provider contract](#connect-your-data) · [API](API.md) · [Styling](STYLING.md) · [Media studio](media/README.md)

Give deepscroll a known row count and a function that fetches a slice. It mounts a bounded set of rows and loads pages as you navigate. Add summaries, events, chapters, and search when your provider supports them.

- **Go anywhere:** exact row addresses, percentages, named events, provider-backed search, and reversible jumps.
- **Explore at different scales:** List, Focus + context, and continuous Overview zoom share the same dataset address.
- **Bring your own UI:** custom React rows, dynamic heights, light/dark themes, CSS tokens, replacement controls, or a headless hook.
- **Work with a range:** select, summarize, compare, bookmark, and share a view.

This is an initial local release, **not yet published to npm**. React and React DOM 18.2–19 are peer dependencies; the library has no additional runtime dependencies. The demos generate synthetic records on demand. Their billion-row counts describe navigable addresses, not billions of downloaded records or a remote-database benchmark.

## Quick start

Run the demo from this checkout:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Choose a dataset and try its guided actions. No API key or backend is needed for these generated examples.

To try the built package in another local React app:

```sh
# In this repository
npm run release:check

# In your React app, using the actual path to the generated archive
npm install /path/to/vit-scroll-lib/output/deepscroll-0.1.0.tgz
```

Here is a complete component with a generated provider:

```tsx
import { DeepScroll, type DataProvider } from 'deepscroll';
import 'deepscroll/styles.css';

type Reading = { value: number };

// Keep the provider stable: define it outside render, or memoize it.
const provider: DataProvider<Reading> = {
  id: 'example-readings',
  revision: '1',
  rowCount: 1_000_000,
  async fetchRows(start, count, signal) {
    signal.throwIfAborted();
    return Array.from({ length: count }, (_, offset) => ({
      value: Math.sin((start + offset) / 100) * 50 + 50,
    }));
  },
};

export function ReadingsTable() {
  return (
    <DeepScroll
      provider={provider}
      ariaLabel="Generated readings"
      rowHeight={40}
      style={{ height: 600 }}
      renderRow={({ row, rowNumber }) => (
        <>
          <span role="gridcell">{rowNumber.toLocaleString()}</span>
          <span role="gridcell">{row.value.toFixed(1)}</span>
        </>
      )}
    />
  );
}
```

That is enough for indexed navigation and virtualized rows. The richer maps and searches below use the optional provider capabilities described in [Connect your data](#connect-your-data).

## Visual tour

All images below are browser captures of the actual library with the demo providers. The surrounding titles and framing come from the separate [media studio](media/README.md). Click an image to inspect it at full size.

### Jump to the row you need

Enter `73,500,000`, `50%`, a loaded event name, or a query your provider understands. Long jumps travel through an overview; Back restores the previous location. The dataset map connects your current row to the wider archive.

[![Exact navigation to row 73,500,000, with the dataset map showing its global position](media/images/jump.png)](media/images/jump.png)

### See patterns, then inspect records

Overview shows regional aggregates as you zoom out. Focus + context keeps nearby rows readable while compressing the surrounding context. Both retain the same row-address model.

| Overview | Focus + context |
| --- | --- |
| [![Overview of 100 million synthetic readings, rendered as sampled aggregate bands](media/images/overview.png)](media/images/overview.png) | [![Full-size focus rows surrounded by compressed context](media/images/lens.png)](media/images/lens.png) |

The demo's means, minima, and maxima are **sampled estimates**. The UI labels them; the library does not silently scan the dataset to manufacture missing summaries.

### Different tables, one navigation model

Your renderer owns the cells. Your provider supplies the ordering, chapters, landmarks, and meaning of the map.

| Genome explorer | Market tape |
| --- | --- |
| [![Synthetic genome rows at the BRCA1 landmark, with sequence context and chromosome map](media/images/genome.png)](media/images/genome.png) | [![Generated trade records at a named event, with a price-profile map](media/images/market.png)](media/images/market.png) |
| **3,088,269,832 base addresses.** Synthetic sequence with reference chromosome lengths and approximate gene landmarks. | **750,000,000 trades.** Generated prices, buy/sell cells, venue labels, and event landmarks. |

| Log search | Star catalog |
| --- | --- |
| [![Provider-backed search for server responses with status greater than or equal to 500, explicitly marked as partial](media/images/logs.png)](media/images/logs.png) | [![Dark-themed synthetic star catalog at Sirius, showing coordinates, magnitude, and spectral class](media/images/stars.png)](media/images/stars.png) |
| **1,296,000,000 log lines.** Generated services and incidents. Predicate search verifies a bounded sample and reports partial results. | **1,811,709,771 star addresses.** A generated catalog with named-star landmarks; this is not an imported Gaia dataset. |

The fifth demo is the **100,000,000-row signal archive** shown throughout this README. None of these examples requires allocating its full row count in memory.

### Let rows grow naturally

Enable `dynamicRowHeight` for wrapped text, expanded details, and late-arriving content. `rowHeight` becomes an estimate for unmeasured rows. The library measures mounted rows, maintains a sparse height cache, and preserves the leading row and offset as content changes.

[![An expanded observation with automatically measured row height](media/images/dynamic.png)](media/images/dynamic.png)

Use `controllerRef` for `scrollToIndex(index, { align })`, save/restore, and measurement resets. Keep persistent expansion or selection state in your application: virtualized rows unmount when they leave the viewport. See the [dynamic-height guide](docs/GUIDE.md#dynamic-heights-and-standard-list-apis).

### Compare two parts of a dataset

Select a range, read its provider-backed summary, pin it as comparison A, and choose another range. The comparison opens two virtualized panes. Linked scrolling matches relative progress through the ranges, rather than matching timestamps or record identities.

[![Two selected ranges with estimated summaries and linked virtualized comparison panes](media/images/compare.png)](media/images/compare.png)

Bookmarks keep a location, view, zoom, and selection. Hosts can opt into browser persistence and serialize a dataset-scoped view for a shareable URL. [Exploration and saved views →](docs/GUIDE.md#explore-compare-and-save)

## Connect your data

Four fields are required:

| Field | Contract |
| --- | --- |
| `id` | Stable dataset identity |
| `revision` | Identity of this ordered snapshot; change it when existing rows or their order change |
| `rowCount` | Known total number of addressable rows |
| `fetchRows(start, count, signal)` | Return exactly the requested rows in order; honor cancellation |

API indices are **zero-based**; displayed row numbers are **one-based**. Ranges are half-open: `{ start: 99, end: 200 }` selects rows 100–200. A real adapter can delegate paging to your server:

```ts
async function fetchRows(start: number, count: number, signal: AbortSignal) {
  const response = await fetch(`/api/readings?start=${start}&count=${count}`, {
    signal,
  });
  if (!response.ok) throw new Error('Could not fetch readings');
  // Validate the response shape and ordered row count in your adapter.
  return response.json();
}
```

Add capabilities progressively:

| Optional method | What it enables |
| --- | --- |
| `fetchOverview(buckets, signal)` | Global profile on the dataset map |
| `fetchAggregates(range, signal)` | Regional zoom, selected-range summaries, and comparison summaries |
| `fetchMarkers(signal)` | Named events, jump targets, and map markers |
| `fetchChapters(signal)` | Chapters, breadcrumbs, and chapter navigation |
| `search(query, context)` | Provider-backed date and predicate search |
| `fetchOverviewTracks(buckets, signal)` | Up to four extra profiles sharing the same row addresses |

Aggregates carry `exact`, `estimated`, or `unavailable` accuracy; missing values are `null`. Search reports whether its results are complete. Sorting and filtering belong to the provider: return a new ordered revision and count.

The default page cache uses 256-row pages, a 32 MiB **estimated** budget, and up to four useful concurrent row requests. Supply `estimateRowBytes` for your row shape. The cache estimate is not a JavaScript heap measurement, and visible pages can temporarily exceed a small budget. [Provider and cache details →](docs/GUIDE.md#provider-capabilities)

## Fit your application

| Need | Use |
| --- | --- |
| Ready-made explorer | `DeepScroll` with your `renderRow` and optional column `header` |
| Your colors and typography | `deepscroll/styles.css`, `--ds-*` tokens, `classNames`, and `styles` |
| Your controls | `renderToolbar`, `renderFooter`, `renderRail`, or `toolbarActions` |
| Your entire layout | `useDeepScroll`; choose layout-only CSS or no stylesheet |
| Host automation | `apiRef` exposes `DeepScrollApi<Row>`: the mounted provider and controller |
| A separate full-page route | `layout="page"`, `fullPageUrl`, and encoded saved views |
| An append-only feed | A known increasing count with `followOutput` and a stable dataset revision |

Styles are optional and use a low-priority CSS layer. The core engine is also available without React through `deepscroll/core`. Built output is ESM with TypeScript declarations.

[Styling examples](STYLING.md) · [Complete API](API.md) · [Full-page integration](docs/GUIDE.md#open-in-a-separate-tab-and-scroll-the-window) · [Live feeds](docs/GUIDE.md#append-only-live-feeds) · [Host integration / application-owned AI example](docs/GUIDE.md#integration-interface-and-ai-demo)

The AI example lives in the demo and has no live model connection. AI schemas, execution budgets, and model calls belong to the host application; the library ships the provider/controller interface.

## Scope and current limits

| Supported | Current boundary |
| --- | --- |
| Fixed or automatically measured row heights | Known, index-addressable row counts are required |
| Keyboard navigation, ARIA row addresses, reduced motion | Screen-reader user testing and physical-device touch testing remain outstanding |
| Server-rendered placeholder markup | DOM measurement begins on the client |
| Append-only growth | Unknown-length streams and prepend anchoring are not implemented |
| Custom table cells and host controls | No built-in editing, column resizing/pinning, horizontal virtualization, or RTL scrolling |
| Native window scrolling in page layout | Its global scrollbar uses a compressed range; exact jumps and local inputs retain row precision |

Choose deepscroll when global navigation and context are central to the experience. If you need a spreadsheet-style editing and column-management layer, your application must provide it. There is no built-in CSV/Parquet import or database connector.

## Screenshots and marketing video

The dedicated [`media/`](media/README.md) folder contains an interactive scene studio, the image assets used here, and a repeatable capture/export pipeline.

```sh
npm run media:dev           # Preview and interact with scenes
npm run media:screenshots   # Rebuild the 10 README images
npm run media:video         # Render a silent 1080p marketing film + SRT
```

Install Chromium once with `npx playwright install chromium`. MP4 export also needs FFmpeg. The script starts its own local server, checks loaded content, and closes its browser after capture. It does not publish anything.

Edit [scene copy and timings](media/src/scenes.ts), use the [storyboard and narration draft](media/STORYBOARD.md), or export a single scene with `-- --scene=genome`. Generated videos and capture manifests live in `media/output/` and stay out of Git; README PNGs live in `media/images/`.

## Development and verification

```sh
npm run build
npm test
npm run test:package
npx playwright install chromium firefox webkit
npm run test:e2e
npm run media:build
```

Unit tests cover mappings, navigation, cache behavior, measurement, and application-owned tool contracts. Browser cases cover navigation, dataset switching, dynamic rows, comparisons, saved views, full-page layouts, and append behavior. Media exports additionally exercise their own real UI flows and fail on browser console errors.

The existing GitHub Actions workflow and Pages setup are documented in [Frontend CI/CD](docs/GUIDE.md#frontend-cicd). Remote deployment activation and the first hosted run remain separate from local verification.

## npm release

Run `npm run release:check` to test and build the workspace, pack the library, and install the tarball into isolated React 18.2 and React 19 consumers. The checks exercise runtime exports, server rendering, CSS, source maps, and TypeScript declarations with both NodeNext and Bundler resolution. Successful verification writes `output/deepscroll-0.1.0.tgz`. Registry access is needed to install the consumer dependencies when they are not cached.

The package rebuilds automatically before packing or publishing. Only the library output, source files for source maps, package README, manifest, and Apache 2.0 license are included. The demo and media assets stay outside the package.

See [Publishing to npm](docs/PUBLISHING.md) for the first release and version updates. No npm release has been published yet.

Licensed under the [Apache License, Version 2.0](LICENSE).

The [integration guide](docs/GUIDE.md#local-verification-snapshot--13-october-2026) preserves the earlier local verification snapshot and benchmark context. Those machine-specific measurements are not a cross-device performance guarantee. Human usability acceptance, native Safari, and real remote-provider performance need their own verification.

| Directory / document | Purpose |
| --- | --- |
| [`deepscroll/`](deepscroll/) | Publishable library source and unit tests |
| [`demo/`](demo/) | Interactive showcase, generated providers, and browser tests |
| [`media/`](media/README.md) | Image and video production, kept separate from the library |
| [`docs/GUIDE.md`](docs/GUIDE.md) | Detailed integration behavior and retained verification notes |
| [`API.md`](API.md) | Public API reference |
| [`STYLING.md`](STYLING.md) | Themes, CSS hooks, custom controls, and headless examples |
| [`DESIGN.md`](DESIGN.md) | Navigation model and design rationale |

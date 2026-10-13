# Granum Grid

[Live demo on GitHub Pages](https://vitaliiznak.github.io/granum-grid/)

A React + TypeScript library for exploring large indexed datasets: inspect individual rows, navigate a map of the whole dataset, and move between detail and overview without losing your place.

![Granum Grid showing a live table near row 73,500,000 and a map of 100 million synthetic readings](media/images/hero.png)

[Tutorial wiki](docs/wiki/Home.md) · [Quick start](docs/QUICK_START.md) · [Documentation](docs/README.md) · [Visual tour](#visual-tour) · [Provider contract](#connect-your-data) · [Integration guide](docs/GUIDE.md) · [Styling](STYLING.md) · [Media studio](media/README.md)

Give Granum Grid a known row count and a function that fetches a slice. It mounts a bounded set of rows and loads pages as you navigate. Add summaries, events, chapters, and search when your provider supports them.

- **Go anywhere:** exact row addresses, percentages, named events, provider-backed search, and reversible jumps.
- **Explore at different scales:** Rows and Range summaries share the same dataset address.
- **Bring your own UI:** custom React rows, dynamic heights, light/dark themes, CSS tokens, replacement controls, or a headless hook.
- **Work with a range:** select, summarize, compare, bookmark, and share a view.

This is an initial local release, **not yet published to npm**. React and React DOM 18.2–19 are peer dependencies; the library has no additional runtime dependencies. Five demos generate synthetic records on demand; the Performance demo reads a bundled Chromium recording or a local Chrome trace JSON file. Their billion-row counts describe navigable addresses, not billions of downloaded records or a remote-database benchmark.

## Demo limitations

The generated examples demonstrate navigation and paging. **Their sampled search and simulated server delays are demo choices.** Your `DataProvider` can use a real backend for complete searches and exact aggregates while the browser requests only the pages and summaries it needs.

- **Rows are generated on demand.** The same index produces the same content while the generator is unchanged, even after reloading or evicting a cached page. The full synthetic dataset is never materialized. Artificial request delays do not establish real server performance.
- **General searches are partial.** They check a bounded sample of roughly 20,000 candidate rows, with some direct lookups for dates and known locations. Returned matches are verified, but other matches can be missed. Samples depend on the current position; zero sampled matches does not prove that none exist. Overview summaries are sampled estimates where labeled.
- **Persistence is limited.** Bookmarks use browser storage. Full-page view URLs restore position, zoom, and selection for the same dataset revision. The embedded demo does not automatically save the latest position, and search input/results are not saved across reloads. Row caches are in memory and rebuilt as needed.
- **The Performance example is different.** It holds a bounded recording in browser memory, computes exact summaries of supported events, and searches those events with explicit truncation. Imported files and their views are session-only; reload returns to the bundled recording.

The library's built-in search dialog currently requests up to **100 matches** and has no result pagination. Browsing more requires custom search controls. The host application supplies its backend, search coverage, and persistence policy; the generated demo's sampling is not imposed by the library.

## Quick start

Use Node 22, then run the demo from this checkout:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. No API key or backend is needed for the generated
examples. Open `/tutorials.html` for working inventory, sensor, and log lessons.
The HTTP lesson needs the local server and is unavailable on static GitHub Pages.

To use the library in your own React app, follow the [quick start](docs/QUICK_START.md)
for a local package install and a complete component. The [tutorial wiki](docs/wiki/Home.md)
builds up from a simple array to summaries, search, and HTTP data.

## Visual tour

These are direct screenshots of the demo: the table, its controls, and its data. The [media scripts](media/README.md) crop the browser output without adding presentation frames or restyling the UI. Click an image to inspect it at full size.

### Jump to the row you need

Enter `73,500,000`, `50%`, a loaded event name, or a query your provider understands. Long jumps travel through an overview; Back restores the previous location. The dataset map connects your current row to the wider archive.

[![Exact navigation to row 73,500,000, with the dataset map showing its global position](media/images/jump.png)](media/images/jump.png)

### See patterns, then inspect records

The **View** menu offers two ways to read the same dataset:

- **Rows:** read individual records, one per line.
- **Range summaries**: compare groups of rows to find patterns. Choosing this from the menu opens summaries around your current row. **Group size** sets how much each card covers, **Zoom into group** splits that card into smaller groups, and **Inspect rows** reads its records. **Fit dataset** shows the whole dataset.

**Compare views** opens a small illustrated guide in the explorer. The map on the right always covers the whole dataset, whichever main view you choose. Sampled summaries remain labeled.

[![Overview of 100 million synthetic readings, rendered as sampled aggregate bands](media/images/overview.png)](media/images/overview.png)

The demo's means, minima, and maxima are **sampled estimates**. The UI labels them; the library does not silently scan the dataset to manufacture missing summaries.

### Different tables, one navigation model

Your renderer owns the cells. Your provider supplies the ordering, chapters, landmarks, and meaning of the map.

| Genome explorer                                                                                                                              | Market tape                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [![Synthetic genome rows at the BRCA1 landmark, with sequence context and chromosome map](media/images/genome.png)](media/images/genome.png) | [![Generated trade records at a named event, with a price-profile map](media/images/market.png)](media/images/market.png) |
| **3,088,269,832 base addresses.** Synthetic sequence with reference chromosome lengths and approximate gene landmarks.                       | **750,000,000 trades.** Generated prices, buy/sell cells, venue labels, and event landmarks.                              |

| Log search                                                                                                                                                            | Star catalog                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![Provider-backed search for server responses with status greater than or equal to 500, explicitly marked as partial](media/images/logs.png)](media/images/logs.png) | [![Dark-themed synthetic star catalog at Sirius, showing coordinates, magnitude, and spectral class](media/images/stars.png)](media/images/stars.png) |
| **4,000,000,000 log lines.** Generated services and incidents. Predicate search verifies a bounded sample and reports partial results.                                | **1,811,709,771 star addresses.** A generated catalog with named-star landmarks; this is not an imported Gaia dataset.                                |

The fifth synthetic demo is the **100,000,000-row signal archive** shown throughout this README. None of these five generated examples requires allocating its full row count in memory. The separate Performance demo holds its bounded recording in memory and identifies that explicitly.

**Bitcoin (live)** is real data: every second of BTC/USDT on Binance since August 2017 (about 289 million rows), fetched on demand from Binance's public market-data API with no key or backend. Row addresses are fixed seconds. Summaries come from the coarsest candles that fit and are exact only where whole candles tile a group. Markers (highest trade, largest daily moves) and `high >= 100000`-style searches are derived from the data in a few requests. The provider stays under half of Binance's 6,000-weight-per-minute limit and pauses on rate-limit responses. It needs a network connection, and Binance refuses some regions. [Provider source](demo/src/data/binance.ts).

### Explore a real performance recording

[![Recorded browser events as interactive summary bands](media/images/performance.png)](media/images/performance.png)

Choose **Performance** and **See whole recording**. Zoom from activity windows into
small event groups, inspect exact events, and use Back to recover the previous scale.
Each demo starts with a concrete exploration task, and guided actions select their
required view automatically. Selecting a summary or map range reveals a selection card
with View selection, Compare ranges, and Save bookmark actions. Statistics are available
under Show summary.

The bundled fixture is a real, redacted Chromium recording of this demo. You can also
open a local Chrome trace JSON file, up to 25 MiB and 150,000 source events. This adapter
reads complete (X) and instant (I/i) events and reports omitted records. Files stay in the
current tab; reloading restores the bundled example. Event durations can overlap and
are not added together as CPU time. [Fixture provenance](demo/src/data/fixtures/README.md).

The reusable pieces are `renderAggregate`, `aggregateRowHeight`, `formatRange`, and
`controller.zoomToRange(range)`. Parsing, file inputs, trace vocabulary, and the recording
remain in the demo. [Range summaries guide](docs/GUIDE.md#range-summaries-and-custom-bands).

### Let rows grow naturally

Enable `dynamicRowHeight` for wrapped text, expanded details, and late-arriving content. `rowHeight` becomes an estimate for unmeasured rows. The library measures mounted rows, maintains a sparse height cache, and preserves the leading row and offset as content changes.

[![An expanded observation with automatically measured row height](media/images/dynamic.png)](media/images/dynamic.png)

Use `controllerRef` for `scrollToIndex(index, { align })`, save/restore, and measurement resets. Keep persistent expansion or selection state in your application: virtualized rows unmount when they leave the viewport. See the [dynamic-height guide](docs/GUIDE.md#dynamic-heights-and-standard-list-apis).

### Compare two parts of a dataset

Choose **Select rows**, then use the rows on screen, draw on the map, or enter row numbers. Your selection card offers **View selection**, **Compare ranges**, and **Save bookmark**; **Show summary** reveals statistics when needed. Comparing keeps your first range visible while **Choose second range** opens the same selection choices. **Show comparison** opens two virtualized panes once you have two different ranges. Linked scrolling matches relative progress through the ranges, rather than matching timestamps or record identities.

[![Two selected ranges with estimated summaries and linked virtualized comparison panes](media/images/compare.png)](media/images/compare.png)

Bookmarks keep a location, view, zoom, and selection, and appear on the dataset map beside the provider's markers. Hosts can opt into browser persistence and serialize a dataset-scoped view for a shareable URL. [Exploration and bookmarks →](docs/GUIDE.md#explore-compare-and-save)

## Connect your data

### Which datasets work?

Granum Grid is domain-independent: `DataProvider<Row>` and `renderRow` accept your
row type without required fields. Rows can be text, numbers, tuples, nested
objects, or nullable values. No timestamp, numeric metric, or record ID is required.
The library does not inspect or serialize row payloads. Use `createArrayProvider`
for an immutable array already in memory, or implement `fetchRows` for another source.

The common requirement is a **known count and a stable ordered sequence that can
fetch any requested slice by index**. Database results, documents, logs, inventory,
and measurements can all use this contract. The adapter owns data access and must
make distant slices efficient; browser virtualization cannot make a slow backend
query fast. CSV/JSON files need parsing, trees/graphs need a flattened ordered view,
and a cursor server uses `createCursorProvider`: each response is a cursor, a window
of rows, and the next cursor. Unknown-length
streams do not work directly; append mode accepts a known growing count.

Search, summaries, markers, and chapters are optional. Text-only data works without
a numeric overview; the library keeps row navigation available and shows a neutral
map. Built-in summary charts use the numeric `Bucket` contract, and the built-in
search dialog uses `ProviderQuery`; richer domain controls belong to the host.
Sorting, filtering, or editing existing rows produces a new revision.

### Required provider contract

Four fields are required:

| Field                             | Contract                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `id`                              | Stable dataset identity                                                               |
| `revision`                        | Identity of this ordered snapshot; change it when existing rows or their order change |
| `rowCount`                        | Known total number of addressable rows                                                |
| `fetchRows(start, count, signal)` | Return exactly the requested rows in order; honor cancellation                        |

API indices are **zero-based**; displayed row numbers are **one-based**. Ranges are half-open: `{ start: 99, end: 200 }` selects rows 100–200. The [HTTP provider recipe](docs/QUICK_START.md#connect-an-http-api) shows a validating server adapter.

Add capabilities progressively:

| Optional method                        | What it enables                                                   |
| -------------------------------------- | ----------------------------------------------------------------- |
| `fetchOverview(buckets, signal)`       | Global profile on the dataset map                                 |
| `fetchAggregates(range, signal)`       | Regional zoom, selected-range summaries, and comparison summaries |
| `fetchMarkers(signal)`                 | Named events, jump targets, and map markers                       |
| `fetchChapters(signal)`                | Chapters, breadcrumbs, and chapter navigation                     |
| `search(query, context)`               | Provider-backed date and predicate search                         |
| `fetchOverviewTracks(buckets, signal)` | Up to four extra profiles sharing the same row addresses          |

Aggregates carry `exact`, `estimated`, or `unavailable` accuracy; missing values are `null`. Search reports whether its results are complete. Sorting, filtering, and editing stay on the server: `ServerDataset` describes the intent, and the server returns a new ordered revision and count. [Manifest →](docs/MANIFEST.md) [Provider rules, search, and cache limits →](docs/GUIDE.md#provider-capabilities)

## Fit your application

| Need                       | Use                                                                             |
| -------------------------- | ------------------------------------------------------------------------------- |
| Ready-made explorer        | `GranumGrid` with your `renderRow` and optional column `header`                 |
| Your colors and typography | `granum-grid/styles.css`, `--ds-*` tokens, `classNames`, and `styles`           |
| Your controls              | `renderToolbar`, `renderFooter`, `renderRail`, or `toolbarActions`              |
| Your entire layout         | `useGranumGrid`; choose layout-only CSS or no stylesheet                        |
| Host automation            | `apiRef` exposes `GranumGridApi<Row>`: the mounted provider and controller      |
| A separate full-page route | `layout="page"`, `fullPageUrl`, and encoded saved views                         |
| An append-only feed        | `dataMode="append"` with a known increasing count and a stable dataset revision |

Styles are optional and use a low-priority CSS layer. The core engine is also available without React through `granum-grid/core`. Built output is ESM with TypeScript declarations.

[Styling examples](STYLING.md) · [Integration guide](docs/GUIDE.md) · [Full-page integration](docs/GUIDE.md#open-in-a-separate-tab-and-scroll-the-window) · [Live feeds](docs/GUIDE.md#append-only-live-feeds) · [Host integration / application-owned AI example](docs/GUIDE.md#integration-interface-and-ai-demo)

The AI example lives in the demo and has no live model connection. AI schemas, execution budgets, and model calls belong to the host application; the library ships the provider/controller interface.

## Scope and current limits

| Supported                                               | Current boundary                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Fixed or automatically measured row heights             | Known, index-addressable row counts are required                                                |
| Keyboard navigation, ARIA row addresses, reduced motion | Screen-reader user testing and physical-device touch testing remain outstanding                 |
| Server-rendered placeholder markup                      | DOM measurement begins on the client                                                            |
| Append-only growth                                      | Unknown-length streams and prepend anchoring are not implemented                                |
| Custom table cells and host controls                    | No built-in editing, column resizing/pinning, horizontal virtualization, or RTL scrolling       |
| Native window scrolling in page layout                  | Its global scrollbar uses a compressed range; exact jumps and local inputs retain row precision |

Choose Granum Grid when global navigation and context are central to the experience. If you need a spreadsheet-style editing and column-management layer, your application must provide it. There is no built-in CSV/Parquet import or database connector.

## Screenshots and video

The [media studio](media/README.md) documents screenshot capture, film export,
FFmpeg setup, and music attribution. Scene sources and README images live in
`media/`; generated films stay out of Git and are published separately.

## Development and verification

Read [AGENTS.md](AGENTS.md) and the [development workflow](docs/AI_WORKFLOW.md)
for setup, focused checks, browser debugging, and contribution guidance.

```sh
npm run ai:doctor                       # Read-only setup diagnostic
npm run check                           # Types, documentation, and unit tests
npx playwright install chromium firefox webkit
npm run check:full                      # Lint, format, builds, package and browser checks
```

The functional browser suite covers Chromium, Firefox, and WebKit. Navigation
performance and injected touch gestures run in Chromium only. Playwright closes
its browsers and servers; failure traces are retained. Native Safari, physical
touch devices, and screen-reader user acceptance remain separate checks.

[Frontend CI/CD](docs/PUBLISHING.md#frontend-cicd) verifies pull requests and deploys
verified `main` builds to [GitHub Pages](https://vitaliiznak.github.io/granum-grid/) and
the [GitHub Wiki](https://github.com/vitaliiznak/granum-grid/wiki). The library source is
in [`granum-grid/`](granum-grid/), the demo and browser tests in [`demo/`](demo/), and
every guide is listed in the [documentation home](docs/README.md).

## npm release

`npm run release:check` verifies the workspace and installs the packed library into isolated React 18.2 and React 19 consumers. See [Publishing to npm](docs/PUBLISHING.md) for what the package contains, the first release, and version updates.

Licensed under the [Apache License, Version 2.0](LICENSE).

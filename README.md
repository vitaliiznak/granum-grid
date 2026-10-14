# Granum Grid

A React component and headless hook for reading ordered datasets too large to load: millions to billions of rows, fetched a page at a time, with a map of the whole dataset beside them. Jump to a row, a date, or a named event, then come back.

[Open the playground](https://vitaliiznak.github.io/granum-grid/) · [Use it in React](#use-it-in-react) · [Watch the film](media/granum-grid-launch.mp4) · [The datasets](#the-datasets) · [Visual tour](#visual-tour) · [Run it locally](#run-it-locally) · [Scope and current limits](#scope-and-current-limits)

![Granum Grid showing a live table near row 73,500,000 and a map of 100 million synthetic readings](media/images/hero.png)

## Use it in React

Not yet on npm: [build and install a local package](docs/QUICK_START.md#1-install-the-library). React 18.2–19, no other runtime dependencies.

```tsx
import { GranumGrid, type DataProvider } from 'granum-grid';
import 'granum-grid/styles.css';

type LogLine = { time: string; message: string };

// Keep the provider outside render, or memoize it by its revision.
const logs: DataProvider<LogLine> = {
  id: 'logs',
  revision: '2026-09',
  rowCount: 4_000_000_000,
  fetchRows: (start, count, signal) =>
    fetch(`/api/logs?start=${start}&count=${count}`, { signal }).then((r) => r.json()),
};

export function Logs() {
  return (
    <GranumGrid
      provider={logs}
      ariaLabel="Logs"
      style={{ height: 600 }}
      renderRow={({ row }) => (
        <span role="gridcell">
          {row.time} {row.message}
        </span>
      )}
    />
  );
}
```

The provider is the whole contract: a stable `id`, a `revision`, a known `rowCount`, and `fetchRows` for any slice by address. Overview buckets for the map, markers, chapters, and search are optional provider methods. Your server must answer `fetchRows(3_000_000_000, 256)` without reading the rows before it. That is the hard part, and it stays yours: [server-owned ordering](docs/GUIDE.md#server-owned-ordering).

It is a reading surface, not a spreadsheet grid. There is no column model, sorting, filtering, or editing in the browser, and no bookmark store or range comparison. The playground builds those last two on the public API in [`demo/src/explorer`](demo/src/explorer/index.tsx). Start with the [package README](granum-grid/README.md), then the [integration guide](docs/GUIDE.md).

## The playground

You never download the full set. The page asks for the slice you are looking at, and for a coarse summary of the whole set to draw the map. Five sets are generated in the browser. Three are real: Bitcoin from Binance, Hacker News from its public API, and a recorded browser trace. The billion-scale counts are addresses you can visit, not billions of rows sitting in memory.

## Film

[![Watch the Granum Grid playground film](media/images/hero.png)](media/granum-grid-launch.mp4)

The film records an earlier version of the playground, before the reading controls were simplified: jump to a row, read the shape, compare two stretches, and come back. Generated sets label sampled summaries and partial search. Bitcoin and Hacker News are live public sources.

[Play granum-grid-launch.mp4](media/granum-grid-launch.mp4) · [Captions](media/granum-grid-launch.srt) · [Description](media/granum-grid-launch-description.txt)

Music: 'Firefly' by Scott Buckley, released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [scottbuckley.com.au](https://www.scottbuckley.com.au) · [track](https://www.scottbuckley.com.au/library/firefly/). The film trims, fades, and levels the recording.

## The datasets

| Dataset                | What you are looking at                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server logs**        | 4 billion synthetic request lines from six fictional services in September 2026. Search a status, then read the incident around it.                                                                                                                                                                                                                                                                      |
| **Signal archive**     | 100 million readings, four channels, twenty years. The picture used in the screenshots below.                                                                                                                                                                                                                                                                                                            |
| **Human genome**       | 3,088,269,832 base addresses at GRCh38 chromosome lengths. The sequence is synthetic; gene landmarks sit near their real positions.                                                                                                                                                                                                                                                                      |
| **Market tape**        | 750 million generated trades in a fictional 24/7 market, with crashes and block trades marked on the map.                                                                                                                                                                                                                                                                                                |
| **Star catalog**       | 1,811,709,771 addresses ordered by right ascension. Named stars use real coordinates; the rest of the catalog is generated. This is not a Gaia download.                                                                                                                                                                                                                                                 |
| **Bitcoin (live)**     | About 289 million seconds of BTC/USDT on Binance since August 2017. Candles load as you move. Summaries use the coarsest candles that fit a group and are exact only where those candles tile it. The page stays under half of Binance's request budget and pauses when asked. Some regions are blocked by Binance. [Source](demo/src/data/binance.ts).                                                  |
| **Hacker News (live)** | About 50 million items since October 2006, one row per item id, from the official API. The count starts from a clock estimate and grows as new items appear. Open a row to read its text, links, and the parent and direct replies. Dates, `points > 3000`, `by = "pg"`, and the busiest threads come from Algolia's public index, ranked rather than exhaustive. [Source](demo/src/data/hackernews.ts). |
| **Performance**        | A real, redacted Chromium recording of this playground, held in memory. You can also open a local Chrome trace, up to 25 MiB and 150,000 source events. Reload returns to the bundled recording. [Where it came from](demo/src/data/fixtures/README.md).                                                                                                                                                 |

## Visual tour

These are screenshots of the playground. The [media scripts](media/README.md) crop the browser; they do not restyle the page.

### Jump to the row you need

Type `73,500,000`, `50%`, a loaded event name, or a query the dataset understands. A long jump passes through the overview. Back returns you to where you were.

[![Exact navigation to row 73,500,000, with the dataset map showing its global position](media/images/jump.png)](media/images/jump.png)

### See the shape, then read the records

Read one record per line. The map on the right always covers the whole dataset; click an event or drag to a new address, then inspect the nearby rows. Back returns to your previous position.

[![Readings at Spike 3, row 61,700,000 of 100 million, chosen from the sampled whole-dataset map](media/images/overview.png)](media/images/overview.png)

On the generated sets, means and extremes are **sampled estimates**, and the cards say so.

### The same gestures, different data

| Genome                                                                                                                                       | Market                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [![Synthetic genome rows at the BRCA1 landmark, with sequence context and chromosome map](media/images/genome.png)](media/images/genome.png) | [![Generated trade records at a named event, with a price-profile map](media/images/market.png)](media/images/market.png) |

| Logs                                                                                                                                                                  | Stars                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![Provider-backed search for server responses with status greater than or equal to 500, explicitly marked as partial](media/images/logs.png)](media/images/logs.png) | [![Dark-themed synthetic star catalog at Sirius, showing coordinates, magnitude, and spectral class](media/images/stars.png)](media/images/stars.png) |

### A browser recording

[![Recorded browser events beside the recording map](media/images/performance.png)](media/images/performance.png)

Open **Performance** and choose **Inspect longest event**. The recording map shows where longer events occur; the rows show their duration, start time, and thread. Select rows to compare ranges or save a bookmark.

### Rows that grow

Turn on measured heights when a row wraps or expands. The playground measures what is on screen, remembers those heights, and keeps your place while the content changes.

[![An expanded observation with automatically measured row height](media/images/dynamic.png)](media/images/dynamic.png)

### Two stretches, side by side

**Select rows** from the screen, the map, or typed addresses. **Compare ranges** keeps the first stretch while you pick a second. **Show comparison** opens two panes that scroll in proportion to each other, not by matching timestamps.

[![Two selected ranges with estimated summaries and linked virtualized comparison panes](media/images/compare.png)](media/images/compare.png)

Bookmarks remember a place and a selection, and they show up on the map next to the dataset's own markers.

## Run it locally

Node 22. No API key. Bitcoin and Hacker News need a network connection; the generated sets do not.

```sh
npm ci
npm run dev
```

Open the URL Vite prints. `/tutorials.html` runs the [tutorial lessons](docs/wiki/Home.md).

The library comes in [layers you can stop at](granum-grid/README.md#layers): the ready-made `GranumGrid`, the map and search widgets, the headless `useGranumGrid` hook, and a React-free engine and data session.

## Demo limitations

The generated examples are for moving through an index. **Sampled search and fake server delay are choices of those examples.** Bitcoin, Hacker News, and an imported trace follow their own sources, described above.

- **Generated rows are made when you ask for them.** The same index returns the same content until the generator changes. The full synthetic set is never built. A delay slider does not measure a real server.
- **Search on generated data is partial.** It checks a bounded sample of roughly 20,000 candidate rows, plus a few direct lookups for dates and known places. Matches you see are real. Matches you do not see may still exist. An empty sample is not proof the dataset has none. Overview numbers are estimates where the card says so.
- **What is remembered.** Bookmarks stay in the browser. A full-page view URL restores position and selection for the same dataset revision. The embedded page does not keep your latest position on its own, and search text is not saved across reload. Row caches are memory and are filled again as you move.
- **Performance is the exception.** The recording stays in memory, its supported events have exact summaries, and search says when it stopped early. An imported file lasts for the tab; reload restores the bundled recording.

Search in the page returns at most **100 matches** and does not page further. The generated sampling rules are not applied to Bitcoin or Hacker News.

## Scope and current limits

| You can                                                 | Current edge                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Fixed or measured row heights                           | The dataset needs a known, indexable count                                                  |
| Keyboard navigation, ARIA row addresses, reduced motion | Screen-reader sessions and phones in hand are still unchecked                               |
| A server-rendered placeholder                           | Measuring rows starts in the browser                                                        |
| A feed that only grows                                  | A stream of unknown length, or new rows inserted at the top, is not supported               |
| Custom cells and controls                               | No cell editing, column resize, pinned columns, horizontal virtualization, or RTL scrolling |
| The window as the scroller                              | The page scrollbar is a compressed range; typed jumps and local scrolling stay exact        |

There is no CSV import and no database connector on this page. A new dataset is a count plus a way to fetch a slice by index. [How that fits together](docs/GUIDE.md).

## Screenshots and checks

Capture, film export, and music credit are in the [media studio](media/README.md). Scene sources, the images above, and the launch film live in `media/`.

```sh
npm run ai:doctor
npm run check
npm run check:full
```

[What each check covers](AGENTS.md#validate-and-finish) · [workflow](docs/AI_WORKFLOW.md) · [all guides](docs/README.md)

Verified `main` builds are published to [GitHub Pages](https://vitaliiznak.github.io/granum-grid/). Chromium, Firefox, and WebKit run the functional browser tests. Navigation timing and synthetic touch run in Chromium only. Native Safari, a physical touch device, and a screen-reader pass are separate checks.

Licensed under the [Apache License, Version 2.0](LICENSE).

# Granum Grid

**Turn data into clarity.**

A React component and headless hook for reading ordered datasets too large to load: millions to billions of rows, fetched a page at a time, with a map of the whole dataset beside them. Jump to a row, a date, or a named event, then come back. Scrolling is the browser's own.

[Open the playground](https://vitaliiznak.github.io/granum-grid/) · [Use it in React](#use-it-in-react) · [Packages](#packages) · [The datasets](#the-datasets) · [Visual tour](#visual-tour) · [Run it locally](#run-it-locally) · [Demo limitations](#demo-limitations) · [Scope and current limits](#scope-and-current-limits)

The UI and navigation run in the browser, with no Granum Grid backend. The playground reads a public Parquet file with HTTP range requests, calls the public Hacker News API, and opens files you choose in DuckDB inside the tab. The repository also includes a separate [local HTTP teaching example](demo/server/trace.ts); it is not a deployed backend.

## Use it in React

Not yet on npm: [build and install the local packages](docs/QUICK_START.md#1-install-the-library). React 18.2–19; `@granum/react` depends only on `@granum/core`.

```tsx
import { GranumGrid, type DataProvider } from '@granum/react';
import '@granum/react/styles.css';

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

The provider is the whole contract: a stable `id`, a `revision`, a known `rowCount`, and `fetchRows` for any slice by address. Overview buckets for the map, markers, chapters, and search are optional provider methods. Your source must answer `fetchRows(3_000_000_000, 256)` without reading the rows before it ([server-owned ordering](docs/GUIDE.md#server-owned-ordering)); the adapter packages below do that for Parquet files and SQL.

It is a reading surface, not a spreadsheet grid. There is no column model, sorting, filtering, or editing in the browser, and no bookmark store or range comparison. The playground builds those last two on the public API in [`demo/src/explorer`](demo/src/explorer/index.tsx). Start with the [package README](packages/react/README.md), then the [integration guide](docs/GUIDE.md).

## Packages

| Package                                         | What it gives you                                                                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@granum/react`](packages/react/README.md)     | The explorer component, its map and search widgets, and the headless hook                                                                                      |
| [`@granum/core`](packages/core/README.md)       | Framework-free: the navigation engine, the data session, `mount()` for the rows explorer, and `mountMap()` for the dataset map beside any scroller             |
| [`@granum/parquet`](packages/parquet/README.md) | A Parquet file on any server that answers byte ranges, read one row group per jump, with a map from the footer's statistics                                    |
| [`@granum/sql`](packages/sql/README.md)         | Any table DuckDB can read: each filter or sort becomes a revision with its own addresses, an exact map, and search that reads every row; bring your own DuckDB |

None is on npm yet; `npm run test:package` installs each packed archive in clean React 18 and 19 projects.

## The playground

You never download the full set. The page asks for the slice you are looking at, and for a summary of the whole set to draw the map. Three sources are real (a 2 GB Parquet file read in place, Hacker News, and any file you open), and two are generated in the browser. The billion-scale counts are addresses you can visit, not billions of rows in memory. Each dataset's **How this dataset connects** shows the provider behind it.

## Film

<video src="https://github.com/user-attachments/assets/68cd80c8-c180-4f81-8c98-89a689c15d69" controls width="100%"></video>

The film records the playground on 14 October 2026, before jumps became instant and before five generated and live datasets left it. A short recording of the current playground will replace it. Music: “Gear” by Andrew Ev, from [Mixkit](https://mixkit.co/free-stock-music/tag/corporate/), under the [Mixkit Stock Music Free License](https://mixkit.co/license/#musicFree). [Film file](https://github.com/vitaliiznak/granum-grid/releases/download/media/granum-grid-launch.mp4) · [Captions](media/granum-grid-launch.srt) · [Description](media/granum-grid-launch-description.txt)

## A clear way through

| Move                        | What it feels like                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------- |
| **Skip the endless scroll** | Type a row, a percent, a date, or a name you already know.                            |
| **See the shape**           | A map of the whole dataset stays beside the rows you are reading.                     |
| **Find a match**            | Search, then read the records around the hit.                                         |
| **Compare two stretches**   | Two panes, side by side, scrolling in proportion.                                     |
| **Keep your place**         | Back returns you to where you were. A bookmark remembers the place and the selection. |

## The datasets

| Dataset                 | What you are looking at                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Your file (SQL)**     | Drop a Parquet, CSV, or JSON file, or make a sample of a million requests. DuckDB-WASM (about 8 MB, loaded on first use) reads it in the tab and never uploads it. Each filter or sort is a revision; the map is exact and search reads every row. About ten million rows fit in a tab's memory. [Source](packages/sql/src/index.ts).                                                                                       |
| **Web pages (Parquet)** | 973,991 English web pages in one 2.15 GB file of Hugging Face's [FineWeb](https://huggingface.co/datasets/HuggingFaceFW/fineweb) (ODC-By 1.0). The page reads the footer once, then downloads only the row group that holds the rows in view, about 2 MB, with HTTP range requests. Paste the URL of your own Parquet file to explore it the same way, and copy a link to any row. [Source](packages/parquet/src/index.ts). |
| **Hacker News (live)**  | About 50 million items since October 2006, one row per item id, from the official API. The count starts from a clock estimate and grows as new items appear. Open a row to read its text, links, and the parent and direct replies. Dates, `points > 3000`, `by = "pg"`, and the busiest threads come from Algolia's public index, ranked rather than exhaustive. [Source](demo/src/data/hackernews.ts).                    |
| **Server logs**         | 4 billion synthetic request lines from six fictional services in September 2026. Search a status, then read the incident around it.                                                                                                                                                                                                                                                                                         |
| **Signal archive**      | 100 million readings, four channels, twenty years. The picture used in the screenshots below.                                                                                                                                                                                                                                                                                                                               |

## Visual tour

These screenshots come from the frozen [media studio](media/README.md); they predate instant jumps and native scrolling, which look the same at rest.

### Skip the endless scroll

Type `73,500,000`, `50%`, a loaded event name, or a query the dataset understands. The jump is immediate, the map shows where you went, and Back returns you to where you were.

[![Exact navigation to row 73,500,000, with the dataset map showing its global position](https://github.com/vitaliiznak/granum-grid/releases/download/media/jump.png)](https://github.com/vitaliiznak/granum-grid/releases/download/media/jump.png)

### Make the big picture clear

Read one record per line. The map on the right always covers the whole dataset; click an event or drag to a new address, then inspect the nearby rows. Back returns to your previous position.

[![Readings at Spike 3, row 61,700,000 of 100 million, chosen from the sampled whole-dataset map](https://github.com/vitaliiznak/granum-grid/releases/download/media/overview.png)](https://github.com/vitaliiznak/granum-grid/releases/download/media/overview.png)

On the generated sets, means and extremes are **sampled estimates**, and the cards say so. On SQL revisions they are exact.

### Find a match, see the context

[![Provider-backed search for server responses with status greater than or equal to 500, explicitly marked as partial](https://github.com/vitaliiznak/granum-grid/releases/download/media/logs.png)](https://github.com/vitaliiznak/granum-grid/releases/download/media/logs.png)

### Give every detail room

Turn on measured heights when a row wraps or expands. The playground measures what is on screen, remembers those heights, and keeps your place while the content changes.

[![An expanded observation with automatically measured row height](https://github.com/vitaliiznak/granum-grid/releases/download/media/dynamic.png)](https://github.com/vitaliiznak/granum-grid/releases/download/media/dynamic.png)

### Make differences visible

**Select rows** from the screen, the map, or typed addresses. **Compare ranges** keeps the first stretch while you pick a second. **Show comparison** opens two panes that scroll in proportion to each other, not by matching timestamps.

[![Two selected ranges with estimated summaries and linked virtualized comparison panes](https://github.com/vitaliiznak/granum-grid/releases/download/media/compare.png)](https://github.com/vitaliiznak/granum-grid/releases/download/media/compare.png)

Bookmarks remember a place and a selection, and they show up on the map next to the dataset's own markers.

## Run it locally

Node 22. No API key. Hacker News, the Parquet file, and DuckDB's Parquet and JSON readers need a network connection; the generated sets do not.

```sh
npm ci
npm run dev
```

Open the URL Vite prints. `/tutorials.html` runs the [tutorial lessons](docs/lessons/README.md).

The library comes in [layers you can stop at](packages/react/README.md#layers): the ready-made `GranumGrid`, the map and search widgets, the headless `useGranumGrid` hook, and a React-free engine and data session.

## Demo limitations

The generated examples are for moving through an index. **Sampled search and fake server delay are choices of those examples.** Hacker News, the Parquet file, and your own file follow their sources, described above.

- **Generated rows are made when you ask for them.** The same index returns the same content until the generator changes. The full synthetic set is never built. A delay slider does not measure a real server.
- **Search on generated data is partial.** It checks a bounded sample of roughly 20,000 candidate rows, plus a few direct lookups for dates and known places. Matches you see are real. Matches you do not see may still exist. Overview numbers are estimates where the card says so.
- **What is remembered.** Bookmarks stay in the browser. A full-page view URL restores position and selection for the same dataset revision, and a Parquet row link reopens its file. A file you open in the SQL card lasts for the tab. Row caches are memory and are filled again as you move.

Search in the page returns at most **100 matches** and does not page further.

## Scope and current limits

| You can                                                 | Current edge                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Fixed or measured row heights                           | The dataset needs a known, indexable count                                                       |
| Keyboard navigation, ARIA row addresses, reduced motion | Screen-reader sessions and phones in hand are still unchecked                                    |
| A server-rendered placeholder                           | Measuring rows starts in the browser                                                             |
| A feed that only grows                                  | A stream of unknown length, or new rows inserted at the top, is not supported                    |
| Custom cells and controls                               | No cell editing, column resize, pinned columns, horizontal virtualization, or RTL scrolling      |
| Native scrolling, embedded or as the page               | Past 8 million px the scrollbar's middle is compressed; wheel, touch, and typed jumps stay exact |

A new dataset is a count plus a way to fetch a slice by index. [How that fits together](docs/GUIDE.md).

## Checks

```sh
npm run ai:doctor
npm run check
npm run check:full
```

[What each check covers](AGENTS.md#validate-and-finish) · [workflow](docs/AI_WORKFLOW.md) · [all guides](docs/README.md)

Verified `main` builds are published to [GitHub Pages](https://vitaliiznak.github.io/granum-grid/). Chromium, Firefox, and WebKit run the functional browser tests. Navigation timing and synthetic touch run in Chromium only. Native Safari, a physical touch device, and a screen-reader pass are separate checks.

Licensed under the [Apache License, Version 2.0](LICENSE).

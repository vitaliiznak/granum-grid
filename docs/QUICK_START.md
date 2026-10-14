# Quick start

[Documentation home](README.md) · [Integration guide](GUIDE.md) · [Styling](../STYLING.md)

Get a working explorer in your own React app, then replace the example data with
yours. The library works independently of this repository's demo. The first
example runs entirely in the browser, with no backend or API key.

**You need:** React and React DOM 18.2 or 19, an ESM-capable build tool, and
TypeScript 5+ for the typed examples. Use Node 22 to build this checkout; if
creating a new app with current Vite, use Node 22.12+.

[Install](#1-install-the-library) → [Render rows](#2-render-your-first-explorer) →
[Try it](#3-check-that-it-works) → [Use your data](#use-your-own-array) →
[Connect an API](#connect-an-http-api)

## 1. Install the library

This checkout is a pre-publication release. Install its local package archive to
try the current code in another app.

**In the Granum Grid repository root:**

```sh
npm ci
mkdir -p output
npm pack --workspace=granum-grid --pack-destination ./output
```

If you already installed this checkout's dependencies, skip `npm ci`. Packing runs
the library build automatically and creates `output/granum-grid-0.1.0.tgz`. Use the
filename printed by npm if the version changes. The archive contains the library,
styles, types, and source maps; it does not include the demo or its data.

**In your React app directory:**

```sh
npm install /absolute/path/to/granum-grid/output/granum-grid-0.1.0.tgz
```

Replace the path with the actual archive location. Your app only needs the
installed package at runtime; you do not need to keep the demo server running.
Packing builds an archive without running the repository's checks; for those, run
[`npm run release:check`](../AGENTS.md#validate-and-finish) from the repository root.

<details>
<summary>Starting without a React app?</summary>

From a directory outside this repository, create a small React + TypeScript app:

```sh
npm create vite@latest my-explorer -- --template react-ts
cd my-explorer
npm install
npm install /absolute/path/to/granum-grid/output/granum-grid-0.1.0.tgz
```

Follow the [Vite setup guide](https://vite.dev/guide/#scaffolding-your-first-vite-project)
if the scaffold asks for a newer Node version. Continue below in `my-explorer`.

</details>

## 2. Render your first explorer

Replace `src/App.tsx` in a Vite app with this complete component. In an existing
app, render this component wherever you want the explorer.

```tsx
import { GranumGrid, createArrayProvider } from 'granum-grid';
import 'granum-grid/styles.css';

type Reading = { value: number };

// Small, generated example data. Replace with your own immutable array later.
const rows: Reading[] = Array.from({ length: 10_000 }, (_, index) => ({
  value: 20 + Math.sin(index / 100) * 5,
}));

// Stable between renders: changing provider identity creates a new data session.
const provider = createArrayProvider(rows, { id: 'readings', revision: '1' });

export default function App() {
  return (
    <main style={{ maxWidth: 960, margin: '24px auto', padding: 16 }}>
      <h1>Readings</h1>
      <p>10,000 generated readings. Try Go to… → 5,000.</p>
      <GranumGrid
        provider={provider}
        ariaLabel="Readings"
        rowHeight={40}
        style={{ height: 480 }}
        renderRow={({ row, rowNumber }) => (
          <span role="gridcell">
            Reading {rowNumber.toLocaleString()}: {row.value.toFixed(2)} °C
          </span>
        )}
      />
    </main>
  );
}
```

For a fresh Vite app, replace its starter `src/index.css` with the following so
the template's centered body and color rules do not constrain the explorer.
Keep the existing `src/main.tsx`, which mounts `App` and imports `index.css`.

```css
body {
  margin: 0;
  font-family: system-ui, sans-serif;
}
```

In an existing app, keep your own global CSS. `granum-grid/styles.css` provides the
explorer's layout and theme; no demo stylesheet is needed. The height keeps the
viewport bounded. `renderRow` controls your content, while the library handles
loading, positioning, keyboard navigation, and focus.

## 3. Check that it works

In the Vite app directory:

```sh
npm run dev
```

Open the URL printed by Vite. You should see **Readings**, a scrollable explorer,
and the first generated readings. Try these actions:

1. Scroll through the rows; the explorer stays 480 pixels tall.
2. Choose **Go to…**, enter `5,000`, and confirm. You should reach visible row 5,000.
3. Use **Back** to return to the previous location.

Visible row numbers start at **1**. JavaScript indices start at **0**, so visible
row 5,000 is index `4999`.

This array provider supplies rows only. It does not infer value profiles,
summaries, or content search. Exact row jumps and percentages work immediately.
The 10,000 example records are already in browser memory; virtualization bounds
the rendered rows, not the memory occupied by your source array.

## Use your own array

When rows arrive through props or state, memoize the provider by the immutable
array and its revision:

```tsx
import { useMemo } from 'react';
import { GranumGrid, createArrayProvider } from 'granum-grid';
import 'granum-grid/styles.css';

type Reading = { value: number };
export function Readings({ rows, revision }: { rows: readonly Reading[]; revision: string }) {
  const provider = useMemo(
    () => createArrayProvider(rows, { id: 'readings', revision }),
    [rows, revision],
  );
  return (
    <GranumGrid
      provider={provider}
      ariaLabel="Readings"
      rowHeight={36}
      renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
    />
  );
}
```

Keep the array/provider stable between updates. Replace the array and revision
when existing contents or ordering change. Do not mutate rows behind the provider.
Changing the array's length in place is rejected when rows are fetched.

For remote data, use `DataProvider.fetchRows(start, count, signal)` instead.
API indices are zero-based and ranges are half-open. The UI shows one-based rows.

## Connect an HTTP API

For data too large to download, implement `DataProvider.fetchRows`. Your backend
must expose a known row count and a stable ordering for one dataset revision.
This adapter expects an existing endpoint that returns a JSON array of readings:

```ts
import type { DataProvider } from 'granum-grid';

type Reading = { value: number };
type Snapshot = { id: string; revision: string; rowCount: number };

export function createReadingsProvider(snapshot: Snapshot): DataProvider<Reading> {
  return {
    ...snapshot,
    async fetchRows(start, count, signal) {
      const params = new URLSearchParams({
        dataset: snapshot.id,
        revision: snapshot.revision,
        start: String(start),
        count: String(count),
      });
      const response = await fetch(`/api/readings?${params}`, { signal });
      if (response.status === 409) throw new Error('Dataset changed. Reload its metadata.');
      if (!response.ok) throw new Error(`Could not load readings (${response.status}).`);

      const rows: unknown = await response.json();
      if (
        !Array.isArray(rows) ||
        rows.length !== count ||
        !rows.every(
          (row) =>
            row !== null &&
            typeof row === 'object' &&
            typeof row.value === 'number' &&
            Number.isFinite(row.value),
        )
      ) {
        throw new Error('Expected the requested number of readings with numeric values.');
      }
      return rows;
    },
  };
}
```

Create the provider once when your app receives snapshot metadata, or memoize it
by that metadata. Pass it to the same `<GranumGrid>` component above. The endpoint
and metadata loading are owned by your app; the library does not create a server.

For `fetchRows(100, 2, signal)`, return records at indices **100 and 101**, in order:

```json
[{ "value": 21.4 }, { "value": 22.1 }]
```

The server must return exactly `count` rows for a valid request, use the requested
revision, and reject a stale revision (the adapter above expects HTTP 409).
Forward `signal` to the transport so obsolete requests can be canceled. Do not
fetch every preceding page to reach `start`; use indexed reads or a suitable
address-to-record mapping on your backend. Change `revision` and `rowCount` when
replacing, sorting, or filtering a snapshot.

## Add search and a dataset map

Optional provider methods determine available capabilities. `fetchOverview` adds
the global profile; `fetchAggregates` adds selection statistics and comparison maps.
`fetchMarkers` adds named events. `search` performs searches without a component-side
scan. Every summary retains `exact`, `estimated`, or `unavailable`; every search
retains its `complete` flag.

```ts
const searchHelp = {
  examples: ['duration > 10', 'name = "Layout"'],
  dates: false,
  fields: [
    { name: 'duration', type: 'number', operators: ['>', '>=', '=', '<', '<='] },
    { name: 'name', type: 'text', operators: ['=', '!='] },
  ],
} satisfies import('granum-grid').SearchHelp;
```

Put this on the provider alongside `search`. [Search](GUIDE.md#search) explains how
the dialog uses it and what the provider must still validate.

### Try the working HTTP example

The [HTTP recording lesson](wiki/HTTP-recording.md) runs a complete server and client
over the repository's real, redacted Chromium recording: revisions, bounded requests,
cancellation, summaries, search, and saved views.

## Build custom controls

This component works with either the array or HTTP provider. Call the public API
from a button or another part of your app:

```tsx
import { useRef } from 'react';
import { GranumGrid, type GranumGridApi, type DataProvider } from 'granum-grid';
import 'granum-grid/styles.css';

type Reading = { value: number };

export function Explorer({ provider }: { provider: DataProvider<Reading> }) {
  const api = useRef<GranumGridApi<Reading>>(null);
  return (
    <>
      <button onClick={() => api.current?.scrollToIndex(0)}>First row</button>
      <GranumGrid
        provider={provider}
        apiRef={api}
        ariaLabel="Readings"
        style={{ height: 480 }}
        renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
      />
    </>
  );
}
```

The same `api` is available from `useGranumGrid`. The
[integration interface](GUIDE.md#integration-interface) lists its methods and the rules
for search, focus, controlled selection, and saved-view URLs.

## Configuration that preserves expectations

| Intent                                            | Configuration                              |
| ------------------------------------------------- | ------------------------------------------ |
| Immutable ordered snapshot                        | `dataMode="snapshot"` (default)            |
| Accept appended rows, preserve the reader's place | `dataMode="append"`                        |
| Follow new rows when already at the end           | `dataMode="follow"`                        |
| Fixed row height                                  | `rowHeight={36}`                           |
| Natural row height, estimated before measurement  | `dynamicRowHeight rowHeight={36}`          |
| No exact-row requests on map hover                | `rail={{ preview: 'summary' }}`            |
| Rows only: no map, tools, or hints                | `rail={false} tools={false} hints={false}` |

Append mode requires the same ID/revision and unchanged existing rows. The count
may increase, never decrease; `follow` is append mode that also stays at the end.

`features` switches motion and data behavior; map layers are `rail` options. Every
region prop (`toolbar`, `tools`, `rail`, `footer`, `hints`) takes `false` to hide it or
an object to configure it, and `toolbar`, `rail`, and `footer` also take a function.
Keep provider objects outside render or memoize them: changing object identity in
snapshot mode creates a new data session. Changing identity/revision also resets
navigation; appending with the same identity retains its prior addresses.

Loaded rows re-render only when their row, index, focus, or `renderRow` function
changes. For rows with expensive content, define `renderRow` outside the component or
wrap it in `useCallback`; an inline function re-renders every mounted row with each
parent render. Inline `onStats`, `onNavigate`, and `onSelectionChange` callbacks are fine.

## If something does not look right

| Symptom                                                  | What to check                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| The explorer has no layout or theme                      | Import `granum-grid/styles.css` once. Use `base.css` only when supplying your own theme.         |
| A new Vite app is narrow or centered                     | Replace the starter `index.css` as shown above and remove any imported starter `App.css`.        |
| Position or requests reset on every render               | Keep the provider stable; create it outside render or use `useMemo`.                             |
| Rows show an error                                       | Check the response shape, exact requested count, revision, and HTTP status.                      |
| Search or summaries are unavailable                      | Implement the corresponding optional provider methods; `createArrayProvider` supplies rows only. |
| An API jump is off by one                                | `scrollToIndex(4999)` targets visible row 5,000. Ranges use `[start, end)`.                      |
| A React Server Components app rejects functions or hooks | Put the explorer, provider, and renderer inside a `'use client'` component.                      |

## Where to go next

- [Integration guide](GUIDE.md): dynamic heights, append mode, saved views, and headless layouts.
- [Styling](../STYLING.md): theme tokens, custom controls, and replacing markup.
- [Public exports](../granum-grid/src/index.ts) and [provider types](../granum-grid/src/data/types.ts): the current typed contracts. [Design rationale](../DESIGN.md) explains the decisions behind them.
- [Documentation home](README.md): all guides and runnable examples.

For a custom React UI, use `useGranumGrid`. For framework-independent engine and
cache logic, use `granum-grid/core` and `granum-grid/data`; you supply the rendering
and input integration. The package still declares React and React DOM as peers.

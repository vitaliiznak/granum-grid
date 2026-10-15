# Plan: Granum as a small family of libraries

Status: as of 2026-10-14, the code work is done: Phases 0–2, the package split and rename in
Phase 3, Phase 4, and Phase 5, pushed to `main` on 2026-10-15. Everything left waits on the
maintainer or other people: creating the `granum-grid` npm org and publishing, the screen
recording at release, finding integrators, and the screen-reader and device checks. The
last code follow-up, serving DuckDB's extensions from the playground instead of
extensions.duckdb.org, was done on 2026-10-15 (see Risks). The remaining human steps, in
order, are in [launch.md](launch.md). This plan extends [next-steps.md](next-steps.md);
that plan's remaining work (publish to npm, cut three generated datasets) folded into
Phase 0 and Phase 3 below.

## Outcome and acceptance

Granum becomes a framework-free core with thin bindings and data adapters, the pattern
TanStack Virtual uses (`virtual-core` plus one package per framework). A developer opens
their own file, URL, or SQL table and gets rows and an exact map of the whole dataset in
about ten lines, and the viewport scrolls like the browser's own. The playground keeps
growing, but each new demo feature exercises a public package.

Done when:

1. A developer outside the repository goes from `npm install` to their own Parquet or
   CSV file, with rows and an exact map, in ten lines of host code or fewer. Timed with
   the first integrators, not by us.
2. Embedded and page layouts scroll natively: wheel, trackpad, touch, scrollbar, and
   keys behave like a plain scroller, and a touch swipe hands off to the page at either
   end. A person checks a macOS trackpad, a Windows precision touchpad, iOS Safari, and
   Android Chrome.
3. Rows use an ARIA pattern that VoiceOver and NVDA announce correctly, confirmed in one
   session with each.
4. The engine, data session, DOM controller, and map import and run without React. One
   acceptance spec passes against both the React component and a plain-DOM page.
5. The map drives at least two scrollers it does not own: a plain overflow element and
   TanStack Virtual.
6. `test:package` enforces size budgets (`scripts/size.mjs`), and the full React entry is
   smaller than its 26.1 KiB (minified, gzipped, React external) on 2026-10-14.
7. Three external integration reports arrive before 1.0. The feature freeze rule in
   next-steps.md stands.

## Why this plan

A review on 2026-10-14 found the code careful but hard to adopt:

- The provider contract leaves the hard part to the integrator: answering
  `fetchRows(3_000_000_000, 256)` fast, plus overview buckets and search.
- Scrolling is reimplemented. The viewport is `overflow: hidden` with
  `touch-action: none` (`base.css:84`), and wheel, inertia, edges, and touch panning are
  custom (`react/input.ts`). Even `layout="page"` takes over the wheel.
- `role="grid"` promises cell navigation that does not exist.
- [HighTable](https://www.npmjs.com/package/hightable) already reads Parquet at
  billion-row scale and has columns and sorting.

What Granum has that others lack is the whole-dataset map, typed jumps, and history over
billions of addresses. This plan spends effort there and on removing the integration
barrier, and cuts most of the rest.

## Non-goals

- A spreadsheet: no column model, resizing, pinning, editing, or client-side sorting and
  filtering in the library. A sort or filter is a new revision from the data source; the
  SQL adapter makes that cheap.
- Charts beyond the map, and AI query features (AGENTS.md: AI belongs to the host).
- Vue, Svelte, or Angular packages before someone asks. The route to other frameworks is
  the framework-free controller, then custom elements.
- Unknown-length streams, prepending rows, RTL, horizontal virtualization.
- A hosted backend. Server setups are documented recipes, not code we run.

## Decisions needed before Phase 0

| Decision                           | Recommendation                                                                                                                                                                                                                                                                         | Reason                                                                                                                                                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Package names                      | `@granum/*` if the maintainer can create the npm org `granum`; otherwise `@granum-grid/*`. Unscoped `granum` is taken; `@granum/core`, `@granum/react`, and `granum-grid` return 404 today. Decided 2026-10-15: `@granum-grid/*`, because an npm user named `granum` holds that scope. | A scope suits a family and drops "grid" from package names; the product is not a grid. Renaming after publication breaks imports.                                                                                                                                              |
| How many packages                  | Four at 0.2: `core`, `react`, `parquet`, `sql`. The DOM controller and the map are subpaths of `core` (`/dom`, `/map`) until someone uses them alone.                                                                                                                                  | Data adapters bring their own peers. Fewer packages mean fewer versions, changelogs, and consumer tests.                                                                                                                                                                       |
| Long-jump flights and `ViewCanvas` | Cut. Jumps are instant; the map's viewport marker moves and arriving rows fade in.                                                                                                                                                                                                     | Animated programmatic scrolling fights native scrolling; [HighTable hit the same conflict](https://rednegra.net/blog/20260212-virtual-scroll/). Removes flight state from the engine, 28 lines that read `traveling`, `flightSpan`, or `targetIndex`, and `createZoomMapping`. |
| ARIA pattern                       | Decide in Phase 2 after one screen-reader session: `table` with rows and cells, or `grid` with real cell navigation. `table` if undecided.                                                                                                                                             | Today's `grid` announces a pattern the keyboard does not support.                                                                                                                                                                                                              |
| Bitcoin (Binance)                  | Cut. A market example, if wanted, becomes a static Parquet of candles through the Parquet adapter.                                                                                                                                                                                     | The README already says Binance blocks some regions; about 694 lines with a request budget and approximate summaries.                                                                                                                                                          |
| Performance trace                  | Cut from the gallery. Keep the HTTP example page as the "your own server" recipe.                                                                                                                                                                                                      | 1.3K events undercut a billion-row pitch; about 800 lines with the import UI, recorder script, and fixture.                                                                                                                                                                    |
| Media studio and film              | Freeze after the pending media work lands; move it to its own branch. A 60-second screen recording replaces the film at 0.2.                                                                                                                                                           | Scrolling and the dataset list will change, and each change means re-rendering the film.                                                                                                                                                                                       |
| CSS hook prefix and old names      | Rename `ds-*` once, together with the package names, before 0.2. Drop the `deepscroll-*` storage keys and wiki manifest name.                                                                                                                                                          | No users yet. The compatibility kept after the deepscroll rename protects nobody and will be breaking later.                                                                                                                                                                   |

## Target shape

```text
@granum-grid/core        framework-free, no dependencies, ships the CSS
  .                 engine, row sizes, mappings, navigation, history, saved views
  /data             provider contract, DataSession, PageCache, array and cursor helpers
  /dom              viewport controller: native scrolling, keys, measurement,
                    page layout, announcements; mount() for plain-DOM rows
  /map              map controller and canvas renderer; MapTarget adapters
@granum-grid/react       useGranumGrid, GranumGrid, AtlasRail, JumpBar as thin wrappers
@granum-grid/parquet     Parquet over HTTP range requests (peer: hyparquet)
@granum-grid/sql         SQL provider in DuckDB's dialect; the host passes query()
```

Layer rule, lint-enforced since Phase 0 (`eslint.config.js`): `data` ← `core` ← `dom` ←
`map` ← `react`, lowest first. Nothing below `react` imports React. Adapters import only
types from `/data`.

Sizes on 2026-10-14 (minified and gzipped with React external, CSS raw): full React entry
26.1 KiB, headless hook 12.6 KiB, `core` 3.5 KiB, `data` 3.8 KiB, `base.css` 15.4 KiB,
`styles.css` 18.6 KiB. `scripts/size.mjs` holds each budget about 2% above its size, and
each cut lowers it. Targets after Phase 2: full React entry 22 KiB, CSS 28 KiB together.

Later, only when asked: `<granum-grid>` and `<granum-map>` custom elements on top of
`/dom` and `/map`, one binding that works in Vue, Svelte, and Angular; then dedicated
`@granum-grid/vue` or `@granum-grid/svelte` if an integrator needs more.

## Features to build

### `@granum-grid/sql`: the integration barrier goes away

- `createSqlProvider({ query, source, where, orderBy, metric, chapters, search })`.
  The host supplies `query(sql, params, signal)`: DuckDB-WASM in a worker, DuckDB on a
  server over HTTP, or MotherDuck. The package depends on no database.
- Each `where` or `orderBy` publishes a new revision. The adapter materializes a
  temporary table with an explicit `__granum_row` column in the requested order, so
  `fetchRows(start, count)` is a range scan that row-group min/max statistics can skip
  to. The revision is a hash of source, filter, and order.
- Exact overview: one `GROUP BY` over `__granum_row * buckets // rowCount` per revision.
  The map can say exact.
- Complete search: text (`ILIKE`), the existing predicate queries (`field op value`), and
  dates become parameterized SQL with quoted identifiers. `complete: true` is honest
  because the database checked every row.
- Chapters from a date column (`date_trunc`), markers from metric extremes or a host
  query.
- Cancellation: interrupt what DuckDB can interrupt. The session's cap on in-flight
  requests already bounds the rest.
- DuckDB's dialect only. The guide says what another engine needs: a materialized order
  column or index. Postgres `OFFSET` is linear and does not qualify.

### `@granum-grid/parquet`

- Move `demo/src/data/parquet.ts` (511 lines, 8 unit tests) into the package. It already
  imports only types from the library. `hyparquet` becomes a peer with a tested range.
- Add the warning next-steps.md listed: when one row group's compressed size passes a
  threshold, say what each jump will download.

### `/dom`: native scrolling

- The embedded viewport becomes `overflow: auto` over a spacer capped near 8 million px.
  Small scroll deltas (wheel, trackpad, touch, keys) move the engine by exact pixels; a
  large delta (a scrollbar drag) maps to a global address. This is HighTable's
  local/global technique, with Granum's float engine as the source of truth.
- Programmatic jumps scroll instantly and re-anchor. No animated programmatic scrolling.
- `layout="page"` uses the same mapping on the window instead of its own wheel handling.
- Removed with it: wheel ownership, inertia, edge elasticity, touch panning,
  `touch-action: none`, and the `inertia`, `edgeElasticity`, and `automaticAggregation`
  feature switches.
- Dynamic heights: local deltas walk measured sizes. This is the hardest case; HighTable
  supports fixed heights only. See Risks.

### `/dom`: a framework-free controller

- Move the orchestration in `react/useGranumGrid.ts` (663 lines) into
  `createGridController(options)`: provider, engine, and session lifecycle; row slots;
  selection; announcements; the `GranumGridApi` handle. It exposes `subscribe` and
  `getState`.
- `mount(element, { provider, renderRow(element, row) })` renders rows without a
  framework.
- `useGranumGrid` becomes a `useSyncExternalStore` adapter. Files under `react/` that
  only touch the DOM (`input.ts`, `keyboard.ts`, `dom.ts`, `platform.ts`, and the logic
  in `useWindowScroll.ts` and `useRowMeasurements.ts`) move to `/dom`.

### `/map`: the map on its own

- Split `react/AtlasRail.tsx` (799 lines) into a controller (pointer math, precision
  steps, magnetism, keyboard slider, hover, selection, visited trail) and a renderer
  (canvas plus a few positioned elements), both framework-free. The React `AtlasRail`
  wraps them.
- `MapTarget` is the contract with any scroller: `rowCount`, `getVisibleRange()`,
  `subscribe()`, `scrollToIndex()`, and optional `beginScrub`, `scrub`, and `endScrub`
  for precise drags. Adapters: Granum's controller and a plain scroll element. TanStack
  Virtual gets a recipe in the docs, not a dependency.
- Overview data comes from a provider's `fetchOverview` or a plain `Bucket[]`.
- Back and Forward stay with Granum's engine. An external scroller gets seeking, drags,
  markers, and hover, not history.

### Accessibility

- Replace `role="grid"` with the pattern chosen in Phase 2. Keep the logical
  `aria-rowcount`, one-based `aria-rowindex`, the map's slider, and its keyboard targets.

### Demo: keeps growing, each feature on a public package

1. **Open anything** is the landing page. Paste a URL or drop a local Parquet, CSV, or
   NDJSON file. DuckDB-WASM loads in a worker on first use, then rows and an exact map
   appear. The page says that local files never leave the browser. FineWeb stays the
   default URL.
2. **Filter and sort as revisions.** A WHERE and ORDER BY bar publishes a new revision,
   and a small revision strip switches back. Bookmarks show which revision they belong
   to, which teaches the identity model instead of hiding it.
3. **Links to a row.** The URL carries the source URL, the revision's query, and the row,
   so "row 486,996 of this 2 GB file where status >= 500" is a link someone can open.
   This extends the existing view URL.
4. **Bring your own scroller.** One map beside three scrollers: Granum's viewport over 4
   billion rows, TanStack Virtual over a million, and a plain overflow list of ten
   thousand.
5. **No framework.** A plain HTML page with `mount()` and the map, without React.
6. **Show the provider.** Each dataset card reveals the code behind it: a few lines for
   SQL and Parquet, the whole adapter for Hacker News.

Not in the demo: AI queries, extra charts, a column editor.

## Pruning

### Library

| Cut                                                                                     | Size                                                                    | Reason                                                                                                                                        |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Flights, `ViewCanvas`, "Overview during travel", `createZoomMapping`, `features.flight` | 91-line component, engine flight code, 28 dependent lines               | Conflicts with native scrolling; the map already shows the move.                                                                              |
| Wheel ownership, inertia, edge elasticity, touch panning, their feature switches        | Most of `react/input.ts` (271 lines)                                    | Replaced by native scrolling. `automaticAggregation` is already off by default.                                                               |
| Frame-rate sampling in `onStats` (`useFrameRate.ts`)                                    | 39 lines                                                                | Profiling belongs in the demo's debug panel. Cache and request counts stay.                                                                   |
| The `features` object                                                                   | `features.ts` and its plumbing                                          | After the cuts only `transitions`, `progressiveEstimates`, and `prefetch` remain; make them plain options or drop them. Reduced motion stays. |
| Compatibility for the deepscroll rename                                                 | `ds-*` hooks, `deepscroll-*` keys, wiki manifest name                   | Free to change now, breaking later.                                                                                                           |
| Candidate: `fetchOverviewTracks` and the track selector                                 | Provider method, rail UI; used by Binance and the synthetic signal only | One overview per provider until an integrator asks. Decide in Phase 0.                                                                        |
| Candidate: toolbar, footer, and sticky chapter (`ExplorerChrome.tsx`, 140 lines)        | Opt-in today                                                            | Application chrome; becomes a demo recipe unless an integrator uses it.                                                                       |

### Demo

| Cut                                                                                              | Size                                            | Reason                                                                    |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------- |
| Human genome, Market tape, Star catalog                                                          | About 1,090 lines, 3 film scenes, 3 screenshots | Already decided in next-steps.md; waits for the pending media work.       |
| Bitcoin (Binance)                                                                                | About 694 lines                                 | See decisions.                                                            |
| Performance dataset and trace import                                                             | About 800 lines                                 | See decisions. The HTTP example stays.                                    |
| GitHub wiki mirror: `docs/wiki/` (36 KB), `scripts/wiki.mjs` and its test, the "Deploy wiki" job | Job fails today                                 | Duplicates the docs. The lessons stay as demo pages checked against code. |

Kept: FineWeb Parquet (default), Hacker News (real, live, shows provider search), Server
logs and Signal archive (most tests, the hero image), the HTTP example, the four lessons,
and `demo/src/explorer` (it shows composition through the public API).

Test churn from the dataset cuts: the `datasets`, `row-inspection`, `debug`, `api`,
`map-chart`, and `performance` specs mention cut datasets.

### Docs and repository

- About 142 KB of Markdown for a 7,000-line library. The README shrinks to one screen:
  the pitch, a ten-line example, links. Package READMEs carry install and API. The guide
  becomes the reference, split by package. QUICK_START folds into the package READMEs.
  PUBLISHING becomes a checklist. AGENTS.md and the AI workflow stay, linked from
  contributor docs rather than the user README.
- Local and ignored, safe to delete: `output/` (221 MB), `.playwright-cli/`, and the
  stale `deepscroll-0.1.0.tgz`.

### Not up for pruning

The float-address engine and its history; the data session with revision identity,
aborts, timeouts, and the in-flight cap; exact, estimated, and unavailable labels and
search completeness; dynamic row heights and anchoring; append and follow modes;
typed jumps (`JumpBar`); the map's precision drags, magnetism, markers, chapters, and
magnifier; selection; saved views; SSR-safe imports.

## Phases

Every phase ends with `npm run check` and `npm run release:check` green, plus its own
checks. Effort is in focused days. Device, screen-reader, and integrator checks need
people and do not compress.

### Phase 0: decide, prune, draw the lines (2–3 days)

1. Done 2026-10-14: the maintainer accepted the recommendations.
2. Done 2026-10-14: the maintainer had the pending media work reviewed and landed
   (`c61fee2`). Then genome, market, stars, Bitcoin, and the Performance gallery entry and
   trace import were cut (the recording stays for the HTTP example and lesson);
   row-inspection tests moved to the Parquet fixture; `docs/wiki/` became `docs/lessons/`;
   the README was rewritten around the current playground; and the media studio was frozen
   on the local `media-studio` branch (not pushed), with `main` keeping the film's captions,
   description, and music credit.
3. Done 2026-10-14: `automaticAggregation` and frame-rate sampling left the library (the
   playground samples frames itself in `demo/src/useFrameRate.ts`); deepscroll storage
   keys renamed; the GitHub Wiki sync script, its test, CI job, and sidebar removed.
4. Done 2026-10-14: `react/input.ts`, `keyboard.ts`, and `dom.ts` (now `targets.ts`) moved
   to `dom/`; `visuals/` became `map/`; the layer lint rule and per-entry size budgets are
   in place.

Exit: no behavior change besides the cuts, and budgets enforced.

### Phase 1: data adapters (5–7 days)

1. Done 2026-10-14 (spike in the session scratchpad, not committed): at 10M rows a deep
   `fetchRows` took under 1 ms with integer addresses (3–5 ms by `rowid`), a sorted
   revision 2–3 s, the 320-group map 0.2–0.3 s; both kill criteria pass. At 30M rows every
   single-sort build ran out of memory (4 GB WebAssembly cap, 3.1 GB DuckDB limit, no
   spill to disk), so the playground states a ceiling of about ten million rows. Traps
   found and avoided: numbers bound as parameters become DOUBLE and defeat row-group
   skipping (the provider writes integers into SQL), `query()` cannot be canceled
   (the playground uses `send()` with a 10 ms polling interval), and `OFFSET` paging is
   unusable. Measurements are in `packages/sql/README.md`.
2. Done 2026-10-14: `@granum-grid/parquet` lives in `packages/parquet` with hyparquet as a
   peer. Decompressors are injected (`compressors`), `openParquetFile` takes an options
   object, and `file.largestRowGroupBytes` and `file.pageIndex` let the playground say
   what a jump costs. `test:package` installs its tarball beside `granum-grid` and reads
   the fixture through it; its budget is 3.3 KiB with hyparquet external.
3. Done 2026-10-14 (browser test pending with the demo): `@granum-grid/sql` in `packages/sql`.
   `createSqlSource({ query, id, from })` describes columns; `open(view)` builds a revision
   table and returns a provider addressed by `rowid`, with exact overview and aggregates,
   wrapping search (text, predicates, dates), peaks, and chapters only when each period is
   contiguous. Ten unit tests run against DuckDB 1.5 on Node (`@duckdb/node-api`
   1.5.6-r.1, pinned); `test:package` checks the tarball with a stand-in database. Budget
   3.8 KiB.
4. Demo, partly done 2026-10-14: the **Your file (SQL)** card opens a dropped or chosen
   Parquet, CSV, or JSON file, or a generated million-request sample, in DuckDB-WASM
   1.32.0 (DuckDB v1.4.3, pinned; only the `eh` build ships, about 7.7 MB gzipped and
   loaded on first use). A Where / Order by / Map bar opens revisions, and the last three
   are kept to switch between. Filtering and sorting the million-row sample took about
   30 ms. `demo/tests/sql.spec.ts` passes in Chromium, Firefox, and WebKit and on the
   production build. Found on the way: DuckDB-WASM downloads its Parquet, JSON, and ICU
   readers (signed extensions) from extensions.duckdb.org, so the page says so instead of
   "nothing leaves the page". Done 2026-10-15: the build downloads them once, checks
   pinned SHA-256 hashes, and serves them beside the page (`demo/server/duckdb-extensions.ts`);
   the page sets `custom_extension_repository` to that copy, and the page says nothing
   leaves it. Done later the same day: **Link to this row** for the Parquet set (bundled or
   pasted URL) copies a link that reopens the file at that row, and every dataset's intro
   has **How this dataset connects**, showing type-checked example modules
   (`demo/src/examples`, imported with `?raw`) and the adapter's source; generated sets say
   they are generated and show what a provider for your own server looks like.

Exit: a local file shows rows and an exact map with ten lines of host code or fewer, SQL
search reports complete results, and browser tests pass in all three engines.

### Phase 2: native scrolling and accessibility (6–9 days, the riskiest)

1. Done 2026-10-14: `dom/scroll.ts` binds an element scroller (embedded) or the window
   (page layout) to the engine over a spacer capped at 8 million px. Steps up to two
   viewports move rows by exact pixels; longer steps (a scrollbar drag) go to the mapped
   address; the mapping is one to one within four viewports of each end and compressed
   between, re-anchored near the ends and after each pause. Rows sit in a layer kept at
   the scroll offset (`getLayerProps()`), so headless layouts need it too.
2. Done for the automated suite: dynamic heights use the same mapping (offsets follow
   `rowSizes`); the `dynamic` spec passed unchanged. Not yet felt by a person.
3. Done 2026-10-14: flights and `ViewCanvas` removed first (commit `4430c86`), then the
   custom wheel, inertia, elastic edges, touch panning, `edgeOffset`, and the
   `inertia`/`edgeElasticity` switches. Tests changed only where they asserted custom
   physics: synthetic `WheelEvent`s (which never scroll natively) became real
   `page.mouse.wheel` input; the acceptance spec now asserts a bounded spacer instead of
   none; the page-layout progress check allows the 0.0001 the exact end zones cost.
4. ARIA pattern, decided 2026-10-15 without a session: `grid` with cell navigation, so
   integrators' `role="gridcell"` markup stays. `aria-activedescendant` names a cell of
   the focused row, and Left and Right move between cells (`createActiveCell`). Waiting
   on a person: a VoiceOver session to confirm it ([launch.md](launch.md), step 2), and
   the device checks below.

Exit: three-browser suite green, touch hands off to the page at both ends, and device
and screen-reader notes recorded here. People check a macOS trackpad, a Windows precision
touchpad, an iPhone, and an Android phone, and run VoiceOver and NVDA.

### Phase 3: split, publish 0.2, find users (2–3 days, then ongoing)

1. Done 2026-10-14: `granum-grid/` became `packages/core` (`@granum-grid/core`: `.`, `/data`,
   `/dom`, `/map`, `/internal`, CSS) and `packages/react` (`@granum-grid/react`, `/headless`,
   CSS copied from core). The maintainer chose the `@granum` scope and the `gr-` CSS
   prefix; on 2026-10-15 the scope became `@granum-grid`, because an npm user named
   `granum` holds `@granum`. `test:package` packs all four and installs them together
   in React 18.2 and 19 consumers; it also proves no core file imports React. The `ds-` →
   `gr-` rename followed, and [CHANGELOG.md](../../CHANGELOG.md) lists what changed since
   the GitHub-only `granum-grid` 0.1.0. Nothing was ever published, so the first npm
   release stays 0.1.0 as [PUBLISHING.md](../PUBLISHING.md) describes.
2. A 60-second screen recording replaces the film in the README.
3. The maintainer publishes after `npm login`.
4. A Show HN built on "paste a Parquet URL or drop a file and scroll all of it with a
   map", posts in the DuckDB and hyparquet communities, and the integration report
   template.

Exit: published, and new features frozen until three reports arrive.

### Phase 4: framework-free controller (4–6 days, 0.3)

1. Done 2026-10-14, with a change of approach: instead of one `createGridController`, the
   hook's framework-free work moved into `@granum-grid/core/dom` pieces (`rowMapping`,
   `rowWindow`, `createRowMeasurements`, `createRowRequests`, `observeViewport`,
   `jumpAnnouncement`, beside `bindScroll` and the key handlers). The React hook and the new
   `mount()` compose the same pieces, so there is one implementation with two thin
   bindings, and the hook kept its React lifecycle (keyed engine and session, controlled
   selection) without a risky rewrite. `mount()` has no map yet; follow mode, row
   activation, and search UI are React-only.
2. Done: the playground's **No framework** page (`demo/vanilla.html`) mounts a billion
   computed rows; `demo/tests/vanilla.spec.ts` covers jumps, Back, End/Home, native wheel
   scrolling, and that no React module loads, in three browsers and on the production
   build. The full acceptance spec still runs against React only.

Exit (adjusted): the React suite passes unchanged on the shared pieces, and the plain-DOM
page passes its own spec.

### Phase 5: the map on its own (5–7 days, 0.3)

1. Done 2026-10-14, smaller than planned. The drag math (sideways precision, marker and
   peak snapping, grabbing the thumb) moved from `AtlasRail` into `@granum-grid/core/map`
   (`beginScrub`, `moveScrub`, `rowAtPointer`), and `AtlasRail` now calls it. `mountMap`
   is a new plain-DOM map on the same pieces: profile, rows in view, markers, the drag, and
   slider keys. It is not the renderer under `AtlasRail`: hover previews, help, the axis,
   the chart picker, range selection, and the marker list stay React-only. Rewriting
   `AtlasRail` as a wrapper would have touched about 800 lines of tested UI for no user
   yet; wait for a request.
2. Done: `MapTarget` (`rowCount`, `visibleRange`, `subscribe`, `scrollToIndex`, optional
   `beginScrub`/`scrub`/`endScrub`) with `gridTarget` for Granum and `scrollerTarget` for a
   plain scroll element. The navigation handle gained `beginScrub`/`scrub`/`endScrub` so an
   external map's drag is one history entry. The TanStack Virtual target is a recipe in the
   demo, not an adapter package.
3. Done: the playground's **Your own scroller** page (`demo/scrollers.html`) puts one map
   beside Granum (4 billion rows), TanStack Virtual 3.17 (500,000), and a plain list
   (10,000); `demo/tests/scrollers.spec.ts` covers jumps, marker clicks, keys, native
   scrolling back into the map, a 1/20-speed drag, and that no React module loads.

Exit (met): the `map-chart` and `map-gravity` specs pass unchanged on the shared drag math,
and the external scrollers have tests. Not done: the map inside `mount()` (two calls
work), and `AtlasRail`'s extra features without React.

Phases 4 and 5 follow publication on purpose. Integrator reports decide which matters
more, and both add exports without breaking 0.2 imports.

Total: roughly 25–35 focused days, before human checks and outreach.

### Later, only when asked

Custom elements, Vue or Svelte packages, server recipes (DuckDB over HTTP, ClickHouse),
Arrow IPC, and a minimal column header with widths.

## Risks

- **Third-party code at run time.** Resolved 2026-10-15. DuckDB-WASM fetched its
  Parquet, JSON, and ICU extensions from extensions.duckdb.org, so the playground depended
  on that host and told it a file was being opened. The demo's Vite plugin
  (`demo/server/duckdb-extensions.ts`) now downloads those three files for DuckDB v1.4.3
  (`wasm_eh`), refuses any whose SHA-256 differs from the pinned one, serves them in dev,
  and emits them into the build (about 10 MB, 3 MB gzipped, fetched only when a file needs
  them). The page points `custom_extension_repository` at that copy, and DuckDB still
  checks the signatures. Bumping `@duckdb/duckdb-wasm` fails the build until the list is
  updated. The build, not the visitor, now needs extensions.duckdb.org. A condition that
  needs any other extension fails with DuckDB's error instead of reaching another host.

- **Native scrolling with variable heights at billions of rows is unproven.** HighTable
  supports fixed heights only. Fallback: ship native scrolling for fixed heights and keep
  today's input path for `dynamicRowHeight` for one release at most, documented, not as
  a permanent option.
- **DuckDB-WASM costs.** A payload of several MB (load it only for Open anything), a 4 GB
  memory ceiling, one thread by default, and coarse cancellation. Its npm package was hit
  by a supply-chain compromise in 2025: pin an exact version, load it from a pinned URL
  or self-host it, and record the checksum.
- **Competitors may add a map.** HighTable or another table may add one. Phase 5 widens
  reach to their users.
- **Concurrent edits.** Two agents have edited this checkout at once. Each phase starts
  from a clean `git status` and ends with a commit.
- **Maintenance.** A published library is a commitment of years, not weeks.

## Kill criteria

- If six weeks after Phase 3 fewer than three people have tried it with their own data,
  stop feature work. Keep the published packages and the playground as a portfolio piece.
- If the Phase 1 spike misses its numbers, rows stay on the Parquet reader and SQL serves
  only search and the overview.
- If Phase 2 cannot make dynamic heights feel native within 9 days, ship fixed-height
  native scrolling with the documented fallback.

## Validation evidence

Baseline on 2026-10-14: `npm run check` passed with 140 unit tests.

Phase 0 steps 3–4 (2026-10-14): `npm run lint` and `npm run check` pass (140 unit tests);
a probe file importing React and `react/` from `core/` fails lint as intended.

Extensions on this site (2026-10-15): `npm run lint`, `npm run check` (148 unit tests), and
`npm run build` pass; `demo/tests/sql.spec.ts` passes in Chromium, Firefox, and WebKit on
the dev server and in Firefox and WebKit on the production build, now asserting that no
request leaves the page; `npm run test:pages` opens a Parquet file under a project path. A
corrupted cache file is downloaded again, and a wrong pinned hash fails the build.

## Next action

The maintainer answers the decisions table, above all the package names and flights.
Phase 0 step 2 waits for the pending media work; steps 3 and 4 can start right away.

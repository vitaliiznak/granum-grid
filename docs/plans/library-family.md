# Plan: Granum as a small family of libraries

Status: in progress since 2026-10-14. The maintainer accepted the recommendations in the
decisions table; creating the `@granum` npm org is still theirs to do before Phase 3. It
extends [next-steps.md](next-steps.md); that plan's remaining work (publish to npm, cut
three generated datasets) folds into Phase 0 and Phase 3 below.

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

| Decision                            | Recommendation                                                                                                                                                                                                                                                                                         | Reason                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package names                       | `@granum/*` if the maintainer can create the npm org `granum`; otherwise `@granum-grid/*`. Unscoped `granum` is taken; `@granum/core`, `@granum/react`, and `granum-grid` return 404 today. Decide before the first publish.                                                                          | A scope suits a family and drops "grid" from package names; the product is not a grid. Renaming after publication breaks imports.                                                                                                                                         |
| How many packages                   | Four at 0.2: `core`, `react`, `parquet`, `sql`. The DOM controller and the map are subpaths of `core` (`/dom`, `/map`) until someone uses them alone.                                                                                                                                                  | Data adapters bring their own peers. Fewer packages mean fewer versions, changelogs, and consumer tests.                                                                                                                                                                    |
| Long-jump flights and `ViewCanvas`  | Cut. Jumps are instant; the map's viewport marker moves and arriving rows fade in.                                                                                                                                                                                                                     | Animated programmatic scrolling fights native scrolling; [HighTable hit the same conflict](https://rednegra.net/blog/20260212-virtual-scroll/). Removes flight state from the engine, 28 lines that read `traveling`, `flightSpan`, or `targetIndex`, and `createZoomMapping`. |
| ARIA pattern                        | Decide in Phase 2 after one screen-reader session: `table` with rows and cells, or `grid` with real cell navigation. `table` if undecided.                                                                                                                                                             | Today's `grid` announces a pattern the keyboard does not support.                                                                                                                                                                                                          |
| Bitcoin (Binance)                   | Cut. A market example, if wanted, becomes a static Parquet of candles through the Parquet adapter.                                                                                                                                                                                                     | The README already says Binance blocks some regions; about 694 lines with a request budget and approximate summaries.                                                                                                                                                       |
| Performance trace                   | Cut from the gallery. Keep the HTTP example page as the "your own server" recipe.                                                                                                                                                                                                                      | 1.3K events undercut a billion-row pitch; about 800 lines with the import UI, recorder script, and fixture.                                                                                                                                                                 |
| Media studio and film               | Freeze after the pending media work lands; move it to its own branch. A 60-second screen recording replaces the film at 0.2.                                                                                                                                                                          | Scrolling and the dataset list will change, and each change means re-rendering the film.                                                                                                                                                                                   |
| CSS hook prefix and old names       | Rename `ds-*` once, together with the package names, before 0.2. Drop the `deepscroll-*` storage keys and wiki manifest name.                                                                                                                                                                          | No users yet. The compatibility kept after the deepscroll rename protects nobody and will be breaking later.                                                                                                                                                                |

## Target shape

```text
@granum/core        framework-free, no dependencies, ships the CSS
  .                 engine, row sizes, mappings, navigation, history, saved views
  /data             provider contract, DataSession, PageCache, array and cursor helpers
  /dom              viewport controller: native scrolling, keys, measurement,
                    page layout, announcements; mount() for plain-DOM rows
  /map              map controller and canvas renderer; MapTarget adapters
@granum/react       useGranumGrid, GranumGrid, AtlasRail, JumpBar as thin wrappers
@granum/parquet     Parquet over HTTP range requests (peer: hyparquet)
@granum/sql         SQL provider in DuckDB's dialect; the host passes query()
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
`@granum/vue` or `@granum/svelte` if an integrator needs more.

## Features to build

### `@granum/sql`: the integration barrier goes away

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

### `@granum/parquet`

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

| Cut                                                                                       | Size                                                       | Reason                                                                                     |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Flights, `ViewCanvas`, "Overview during travel", `createZoomMapping`, `features.flight`   | 91-line component, engine flight code, 28 dependent lines  | Conflicts with native scrolling; the map already shows the move.                           |
| Wheel ownership, inertia, edge elasticity, touch panning, their feature switches          | Most of `react/input.ts` (271 lines)                       | Replaced by native scrolling. `automaticAggregation` is already off by default.            |
| Frame-rate sampling in `onStats` (`useFrameRate.ts`)                                      | 39 lines                                                   | Profiling belongs in the demo's debug panel. Cache and request counts stay.                |
| The `features` object                                                                      | `features.ts` and its plumbing                             | After the cuts only `transitions`, `progressiveEstimates`, and `prefetch` remain; make them plain options or drop them. Reduced motion stays. |
| Compatibility for the deepscroll rename                                                   | `ds-*` hooks, `deepscroll-*` keys, wiki manifest name       | Free to change now, breaking later.                                                        |
| Candidate: `fetchOverviewTracks` and the track selector                                    | Provider method, rail UI; used by Binance and the synthetic signal only | One overview per provider until an integrator asks. Decide in Phase 0.         |
| Candidate: toolbar, footer, and sticky chapter (`ExplorerChrome.tsx`, 140 lines)           | Opt-in today                                               | Application chrome; becomes a demo recipe unless an integrator uses it.                    |

### Demo

| Cut                                                                                         | Size                                  | Reason                                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| Human genome, Market tape, Star catalog                                                     | About 1,090 lines, 3 film scenes, 3 screenshots | Already decided in next-steps.md; waits for the pending media work. |
| Bitcoin (Binance)                                                                           | About 694 lines                       | See decisions.                                                            |
| Performance dataset and trace import                                                        | About 800 lines                       | See decisions. The HTTP example stays.                                    |
| GitHub wiki mirror: `docs/wiki/` (36 KB), `scripts/wiki.mjs` and its test, the "Deploy wiki" job | Job fails today                   | Duplicates the docs. The lessons stay as demo pages checked against code. |

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
2. Waiting: after the pending media work lands (`README.md` and `media/` are modified in
   the working tree), cut the three generated datasets, Bitcoin, and Performance, update
   the specs that mention them, and rename `docs/wiki/` to `docs/lessons/` (the README
   links to it).
3. Done 2026-10-14: `automaticAggregation` and frame-rate sampling left the library (the
   playground samples frames itself in `demo/src/useFrameRate.ts`); deepscroll storage
   keys renamed; the GitHub Wiki sync script, its test, CI job, and sidebar removed.
4. Done 2026-10-14: `react/input.ts`, `keyboard.ts`, and `dom.ts` (now `targets.ts`) moved
   to `dom/`; `visuals/` became `map/`; the layer lint rule and per-entry size budgets are
   in place.

Exit: no behavior change besides the cuts, and budgets enforced.

### Phase 1: data adapters (5–7 days)

1. A one-day throwaway spike: DuckDB-WASM in Chrome, Firefox, and Safari with 1M, 10M,
   and 50M-row files. Measure time to build a revision, `fetchRows` on the last page,
   the overview scan, and memory. If a deep `fetchRows` at 10M rows takes over ~100 ms or
   a revision takes over ~10 s, SQL serves only search and the overview, and rows stay on
   the Parquet reader.
2. Done 2026-10-14: `@granum/parquet` lives in `packages/parquet` with hyparquet as a
   peer. Decompressors are injected (`compressors`), `openParquetFile` takes an options
   object, and `file.largestRowGroupBytes` and `file.pageIndex` let the playground say
   what a jump costs. `test:package` installs its tarball beside `granum-grid` and reads
   the fixture through it; its budget is 3.3 KiB with hyparquet external.
3. Done 2026-10-14 (browser test pending with the demo): `@granum/sql` in `packages/sql`.
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
   "nothing leaves the page"; self-hosting them at build time, with checksums, is a
   follow-up. Still to do: links to a row for URL sources, and show the provider.

Exit: a local file shows rows and an exact map with ten lines of host code or fewer, SQL
search reports complete results, and browser tests pass in all three engines.

### Phase 2: native scrolling and accessibility (6–9 days, the riskiest)

1. Local/global native scrolling for fixed heights, in embedded and page layouts.
2. Dynamic heights on the same mapping. The measurement-anchoring tests stay green
   unchanged.
3. Remove custom physics and flights. Rewrite only the assertions in the `interactions`,
   `exploration`, `defaults`, and `performance` specs that test custom physics, not
   those that test anchoring or history.
4. The ARIA pattern from the screen-reader session.

Exit: three-browser suite green, touch hands off to the page at both ends, and device
and screen-reader notes recorded here. People check a macOS trackpad, a Windows precision
touchpad, an iPhone, and an Android phone, and run VoiceOver and NVDA.

### Phase 3: split, publish 0.2, find users (2–3 days, then ongoing)

1. Split into `core`, `react`, `parquet`, and `sql` under the chosen names. Consumer
   tests per package (React 18 and 19 for `react`), lockstep versions, a changelog.
2. A 60-second screen recording replaces the film in the README.
3. The maintainer publishes after `npm login`.
4. A Show HN built on "paste a Parquet URL or drop a file and scroll all of it with a
   map", posts in the DuckDB and hyparquet communities, and the integration report
   template.

Exit: published, and new features frozen until three reports arrive.

### Phase 4: framework-free controller (4–6 days, 0.3)

1. `createGridController` and `mount()`. The hook becomes an adapter.
2. Demo: the No framework page. The acceptance spec runs against React and plain DOM.

Exit: the same spec passes for both.

### Phase 5: the map on its own (5–7 days, 0.3)

1. The map controller and renderer, `AtlasRail` as a wrapper, `MapTarget` and its
   adapters.
2. Demo: Bring your own scroller.

Exit: the `map-chart` and `map-gravity` specs pass unchanged, and the external scrollers
have tests.

Phases 4 and 5 follow publication on purpose. Integrator reports decide which matters
more, and both add exports without breaking 0.2 imports.

Total: roughly 25–35 focused days, before human checks and outreach.

### Later, only when asked

Custom elements, Vue or Svelte packages, server recipes (DuckDB over HTTP, ClickHouse),
Arrow IPC, and a minimal column header with widths.

## Risks

- **Third-party code at run time.** DuckDB-WASM fetches its extensions from
  extensions.duckdb.org for the pinned engine version. DuckDB checks their signatures, but
  the playground still depends on that host and tells it a file is being opened. Fix:
  download the extensions at build time with recorded checksums and point
  `custom_extension_repository` at the deployed copy.

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

## Next action

The maintainer answers the decisions table, above all the package names and flights.
Phase 0 step 2 waits for the pending media work; steps 3 and 4 can start right away.

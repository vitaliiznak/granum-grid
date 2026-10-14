# Granum Grid: design rationale

Why the explorer works the way it does. Current behavior and options are in the
[integration guide](docs/GUIDE.md) and [STYLING.md](STYLING.md); the code and tests are
the source of truth.

## Principles

- Granum Grid is for application teams whose data already lives in an order a server
  can count and slice: logs, traces, sensor archives, inventories, market tapes, and
  reference sequences. The reader arrives with a row number, a percentage, an event
  name, or a query, and leaves with that place saved, shared, or compared with another
  range. A spreadsheet grid fits when the client already holds the data and the work is
  arranging it; Granum Grid starts after the server has published an order.
  Unknown-length streams do not fit, because the address model needs a count.
- The whole dataset stays visible as a map while the main view keeps the current region
  readable. A precise row address, a chapter breadcrumb, and reversible jumps keep the
  reader oriented.
- Position is a floating, zero-based row address, independent of browser scroll height.
  The embedded viewport never uses a dataset-height spacer; page layout maps a bounded
  native scroll range to global progress.
- Visible rows are DOM content, for accessibility and custom rendering. Canvas draws the
  map and travel context, and important canvas targets have keyboard equivalents.
- A row count, ordered slice fetching, and a renderer are enough for useful navigation.
  Overview, chapters, markers, regional aggregates, and search are optional provider
  capabilities. The library never scans the dataset to imitate a missing capability,
  and estimates are never presented as exact values or exhaustive results.
- Columns, sorting, filtering, and editing belong to the server, because a large index
  cannot be rearranged in the browser. The host sends an intent and installs the new
  ordered revision the server returns ([server-owned ordering](docs/GUIDE.md#server-owned-ordering)).
  Addresses belong to one revision; only append-only growth keeps the revision.
- Work and memory are bounded by the viewport, pages, and requested buckets, not by
  dataset size. The library stays independent of the demo's data, worker, and latency.

## Map choice

Three scrollers were compared. All supported an overview, chapters, markers, a
magnifier, precision dragging, previews, and a visited trail.

- **Atlas rail (chosen):** a permanent, wide map beside the rows. Its shape is readable
  at rest, markers and chapters have room, previews do not cover rows, and precision
  never moves the global coordinate system. It costs horizontal space and adds a second
  local representation, the magnifier.
- **Focus ribbon (rejected):** a compact rail that expands under the pointer like a dock.
  Moving geometry makes targets harder to acquire and obscures global distance, the warp
  must freeze during drags, and touch has no hover.
- **Overview plus detail shuttle (rejected):** two adjacent tracks. Stable and precise,
  but the widest and most analytical option, with two drag surfaces to tell apart.

## Interaction rules

- The current address is the first fully visible row. Scrolling stops when the last row
  ends at the viewport's bottom, so the end never shows a blank viewport; a jump to a row
  below that point keeps it current until the reader moves. In page layout the native
  scroll range runs from the first row to that end, so its middle centers the middle row.
  The map always covers the whole dataset while the reading surface displays individual
  records.
- A wheel gesture belongs to whoever it starts in, as with native scroll latching: one
  that starts by pushing past either end scrolls the page, and one that starts by moving
  rows keeps them until it pauses for 200 ms. `overscroll-behavior: contain` on the
  viewport keeps every gesture. Mostly sideways wheels are never taken.
- Percent is a dataset address: 0% is the first row and 100% the last. Breadcrumbs never
  invent a precise timestamp from a bucket.
- A scrub is one history entry; Escape or pointer cancellation restores its start. Wheel
  motion is not history. Back restores the previous address and fractional offset, and
  new navigation after Back discards the forward branch.
- Drag precision depends on horizontal distance from the drag origin: full up to 48 px,
  then half, quarter beyond 112 px, and 1/20 beyond 208 px. Changing precision re-anchors
  the movement so the position never jumps.
- Magnetism prefers the nearest target deterministically, fast movement passes through,
  and Shift bypasses it. The magnifier follows the unsnapped address to avoid a feedback
  loop.
- Shortcuts act only inside the focused explorer and ignore editable fields. With no
  further target, navigation stays where it is instead of wrapping.
- Long jumps fly through a widened view with a bounded duration; new input stops a flight
  where it is. Reduced motion keeps the same destinations without flights, inertia, or
  elastic edges.
- Loading improves the screen locally: estimates first, then exact rows page by page,
  each with its own retry. An abort is not an error.

## Accessibility and acceptance

Exact rows use grid semantics with a logical `aria-rowcount` and one-based
`aria-rowindex`; column headings sit outside the counted rows. A stable focusable
viewport owns navigation. Committed jumps are announced after settling, not on every
frame or page. The map has an accessible position control and navigable marker and
chapter targets.

Automated tests cannot show that a first-time reader understands the map within two
seconds or finds Spike 3 unaided within ten. Those human checks, screen-reader user
testing, physical touch devices, and installed Safari remain outstanding. Frame-rate
results describe the test machine; 60 fps is a target, not a claim.

## Decisions

Choices a contributor needs before changing the library, with options decided against.

- **The default is a grid, not an app.** Three props render rows and the dataset map.
  The toolbar, footer, and heading row are opt-in (`toolbar`, `footer`, `header`); the
  playground, the HTTP page, and the lessons that teach Back pass them. The Go to dialog
  stays reachable from Cmd/Ctrl+K, `/`, and `api.openSearch()` without a toolbar. Elastic
  edges are off by default when embedded, because a box inside a page should stop at its
  ends like a plain scroller, and on with `layout="page"`, where the explorer owns the
  document; `defaultFeatures` lists the embedded value. The map's own legend labels its
  overview accuracy, so hiding the heading row never hides that label. Considered and not
  taken: hiding the map by default (it is the reason to choose this over a virtual list)
  and dropping the search shortcuts without a toolbar (they are invisible until used).

- **A thin public API: a few words, each used everywhere.** One handle,
  `GranumGridApi`, carries navigation, selection, saved views, search, and retry; raw
  `getLocation`/`restore` stay on the engine because views validate dataset and
  revision. The component's regions (`toolbar`, `rail`, `footer`) follow one rule (`true`
  or an object shows, `false` hides, a function replaces). The hook and component share
  `layout`, `dataMode`, and `initialView`; `AtlasRail` takes the same options as `rail`.
  The hook's session, mapping, and raw engine sit behind a key no entry exports, and the
  package test pins the root and headless runtime exports. Considered and not taken:
  grouping row options into objects (more nesting, unstable inline identities),
  compound components with context (hides the data flow the widgets show), a
  `theme: 'none'` value in place of `unstyled` (changes the CSS hooks), and dropping
  `ViewCanvas` (a headless layout would go blank during long jumps).

- **The library ships the explorer; the application ships application features.**
  Selection summaries, bookmarks and their storage, range comparison, and first-run
  hints live in `demo/src/explorer` and use only public entries: `panel`,
  `api.getVisibleRange()`, the rail's `selecting`/`onSelectingChange`, `readView`, and
  `checkBuckets`. The server owns sorting, filtering, and editing. Animated jumps, the
  visited trail, marker snapping, and precision dragging stay: they are the map's
  behavior, which no other component provides. Considered and not taken: a
  `granum-grid/explorer` entry for those tools (it would ship application decisions such
  as storage keys and copy).

- **Layers a host can stop at** ([reference](granum-grid/README.md#layers)). The hook
  holds no dialog, search, bookmark, or map-mode state, so a host owns every piece of
  explorer UI it shows and a list without search never captures its shortcuts.
  `JumpBar`, `AtlasRail`, and `ViewCanvas` are controlled widgets that take the hook's
  result as `grid`, not a hidden context, so each can be placed alone. Search runs
  through `DataSession.search`, so request statistics need no UI flag.

- **`features` is motion and data only.** Map layers are `AtlasRailOptions` alone, so
  there is no "feature wins over option" rule.

- **The library writes no browser storage.** The playground keeps bookmarks and dismissed
  hints under `granum-*` keys.

- **No compatibility for names nobody uses yet.** Before the first npm release there are no
  users to protect, so the deepscroll-era storage keys and wiki manifest are gone, and the
  `ds-*` style hooks are renamed once, together with the package names
  ([plan](docs/plans/library-family.md)). After a release, a rename needs a deprecation.

- **Row identity and layout.** A data session belongs to the provider's data, not its
  object: sessions are keyed by `id`, `revision`, `rowCount` (outside append mode), and
  which summary methods exist, so a provider rebuilt during render keeps its cached
  rows. Row height is layout, not identity: `rowHeight` and `dynamicRowHeight` change the
  engine in place (`setRowLayout`), so the current row, its offset, and history stay.

- **Row activation is optional and host-owned.** `onRowActivate` receives a loaded
  record and its address. Keyboard and pointer focus stay separate from the scroll anchor
  and the selection, so inspecting a row neither jumps nor adds history. The host owns
  the details panel, clipboard, Escape and focus restoration, and cleanup on a provider
  change.

- **One reading surface: rows beside the dataset map.** There are no range summaries,
  group-size controls, custom bands, or zoom navigation; the map supplies global context
  and selection statistics are optional provider data. Ctrl+wheel and pinch belong to the
  browser. Saved locations contain only the row address; removed `zoom` and `lens`
  bookmarks are rejected.

- **The map explains its statistic before its jump address, one chart at a time.**
  Compact rails keep the metric name visible; hover shows the metric, the group value
  with its accuracy, the jump row, and row examples, while group size, scale, and
  `metric.description` live in map help. Extra provider metrics are choices in a
  selector, so unrelated scales never look comparable. Peak attraction requires 8%
  prominence on the displayed scale, so ripples and missing data never attract. Host
  places are markers: the playground's bookmarks join provider markers through the
  `markers` prop and rank after errors and spikes. The rail's arrow keys pan one fixed
  row height, so the slider's step does not change with dynamic heights. `AtlasRail` is
  not fully memoized because it receives per-frame state.

- **One cascade layer, ordered by source.** Each stylesheet is a single `granum-grid`
  layer of zero-specificity rules, so a later rule for the same part always wins; keep
  one rule per part and section instead of appending overrides.

- **Lead with Parquet over HTTP range requests.** A Parquet footer lists every row
  group's row count, so the count is exact and any address costs one row group, with no
  server. The adapter (`@granum/parquet`, in `packages/parquet`) loads hyparquet on first
  use, so the main bundle grows by about 7 KB gzipped, and takes decompressors from the
  host rather than depending on `hyparquet-compressors` itself. It refuses a
  server that ignores byte ranges rather than downloading the file, shares an in-flight
  range between readers and aborts it only when all have gone, and reuses a redirect's
  target (Hugging Face redirects each read to a signed CDN URL; skipping the hop cut a
  read from about 0.6 s to 0.4 s). Its map reads at most 24 row groups, 6 at a time,
  because more concurrent reads slowed every CDN read and delayed the first rows; map
  hover shows summaries so it never downloads a group. There is no text search, which
  would read the whole file. Measurements are in the
  [guide](docs/GUIDE.md#a-file-without-a-server-parquet-over-http). Considered and not
  taken: Kafka partition offsets (a broker is not reachable from a browser without a
  proxy) and a log file with a line-offset index (Parquet's footer already is that
  index, and real files exist).

- **Demo modules the dev server loads stay build-free.** `demo/src/data/trace.ts`
  imports only types from `granum-grid`, and `searchIssue` stays internal to the
  library, so the trace plugin and `npm run dev` work without a library build.

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
  ordered revision the server returns ([server actions](docs/GUIDE.md#server-actions)).
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

- The current address is the first fully visible row. The map always covers the whole
  dataset while the reading surface displays individual records.
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

- **Row activation is optional and host-owned.** `onRowActivate` on the component
  and headless hook receives a loaded record and its address. The React adapter
  keeps keyboard/pointer focus separate from the scroll anchor and range selection,
  so inspecting a visible row neither jumps nor adds history. The host owns the
  details, clipboard action, Escape/focus restoration, and provider-change cleanup.
  The Bitcoin demo uses a non-modal panel with the loaded candle's precision and
  explicit missing/zero-trade states. The Hacker News demo uses the same panel to
  read an item's text, its links, and the parent and direct replies. The library
  contains no financial or news UI.

- **Keep the demo focused on the dataset explorer.** The page ends with keyboard
  shortcuts. Standalone live-feed, styling, and AI-tool playgrounds and the duplicate
  source/version footer are removed. Source notes stay beside the dataset, while
  append mode, styling, and the public integration API remain library capabilities
  documented in the guides.

- **Demo rows show scale honestly and align with their headings.** With a compact
  map, the header gives column headings exactly the rows' width and wraps the map's
  metric label (with its accuracy) in the column above the map, so headings after a
  flexible column stay over their values. Between the tablet and phone layouts, columns
  drop instead of being clipped. Recording durations span microseconds to tens of
  milliseconds, so their bars are logarithmic and labeled "log bar", while the number
  stays exact; events are grouped into DevTools-style phases by name, and unknown names
  stay "Other". Bitcoin seconds without trades repeat the last price, so they are muted
  rather than hidden, and a range is shown once when low equals high.

- **Explain the map's statistic before its jump address.** Compact rails keep the
  metric name visible. Hover details show only the metric, the group value with its
  accuracy, the jump row and row examples; group size, scale and provider-owned
  `metric.description` live in map help. Alternate tracks own their explanations.
  The magnifier is opt-in because it reuses the overview and adds no detail; short
  rails hide it and the row examples to leave room for the metric and navigation target.

- **Granum Grid naming.** The display name is Granum Grid; the package and library
  directory are `granum-grid`. The React component, hook, and associated types use
  `GranumGrid` / `useGranumGrid`, and both stylesheets use the `granum-grid` layer.
  Imports and consumers migrate together. The GitHub repository is
  `vitaliiznak/granum-grid`. Existing `ds-*` style hooks, browser storage keys,
  and the wiki sync manifest name stay stable to preserve styling, bookmarks,
  dismissed hints, and managed-page history. Recorded trace data keeps its
  original provenance.

- **One reading surface: rows beside the dataset map.** Remove Range summaries,
  group-size controls, custom bands, and stable zoom navigation. The map supplies
  global context; selection/comparison statistics remain optional provider data.
  Selection navigation opens the first selected row. Temporary overview context
  during travel still reuses the global profile. Ctrl+wheel and pinch belong to the
  browser. Saved locations contain only the row address; older row bookmarks load,
  while removed `zoom` and `lens` bookmarks are rejected.

- **A thin public API: a few words, each used everywhere.** One handle,
  `GranumGridApi`, carries navigation, selection, saved views, search, and retry; it
  replaced the separate `controller`/`controllerRef`, and raw `getLocation`/`restore`
  stay on the engine because views validate dataset and revision. The component's
  regions (`toolbar`, `tools`, `rail`, `footer`, `hints`) follow one rule (`false`
  hides, an object configures, a function replaces), which replaced thirteen flat
  props such as `renderRail`, `railActions`, `bookmarkStorageKey`, and `fullPageUrl`.
  The hook and component share `layout`, `dataMode` (`follow` absorbed `followOutput`),
  and `initialView` (absorbing `initialLocation` and `initialSelection`); `AtlasRail`
  takes the same options as `rail`. The hook's session, mapping, and raw engine sit
  behind a key no entry exports, so the published state shows only rows, prop getters,
  the handle, and display values. `showStats`, `measureFrameRate`, and the hook's
  `maxMeasuredRows` were removed: frame rate is sampled while `onStats` is supplied.
  Server validation helpers and `rangeProvider` moved to `granum-grid/data`, and the
  package test pins the root and headless runtime exports. Considered and not taken:
  grouping row options into objects (more nesting, unstable inline identities),
  compound components with context (hides the data flow the widgets now show), a
  `theme: 'none'` value in place of `unstyled` (changes the CSS hooks), and dropping
  `ViewCanvas` (a headless layout would go blank during long jumps).

- **Layers a host can stop at** ([reference](granum-grid/README.md#layers)). The hook
  holds no dialog, search, bookmark, or map-mode state, so a host owns every piece of
  explorer UI it shows and a list without search never captures its shortcuts.
  `JumpBar`, `AtlasRail`, and `ViewCanvas` are controlled widgets that take the hook's
  result as `grid`, not a hidden context, so each can be placed alone.
  `GranumGrid` owns the explorer state, keying search, highlights, and map selection by
  engine and bookmark markers by provider identity. Search runs through
  `DataSession.search`, so request statistics need no UI flag. Breaking these fields was
  acceptable because 0.1.0 is unpublished.

- **`features` is motion and data only.** Map layers are `AtlasRailOptions` alone
  (`precision` joined them), so there is no "feature wins over option" rule, and hints
  are the `GranumGrid` `hints` region. The demo's debug panel keeps its sixteen switches: `switchMap`
  turns a map switch that is off into a rail option override.

- **The library writes no browser storage on its own.** Bookmarks and dismissed hints
  persist only under a host's `tools.storageKey` / `hints.storageKey`; the demo passes
  its original `deepscroll-*` keys.

- **One chart at a time in the map.** Additional provider metrics are choices in a
  selector rather than narrow side-by-side plots, so unrelated scales never look
  comparable.
- **Peak attraction requires 8% prominence** on the displayed scale, computed from
  contiguous available overview groups, so small ripples and missing data never attract.
- **`searchIssue` stays internal.** Demo providers keep their own tested messages, and
  the dev server imports source so `npm run dev` works without a build.
- **The bundled trace is not lazy-loaded.** It is about 13 KB gzipped of a 48 KB main
  bundle and parses in under 1 ms; an asynchronous dataset model would cost more.
- **No shared debounced-request hook.** The two effects share about ten lines and handle
  state differently.
- **`AtlasRail` is not fully memoized.** It receives per-frame explorer state; targeted
  hover and lookup changes remove the avoidable work.
- **Similar-looking tests stay.** They check different contracts.
- **Bookmarks are markers.** Saved bookmarks publish `bookmark` markers into the same
  list as provider markers, so the map, N/P, magnetism, and named search treat them alike,
  and the Bookmarks panel lists provider markers too. They rank after errors and spikes:
  a reader's place names a group over a deploy but never hides an incident. The list is
  keyed by provider identity so a dataset switch never shows another dataset's bookmarks.
  A map click jumps to the row like any marker; restoring position and selection stays in the
  panel.
- **One cascade layer, ordered by source.** Each stylesheet is a single `granum-grid` layer of
  zero-specificity rules, so a later rule for the same part always wins; keep one rule per
  part and section instead of appending overrides. The skin's `page` layout has square
  corners.
- **The rail's arrow keys pan one fixed row height.** Routing them through
  `handleMovementKey` would change the slider's step with dynamic row heights.
- **Linked comparison panes share an unclamped progress ratio,** so a tall final row's
  fractional end carries over (`snapshot.progress` is clamped).
- **`demo/src/data/trace.ts` imports only types from `granum-grid`.** The dev server's trace
  plugin loads it without a library build.
- **No shared select component for map settings.** It was longer than the plain selects.

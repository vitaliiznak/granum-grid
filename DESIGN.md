# Granum Grid: design rationale

Why the explorer works the way it does. Current behavior and options are in the
[integration guide](docs/GUIDE.md) and [STYLING.md](STYLING.md); the code and tests are
the source of truth.

## Principles

- The whole dataset stays visible as a map while the main view keeps the current region
  readable. A precise row address, a chapter breadcrumb, and reversible jumps keep the
  reader oriented.
- Position is a floating, zero-based row address, independent of browser scroll height.
  The embedded viewport never uses a dataset-height spacer; page layout maps a bounded
  native scroll range to global progress.
- Visible rows are DOM content, for accessibility and custom rendering. Canvas draws the
  map and aggregate context, and important canvas targets have keyboard equivalents.
- A row count, ordered slice fetching, and a renderer are enough for useful navigation.
  Overview, chapters, markers, regional aggregates, and search are optional provider
  capabilities. The library never scans the dataset to imitate a missing capability,
  and estimates are never presented as exact values or exhaustive results.
- Columns, sorting, filtering, and editing belong to the server. The host sends an
  intent and installs the new ordered revision the server returns. The
  [manifest](docs/MANIFEST.md) says who the tool is for and why the split is there.
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

- The current address is the first fully visible row in Rows and the center row in
  Range summaries. Switching views keeps the address and adds no history.
- Percent is a dataset address: 0% is the first row and 100% the last. Breadcrumbs never
  invent a precise timestamp from a bucket.
- A scrub is one history entry; Escape or pointer cancellation restores its start. Wheel
  motion is not history. Back restores the previous address with its view and scale, and
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
chapter targets, and aggregate views offer an action to inspect exact rows.

Automated tests cannot show that a first-time reader understands the map within two
seconds or finds Spike 3 unaided within ten. Those human checks, screen-reader user
testing, physical touch devices, and installed Safari remain outstanding. Frame-rate
results describe the test machine; 60 fps is a target, not a claim.

## Decisions

- **Granum Grid naming.** The display name is Granum Grid; the package and library
  directory are `granum-grid`. The React component, hook, and associated types use
  `GranumGrid` / `useGranumGrid`, and both stylesheets use the `granum-grid` layer.
  Imports and consumers migrate together. Existing `ds-*` style hooks, browser
  storage keys, and the wiki sync manifest name stay stable to preserve styling,
  bookmarks, dismissed hints, and managed-page history. Recorded trace data keeps
  its original provenance. Repository and Pages links retain the existing
  `vitaliiznak/deepscroll` location until the remote repository is renamed.

- **Two reading modes: Rows and Range summaries.** The dataset map already supplies
  context while reading rows. Focused rows added a third interaction model and its
  own compression math; remove it, including the `lens` value and mapping exports.
  Saved views with that removed mode are rejected by normal view validation.

- **One chart at a time in the map.** Additional provider metrics are choices in a
  selector rather than narrow side-by-side plots, so unrelated scales never look
  comparable.
- **Peak attraction requires 8% prominence** on the displayed scale, computed from
  contiguous available overview groups, so small ripples and missing data never attract.
- **`searchIssue` stays internal.** Demo providers keep their own tested messages, and
  the dev server imports source so `npm run dev` works without a build.
- **`controllerRef` is not deprecated.** It is documented and used alongside `apiRef`.
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
  A map click jumps to the row like any marker; restoring zoom and selection stays in the
  panel.

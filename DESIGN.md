# deepscroll: interaction design

Status: Atlas rail (A) selected following the user's acceptance of the recommendation. Public API and folder layout in [API.md](./API.md) are approved for implementation.

## The experience

Explore 100 million rows with the confidence of moving through a map. The right-hand timeline makes the whole dataset visible; the main view makes the current region readable. A precise row address, a landmark breadcrumb, and reversible jumps keep the user oriented.

The first screen must already explain the demo: a visible overview with regime changes and numbered spikes, readable rows, and an address such as **Row 1 of 100,000,000 · 0.00%**. Fetching exact rows improves this screen locally rather than replacing it with a loading screen.

The demo is synthetic and explicitly labeled. Its overview, rows, landmarks, and spike markers must describe the same deterministic dataset. “100M rows” describes the navigable dataset, not the number materialized in memory.

## Scroller selection and alternatives

All three concepts support the required overview, chapters, markers, minimum-size thumb, magnifier, precision drag, preview, and visited trail. The difference is how they allocate space and explain precision.

### A. Atlas rail — selected

A permanent, relatively wide timeline with quiet chapter labels beside it. The overview is readable before interaction. Hover opens a local magnifier beside the rail while the full overview remains stable. Dragging left increases precision.

```text
 main view                          preview / drag label        right rail
 ┌──────────────────────────────┐                             ┌───────────┐
 │ 2017 › March › 14            │                       2010 ─┤ ▂▃▂     │
 │ #04812329   12:00   62.4      │                             │ ▃▅▃     │
 │ #04812330   12:01   64.1      │                 Spike 1  ───┤ ▃█▃  ◆1 │
 │ #04812331   12:02   63.7      │   ┌────────────────────┐    │ ─────── │ chapter
 │ #04812332   12:03   65.0      │   │ Row 4,812,331      │    │ ▅▆▅     │
 │ ...                          │   │ Mar 2017 · ¼ speed │════╪═[thumb] │
 │                              │   └────────────────────┘    │ ▂▂▃  ◆2 │
 │                              │       local magnifier       │ ▅█▅  ◆3 │
 │                              │          ▃▆█▆▃              │ ▃▃▂     │
 └──────────────────────────────┘                       2030 ─┤ ▂▃▂     │
 Row 4,812,331 of 100,000,000 · 4.81%                          └───────────┘
```

Advantages: the shape is visible immediately; markers and chapters have room; preview cards do not cover the rows being read; precision does not move the global coordinate system. Best fit for the acceptance tasks.

Trade-offs: reserves approximately 100–144 px on desktop; the magnifier adds a second local representation to understand. Narrow screens reduce labels and use a 56 px rail.

### B. Focus ribbon

A compact rail whose local region expands in place under the pointer, like a dock. Context compresses around the expanded region; markers and chapter separators follow the same monotonic warp.

```text
 rows                                  right ribbon
 ┌──────────────────────────────────┐       │▂│
 │ More horizontal room for columns │       │▅│
 │                                  │     ╭─▆─╮
 │                                  │     │ █ │ ← expanded local region
 │                                  │     │[=]│
 │                                  │     ╰─▃─╯
 └──────────────────────────────────┘       │▂│
```

Advantages: small footprint; precision appears directly under the cursor; visually distinctive without extra controls.

Trade-offs: moving geometry can make targets harder to acquire and obscure the meaning of global distance. The warp must freeze for pointer capture and preserve the row under the cursor, otherwise dragging can jump. Touch has no hover, so the expansion appears only after contact. Requires more usability testing.

### C. Overview + detail shuttle

Two adjacent tracks: a permanent overview and an automatically centered local detail track. Hover or drag sets the local interval. Both show markers; a connector shows which global interval the detail track covers.

```text
 rows                         overview   detail
 ┌─────────────────────────┐     ▂       ┌─────┐
 │                         │     █       │ ▃   │
 │                         │    [ ]──────│ █ ◆ │
 │                         │     ▆       │[===]│
 │                         │     ▃       │ ▅   │
 └─────────────────────────┘     ▂       └─────┘
```

Advantages: stable global orientation and excellent local targeting; useful for tightly clustered events; explicit scale separation.

Trade-offs: widest and most analytical-looking option; users must distinguish two drag surfaces. Detail interval changes need hysteresis so a target does not move while being acquired.

**Recommendation: A.** It makes the dataset legible at rest and puts precision beside an unchanged global overview. Its local magnifier expands the hovered region beside the track; B is the alternative if literal in-place dock expansion is preferred.

The following specifications use the selected Atlas rail. Rows and dependable navigation take priority; Lens and Zoom remain in the later planned phases. B and C are retained as design alternatives, not additional implementations in the initial scope.

## Main screen and orientation

```text
 deepscroll     SYNTHETIC · 100M ROWS                  Theme   Playground
 ┌──────────────────────────────────────────────────────────────────────┐
 │ [Back] [Forward]   2017 › March › 14       [Jump to row, date, event…] │
 │ [Rows] [Lens] [Zoom]                                                │
 ├───────────────────────────────────────────────────────┬──────────────┤
 │ Row             Timestamp          Category    Value  │              │
 │ 004,812,331      Mar 14 · 12:02      Alpha        63.7 │  persistent  │
 │ 004,812,332      Mar 14 · 12:03      Beta         65.0 │  overview    │
 │ ...                                                   │  rail        │
 ├───────────────────────────────────────────────────────┴──────────────┤
 │ Row 4,812,331 of 100,000,000 · 4.81%              Exact · 640 cached  │
 └──────────────────────────────────────────────────────────────────────┘
```

- The current address is the focus row: the first fully visible row in Rows, and the center row in Lens and Zoom. The address remains unchanged when switching views. A small anchor indicator shows where it appears in each view.
- The breadcrumb describes that same row. While exact metadata is unavailable, use chapter metadata or an explicitly approximate label; never invent a precise timestamp from a bucket.
- The footer always contains a human-readable, one-based row number, total, and percentage. Internally, position is a zero-based floating row index. Round only when displaying or fetching.
- Percent means dataset address: 0% is the first row, 100% the last. At the final address, the main view may show an end-of-data area below the final row; position does not silently move back a viewport.
- Column headings stay fixed. The main viewport never uses a dataset-height spacer or native vertical scrolling. Panel and dialog content may scroll normally.
- Keep visible rows as DOM content; use canvas for the rail and aggregate graphics. Important canvas targets have corresponding keyboard-accessible controls.

## Scroller behavior

### At rest

- Reserve a stable track height within the viewport. Full-dataset address maps linearly to track position regardless of active view or local zoom.
- Show a mean-value profile with a faint min/max envelope for the synthetic demo. Include a compact legend, **Value · mean / range**. Providers may instead supply density, labeled accordingly. Missing coverage is visually distinct from zero.
- Show chapter boundaries as small cuts across the graph. These are overlays and do not remove coordinate space. Collapse labels that collide; reveal their titles on hover or focus.
- Markers use both color and shape. Number the demo's major spikes, including **Spike 3**, so finding the third spike does not depend on guessing waveform peaks. Closely packed markers become a cluster that can be expanded in the magnifier.
- The thumb has a 24 px minimum and a separate fine address line. Its size is a usable hit target and is not a claim that 24 px represents the true viewport fraction. Clamp its body at the ends while the address line still reaches the exact endpoints.
- Visited positions appear as faint, capped, coalesced marks. Record settled exploration, not every animation frame. History and trail have different meanings: undoable navigation versus a visual record of visited areas.

### Hover and preview

- Draw a local magnifier immediately. For A, expand a neighborhood into a sidecar aligned with the hovered address; keep its central address visibly linked to the rail.
- After approximately 150 ms of stable hover, fetch three real rows for a preview. Until then, show the landmark and overview estimate with an **Approximate** label. Cancel the previous preview request on movement.
- Show row numbers, short timestamps, category, and values. The preview stays inside the viewport, does not steal focus, and never becomes a global loading indicator.
- Hovering a marker reveals its title and exact row. Keyboard focus reveals equivalent information. Touch gets the same label and preview during a held drag.

### Click and drag

- Clicking empty track commits a fly-to jump. Dragging starts a scrub transaction; release commits one history entry. Pressing Escape cancels the transaction and restores its starting address.
- Capture the pointer until release/cancel, even outside the track. A drag preserves the pointer-to-thumb offset. Pointer cancellation restores the starting address and stops motion.
- Show a large floating row number, landmark, and precision label throughout dragging. Also show the starting address as a faint rail mark.
- Desktop precision depends on horizontal distance from the drag origin: 0–48 px = full, 48–112 px = half, 112–208 px = quarter, beyond 208 px = fine (1/20). Show these levels as text; initial values are tuning candidates.
- Integrate vertical pointer deltas at the current precision. Changing horizontal precision must not remap an absolute pointer coordinate or teleport the position. Re-anchor the delta baseline at each level transition.
- Apply soft magnetic attraction near markers in the active scale, with approximately 6 px acquisition and 10 px release thresholds. Prefer the nearest marker deterministically; show its exact row in the label. Fast movement can pass through rather than sticking. Shift temporarily bypasses attraction.
- During a drag, the magnifier follows the unsnapped address. This avoids a feedback loop between snapping and local scale changes.
- On narrow touch screens, inward horizontal distance offers fewer precision levels. Exact jump input and local marker controls remain available for single-row targeting.

## Movement and motion

Wheel and trackpad input update the float position in row units after normalizing pixel/line/page deltas. Preserve fractional movement. Trackpads already emit momentum; do not automatically add a second inertia tail. Pointer/touch pans use measured velocity and decaying inertia after release. Touch handling is limited to the data surface so surrounding controls remain usable.

At an edge, clamp the logical address and draw a small, bounded elastic displacement that springs back. Never request negative rows or rows beyond the dataset. Reduced-motion mode disables the elastic effect and added inertia.

Fast movement temporarily blends rows into aggregates. Estimate speed from input, smooth it over time, and use separate enter/exit thresholds with a short settle delay to avoid flashing between representations. Show the approximate rows represented by a band. Slowing returns to exact rows at the same address. Automatic aggregation must not change the selected view or overwrite a user's Zoom scale.

For jumps larger than roughly two visible spans, perform a map-like flight: widen the visible range, travel, then resolve at the destination. Animate a location indicator on the global rail, leaving an origin tick. Short jumps translate directly. Target durations are approximately 160–420 ms, bounded regardless of distance. New input immediately cancels a flight at its current position.

Reduced motion keeps the same data and destination, with immediate relocation and stable origin/destination indicators. Ordinary local refinement uses a short opacity transition; no decorative movement is required to understand loading.

## Navigation and reversibility

### History

- Store the origin and destination of committed track jumps, jump-bar actions, chapter/marker navigation, Home/End, and compressed-region clicks. A whole scrub is one transaction. Ordinary wheel movement does not flood the stack.
- Back restores the pre-jump address and its view/scale. Forward restores the destination. New committed navigation after Back discards the forward branch.
- Keep small labeled Back/Forward buttons visible, with disabled states. Alt+Left/Right and mouse back/forward buttons act inside the focused explorer where the browser permits interception. Do not claim these shortcuts outside the component.
- An interrupted flight remains reversible to its original starting point. Bound the stack and coalesce duplicate addresses.

### Jump bar

Cmd/Ctrl+K, `/` while not editing, or the visible Jump button opens a compact command dialog. Focus stays within it and returns to the explorer on close. Typing only updates suggestions and temporary rail markers; it does not move the viewport. Enter commits the selected result; Escape removes temporary markers without navigation.

| Input | Meaning and feedback |
| --- | --- |
| `4812331` | Exact one-based row; also accept grouping separators. Validate against the total. |
| `50%` | Midpoint address; show the resolved row before committing. |
| `2017-03` | First matching date region supplied by the provider; show its landmark. |
| `next spike` | Next matching event after the current address; report when none remains. |
| `value > 120` | Provider-supported predicate search; show bounded results as temporary markers. |

Natural-language input here means a small, documented grammar, with no required AI service. Date and predicate queries require provider capabilities beyond row fetching. Unsupported queries explain that limitation and keep exact-row/percentage jumps available. The API proposal will define these optional capabilities; the library must not scan 100M rows in the browser to imitate server search.

Search is debounced and cancelable. Results display **Searching**, **Partial results**, **No matches**, or an error accurately; cached markers must not be presented as exhaustive predicate results.

### Keyboard

| Key | Action within the focused explorer |
| --- | --- |
| Up / Down | Move one row; keep the logical focus row visible. |
| PageUp / PageDown | Move one visible span, with one row of overlap in Rows. |
| Home / End | First / last row. |
| Cmd/Ctrl+Up / Down | Previous / next chapter. |
| N / P | Next / previous marker. |
| Alt+Left / Right | Back / Forward. |
| Cmd/Ctrl+K or `/` | Open Jump. |
| Escape | Close Jump or cancel the current scrub. |

Shortcuts ignore editable fields and nested controls. If no next target exists, retain position and announce the boundary rather than wrapping unexpectedly.

## Three views, one address

### Rows

```text
 anchor → 04812331  Mar 14 · 12:02  Alpha  ███████ 63.7
          04812332  Mar 14 · 12:03  Beta   ███████ 65.0
          04812333  Mar 14 · 12:04  Alpha  ██████  61.2
          04812334  Mar 14 · 12:05  Gamma  ███████ 66.1
```

Render only visible rows plus modest overscan using fixed, configurable row height. DOM rows contain accessible text and customizable content. Keep stable geometry while estimates become exact values. Unsupported variable row heights are explicitly outside the first release.

### Lens

```text
 dataset start ────────────── compressed aggregate context
                −1M ────────
                −1k ────────
                −100 ───────
                −10   04812321 ...
 anchor →              04812331 ...   full-size focus rows
                +10   04812341 ...
                +100 ───────
                +1k ────────
                +1M ────────
 dataset end ──────────────── compressed aggregate context
```

Use a linear full-size focus region and logarithmically compressed tails with a matching first derivative at both focus boundaries. Fit each tail to its remaining screen space while preserving monotonicity and an analytic inverse. Near dataset edges, omit the nonexistent tail rather than fabricate rows.

The entire dataset is represented, but only the focus contains individually rendered DOM rows. Subpixel context becomes aggregate canvas bands; fetch cost stays bounded by screen resolution. Offset labels are relative to the focus and hidden when they would collide. Clicking a compressed region inversely maps to a row and flies it into focus.

### Zoom

```text
 entire dataset             regional bands             individual rows
 ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
 │ ░▒▓█▒░░▒█▓▒░    │        │ Mar 2017  ▒▓▒  │        │ 04812331  63.7  │
 │ ▒▒▓▓░▒██▒░░▒    │  →     │ Mar 14    ▓█▓  │  →     │ 04812332  65.0  │
 │ ░░▒▓▒▒░░▓█▒░    │        │ Mar 15    ▒▓▒  │        │ 04812333  61.2  │
 └─────────────────┘        └─────────────────┘        └─────────────────┘
```

Continuous rows-per-pixel controls semantic detail: whole-dataset heat bands, labeled regional aggregates, then DOM rows. Pinch and Ctrl+wheel zoom around the pointer's row so the target stays in place. Plain wheel pans. Provide accessible zoom in/out controls and a textual scale for users without pinch or a wheel.

Capture Ctrl+wheel only over the focused data surface; leave browser page zoom elsewhere. Coarse bands expose count, mean, min, and max through focus/hover details. Label time ranges and use a fixed, stated value scale so colors remain comparable while zooming.

On view switches, retain the exact focus address and briefly interpolate its screen anchor from top to center or back. Blend the surrounding representation over approximately 180 ms. Rail, breadcrumb, and history remain stable. Reduced motion switches immediately. View switches alone do not add navigation history.

## Progressive data and failure behavior

1. Draw the rail and viewport immediately from any available overview. If no overview exists yet, show neutral structure, row addresses, and local **Overview loading** text; never manufacture estimates.
2. Use overview buckets for approximate bars and valid landmarks while fetching exact visible rows. Mark estimates visually and in accessible text.
3. Replace each completed page locally, retaining dimensions and position. Do not block all rows for one slow page.
4. Cancel stale visible-range, preview, and search work independently. Bound concurrent requests, deduplicate page fetches, and reject outdated responses even if a provider ignores cancellation.
5. Prefetch a bounded range near the predicted stopping point from velocity and measured latency. Avoid fetching every page traversed during a fast scrub.
6. Maintain a page-based LRU cache with a configurable byte budget. Account for estimated row size, pin visible pages, and expose any unavoidable visible-page budget overage in stats. Never cache proportional to total row count.
7. On failure, retain useful estimates/cached rows and show a local retry control. Abort is not an error. Distinguish empty datasets, unavailable overviews, and failed exact-row fetches.

The supplied whole-dataset overview is sufficient for first paint. Accurate Lens/Zoom detail needs range-aware aggregates or provider-specific multiresolution data. The next API proposal must resolve this explicitly; stretching a coarse overview cannot honestly claim to reveal finer detail.

## Demo and visual language

Use a deterministic, index-derived signal with gradual drift, distinct regimes, and a small set of clearly numbered spikes. Derive timestamps and categories directly from each requested index. The worker computes overview buckets from this same definition, using analytical pieces or explicitly labeled sampling where appropriate; it never creates an array of 100M row objects. Means, extrema, and predicate results must not imply exactness if sampled.

The synthetic provider implements date lookup and bounded predicate search from the signal definition, returning progress/completeness honestly. The latency slider delays row, overview, preview, and search responses consistently and respects cancellation.

The default layout emphasizes the dataset, with a restrained title, narrow toolbar, quiet grid, tabular numerals, monospace row IDs, and one main navigation accent. Reserve other colors for meaningful event types and value encoding. Support light/dark themes with legible contrast; do not rely on color alone.

First-visit hints are small, contextual, dismissible, and temporary: one at the overview, one when beginning a scrub, one at Jump, and one at Back after a large jump. Never show all four simultaneously. Keep shortcuts discoverable after hints disappear.

A collapsible Playground groups switches for overview, chapters, markers, magnetism, magnifier, precision, preview, trail, inertia, edge elasticity, automatic aggregation, flight, transitions, progressive estimates, prefetch, and hints. Keep the base rail and position readout visible even when optional features are disabled. Latency, row count, theme, and reduced-motion emulation are controls rather than hidden configuration.

Show measured cached rows/estimated bytes, active fetches, aborted requests, and frame rate while moving. Label performance measurements by browser and device. “60fps at 100M” is a validation target, not a claim established by design or a single automated test.

Local CSV/Parquet with DuckDB-WASM remains optional and outside the first six phases. It would introduce dependency, ingestion, and memory trade-offs requiring a separate decision.

## Accessibility and responsive behavior

- Use grid semantics for exact rows, with logical `aria-rowcount` and absolute one-based data `aria-rowindex`. Keep column headings outside the counted data rows so the accessible index matches the visible address. Handle an empty dataset explicitly.
- Preserve keyboard focus as rows virtualize. A stable focusable viewport owns navigation; expose the active row only while its DOM target exists. Nested interactive row content must remain operable.
- Announce committed jumps and completed keyboard navigation after settling, including the exact row and known landmark. Do not announce every wheel frame or incoming page.
- Give the rail an accessible position control plus navigable marker/chapter targets. Aggregate views offer text summaries and an action to inspect exact rows at the focus.
- Respect system reduced motion by default. Keep magnifier geometry stable in that mode, avoid animated flights, and preserve all navigation capabilities.
- At narrow widths, reduce optional columns and rail labels, move preview above the active thumb, and collapse Playground. Maintain adequate touch targets. The always-visible rail must not become an overlay that hides the focus row.

## Acceptance and verification plan

Automated interactions protect behavior. They cannot prove that a first-time user understands the design in two seconds or discovers a feature without instruction; those are timed human checks.

| Task | Planned Playwright regression | Human acceptance |
| --- | --- | --- |
| Describe the shape in two seconds | Assert overview is rendered, has a visible scale, and shows the seeded regimes/spikes; capture a still. | Show a fresh user the default screen for two seconds and ask what stands out. |
| Find the third spike in under ten seconds | Activate the visible **Spike 3** target; assert its exact seeded row, label, and rail position. | Time unaided discovery from the default screen. |
| Go to row 73,500,000 | Open Jump, enter `73,500,000`, commit, and assert exact address plus accessible row index. | Check whether the entry point and number syntax are clear. |
| Return after exploring | Jump from a known address, navigate elsewhere, then use Back and Forward; verify addresses and scales. | Ask the user to return without prompting which control to use. |
| Answer “where am I?” | Check breadcrumb, row address, percentage, focus anchor, and rail agree in every view and after resize. | Ask at several random positions and zoom levels. |

Additional tests cover endpoint and fractional positions; monotonic, invertible Rows/Lens/Zoom mappings; Lens boundary derivatives; precision changes without teleportation; clustered-marker snapping; cancellation races; cache eviction; stale responses; empty/error states; reduced motion; keyboard focus; and requests bounded independently of dataset size.

Performance checks measure frame intervals and memory during sustained wheel input, scrubbing, flight, and view switching at 100M rows. Run browser coverage in Chromium, Firefox, and WebKit where installed, and separately report real Safari verification. Verify DOM size remains bounded and no dataset-height spacer exists.

Browser automation will reuse one named headless Playwright session per task and close that exact session afterward. Any script that launches a browser must close it in `finally`; screenshots capture a settled view, and no rendering session is left running.

## Work sequence and decisions

1. **Completed:** select A, Atlas rail, with Rows and reliable navigation as the initial product focus.
2. **Completed:** public API and folder layout accepted; all six implementation phases are built. See README.md for measured checks and remaining human/device acceptance.
3. Build and commit the six requested phases, leaving the demo runnable after each: engine/Rows; progressive data/cache; full rail; navigation/history; Lens/Zoom; speed-driven aggregation/trail/polish.
4. Run relevant checks as each behavior lands, then the five acceptance flows and cross-browser performance review. Record verified results and remaining human checks separately.

No heavy dependencies are selected in this proposal. The design assumes React, TypeScript, DOM/canvas rendering, and a Web Worker as requested. Any material dependency or interaction trade-off discovered during implementation will be raised with a concrete explanation.

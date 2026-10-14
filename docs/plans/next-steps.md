# Plan: make Granum Grid useful to someone outside this repository

## Outcome and acceptance

Three developers outside the project install the published package, connect it to their
own data, and report what got in the way. The package is small enough to choose over a
plain virtual list, and its headline dataset is real data that a reader can try with
their own files.

## Done

- **Library ships only the explorer** (`53c43ff`): selection tools, bookmarks, range
  comparison, and hints moved to `demo/src/explorer`; unused server sort/filter/edit API
  removed.
- **Five reproduced defects fixed, each with a regression test** (`e0d0b45`): row-height
  changes kept the place, wheel hand-off at the ends, sideways wheels, the one-row end
  state (`snapshot.maxPosition`), and providers rebuilt during render.
- **Step 1, the default is a grid** (2026-10-14). With `provider`, `ariaLabel`, and
  `renderRow` the component renders rows and the map. `toolbar`, `footer`, and the
  `header` row are opt-in; `true` or options show a region, `false` hides it, a function
  replaces it. Elastic edges are off when embedded and on with `layout="page"`. The Go to
  dialog still opens from Cmd/Ctrl+K, `/`, and `api.openSearch()`. The playground, the
  HTTP page, and the Inventory and Logs lessons opt back in. Decision in
  [DESIGN.md](../../DESIGN.md#decisions).
- **Step 2, Parquet over HTTP** (2026-10-14). `demo/src/data/parquet.ts` builds a
  provider from a Parquet URL with hyparquet 1.31.2 (pinned, loaded on first use). The
  playground's first dataset is a 2.15 GB FineWeb file on Hugging Face, and its panel
  opens any pasted Parquet URL (kept in `?url=` so a link reopens it). Measurements and
  limits are in the [guide](../GUIDE.md#a-file-without-a-server-parquet-over-http);
  decision in [DESIGN.md](../../DESIGN.md#decisions).
- **Step 4, partly.** Real datasets come first in the gallery and the README, and
  DESIGN.md Decisions keep only choices a contributor needs (269 → 201 lines).

## Remaining

3. **Publish 0.1 to npm and find three integrators.** Status: ready to publish.
   - `granum-grid` is free on npm (`npm view` returns 404 on 2026-10-14). This machine
     is not logged in (`npm whoami` needs auth), so publishing waits for `npm login`.
   - `npm run release:check` passes and writes `output/granum-grid-0.1.0.tgz`; follow
     [PUBLISHING.md](../PUBLISHING.md#first-publication) from step 4.
   - Integrators file the new
     [integration report](../../.github/ISSUE_TEMPLATE/integration-report.md). Freeze new
     features until three are in; their friction list becomes the roadmap.
4. **Cut the repository's weight.** Status: media moved; dataset cut waits.
   - **Media out of history (done 2026-10-14).** Screenshots and the film are assets of
     the `media` GitHub release, git ignores `media/images/` and `media/*.mp4`, and
     `git filter-repo` removed both from the history of `main` and `master`. A `main`
     clone measured 18.7 MB before and about 1 MB after on a scratch rehearsal. Every
     other clone and worktree must re-clone or reset onto the rewritten history; the
     `library-primitive` worktree and Codex's local `refs/codex/*` checkpoints still
     point at the old commits. GitHub may keep unreachable objects until its own cleanup.
   - **Two generated datasets.** Keep Server logs and Signal archive (the default, the
     hero picture, and most tests). Removing Human genome, Market tape, and Star catalog
     also removes three film scenes (`media/src/scenes.ts`) and three screenshots, so the
     film needs a new cut. The film and screenshots were re-rendered in uncommitted work
     on 2026-10-14; the maintainer chose to cut after that work lands.

## Open risks, not yet scheduled

- **Touch still traps the page at the ends.** The viewport captures vertical swipes with
  `touch-action: pan-x pinch-zoom`, so a swipe cannot hand off to the page. This needs a
  way to release the gesture at an end, tested on a physical device.
- **`role="grid"` without cell navigation.** Screen readers announce a grid that has no
  Left/Right cell movement. Either add cell navigation or use a list or treegrid pattern;
  decide after a screen-reader session.
- **Scrolling is reimplemented.** Wheel, momentum, and edges are custom in embedded mode.
  Native-feel bugs on trackpads, Windows precision touchpads, and assistive tech remain
  likely, and only Chromium runs the synthetic touch checks.
- **Size.** The full component is about 31 KB of minified, gzipped JS plus about 46 KB of
  raw CSS; the headless hook alone is about 13 KB. Set a budget in `test:package` before
  adding features.
- **The map without an overview is still busy.** With three props and a provider that
  has no `fetchOverview`, the map shows "No profile", an empty value axis, and a markers
  legend. It may read better as a plain scrollbar until a profile exists.
- **Parquet jumps cost a row group.** A file written with one huge row group and no page
  index downloads that whole group per jump. The adapter could warn when a group's
  compressed size passes a threshold.

## Validation evidence

On 2026-10-14, after steps 1, 2, and the step 4 changes: `npm run format:check`,
`npm run lint`, `npm run check` (140 unit tests, including 8 for the Parquet reader),
`npm run release:check` (builds and React 18.2 and 19 tarball consumers, with new
assertions that three props render no toolbar, heading row, or footer), `npm run
media:build`, `npm run build:wiki`, the full Chromium browser suite, and the new
`defaults` and `parquet` specs in Firefox and WebKit. The `defaults` spec fails on the
previous library code. `npm publish --dry-run` lists 237 files, 176 kB, library only.
The Parquet browser tests serve a fixture through `page.route`; the FineWeb numbers come
from manual runs against Hugging Face. Not run: native Safari, physical touch devices, a
screen reader, hosted CI, or npm publication.

## Next action

Land the uncommitted media work (upload its screenshots and film with the command in
`media/README.md`), cut the three generated datasets, then log in to npm and publish
the verified archive (PUBLISHING.md step 4 onward).

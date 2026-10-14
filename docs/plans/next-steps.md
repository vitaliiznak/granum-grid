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
- **Five reproduced defects fixed, each with a regression test:**
  - Changing `rowHeight` or `dynamicRowHeight` reset the reader to row 1 and cleared
    history. The engine now changes layout in place (`setRowLayout`).
  - An embedded explorer trapped page scrolling at either end. A wheel gesture that
    starts at an end now scrolls the page; `overscroll-behavior: contain` opts out.
  - Sideways wheels over rows were blocked, so wide tables could not scroll horizontally.
  - The end of the dataset showed one row above a blank "End of dataset" panel. Scrolling
    now stops when the last row ends at the viewport's bottom (`snapshot.maxPosition`).
  - A provider rebuilt during render dropped the row cache on every parent render.
    Sessions are now keyed by `id`, `revision`, `rowCount`, and summary capabilities.

## Next, in order

Each step needs a decision from the maintainer before it starts.

1. **Make the default a grid, not an app.** Status: not started.
   - With only `provider`, `ariaLabel`, and `renderRow`, render the rows and the map.
     Make the toolbar (Back/Forward, breadcrumb, search button) and footer opt-in.
   - Turn elastic edges off by default in `layout="embedded"`.
   - Affects `GranumGrid.tsx`, `features.ts`, the playground (which opts back in), the
     guides, and specs that click toolbar buttons.
   - Acceptance: the three-prop example in `granum-grid/README.md` shows no chrome
     besides rows and map; the playground looks unchanged.
2. **Lead with one backend where "any row by address" is cheap.** Status: not started.
   - Candidate: Parquet over HTTP range requests. The footer holds each row group's row
     count, so the count is exact and a provider can read only the row group that holds
     a requested address, with no server.
   - Prototype a `createParquetProvider(url)` in the demo first. Measure first-row latency
     and bytes read for a jump into a multi-gigabyte public file before promising it.
   - Alternatives if Parquet disappoints: Kafka partition offsets, or a large log file
     with a line-offset index.
   - Acceptance: a reader pastes a Parquet URL into the playground and jumps to any row.
3. **Publish 0.1 to npm and find three integrators.** Status: blocked on the maintainer
   (registry account, package name check, `npm run release:check`).
   - Freeze new features until their feedback is in; their friction list becomes the
     roadmap.
4. **Cut the repository's weight.** Status: not started.
   - Move `media/*.mp4` and screenshots out of git history (Git LFS or release assets).
     This rewrites history, so coordinate with every clone first.
   - Keep at most two generated datasets in the playground; put the real ones (Bitcoin,
     Hacker News, the recording, and step 2's Parquet) first.
   - Trim `DESIGN.md` Decisions to choices a new contributor needs.

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

## Validation evidence for the done items

`npm run format:check`, `npm run release:check` (lint, typecheck, tutorials, wiki, 132
unit tests, library and demo builds, React 18.2 and 19 tarball consumers), the media
typecheck, all 56 Chromium browser tests, and the changed specs (acceptance, dynamic,
interactions, and the full-page exploration case) in Firefox and WebKit. The three new
browser tests fail without the fixes and pass with them. Not run: native Safari, physical
touch devices, a screen reader, or hosted CI.

## Next action

Decide step 1's defaults (toolbar and footer opt-in, elastic edges off when embedded),
then implement them in one change with the playground opting back in.

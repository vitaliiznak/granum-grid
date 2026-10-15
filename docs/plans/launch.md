# Plan: launch 0.1.0

Status: as of 2026-10-15, every step here waits on the maintainer. The code work in
[library-family.md](library-family.md) is done, including DuckDB's extensions served from
the playground. This file puts the remaining human steps in order, with what to check and
what to send.

## Order

1. Settle the npm scope (done: `@granum-grid`).
2. Settle the ARIA pattern before publishing, because it is public API: integrators write
   `role="gridcell"` in `renderRow` (README, GUIDE, every lesson). Decided and built
   2026-10-15: `grid` with cell navigation. A VoiceOver session still has to confirm it.
3. Check the devices (can run alongside the VoiceOver session).
4. Publish ([PUBLISHING.md](../PUBLISHING.md)).
5. Record the 60-second video.
6. Post, then wait for three integration reports. The kill clock in library-family.md
   starts on the publish date.

## 1. The npm scope

Done 2026-10-15. The registry answered 200 for the `granum` scope with no public packages,
and npmjs.com shows a **user** named `granum` with none. User names and organization names
share one namespace, so `@granum` belongs to that account. The maintainer chose to rename:
the packages are `@granum-grid/core`, `/react`, `/parquet`, and `/sql`, and the npm
organization to create is `granum-grid`.

## 2. Screen-reader session (VoiceOver, about 30 minutes)

Before 2026-10-15 the rows container was `role="grid"`, but `aria-activedescendant` named
the focused **row** and the keys moved by row only. That fit neither a real `grid`, where
focus belongs on cells and Left and Right move between them, nor `table`, which has no
focus or selection semantics. `listbox` would have renamed every role in integrators'
markup.

Decided 2026-10-15 without a session, because it keeps integrators' markup: stay `grid`
and make it honest. The viewport keeps focus. `aria-activedescendant` names a cell of the
focused row: Up and Down keep the column, and Left and Right move between the row's
`role="gridcell"` elements (`createActiveCell` in `@granum-grid/core/dom`, used by the React
hook and by `mount()`). A cell without an id gets one, and the active cell is outlined
while the grid has keyboard focus. Home and End still go to the first and last rows, not
along the row.

What Chromium's accessibility tree showed before the change (Signal archive): the grid has
its label and `aria-rowcount` 100,000,000, and each row is named by its joined text ("1
2010-01-01 00:00:00 North 37.0 mV 37 millivolts"). Its six cells are the row number, time,
channel, value, a bar labeled with the value in words, and a status that is empty unless
the reading is an event. A tree is not a session: it does not show what VoiceOver says.

Use Safari with VoiceOver (Cmd+F5) on the
[playground](https://vitaliiznak.github.io/granum-grid/?dataset=signal). Write down what
VoiceOver says at each step:

1. Tab into the rows. Does it give a role, the label, and a position ("row 1 of
   100,000,000")? Does it read the first cell?
2. Press Down three times. Does it read the row number and the cell once each, without
   talking over itself?
3. Press Right twice, then Down. Does it read the time, then the channel, then the
   channel one row down?
4. Press Page Down, End, then Home. Is the new position announced?
5. Use VO+Right inside a row. Does it reach the same cells?
6. Go to… row 61,700,000. Is the jump announced once and clearly?
7. Move the map slider with the arrows. Is its value text useful?

Up and Down already announce "Row N" in a live region, and VoiceOver also reads the new
active cell. If the two talk over each other, drop the live announcement for Up and Down.
Record what VoiceOver said in library-family.md (Phase 2, step 4). NVDA on Windows waits
for a volunteer, but do it before 1.0.

## 3. Devices (about 5 minutes each)

On each device, scroll the embedded grid to both ends and check that the page takes over.
Then drag the scrollbar to the middle and back, and jump with the map.

- macOS trackpad: momentum, and the hand-off to the page at each end.
- iPhone Safari: a swipe hands off at both ends; the address bar showing and hiding does
  not move the rows.
- Windows precision touchpad and Android Chrome: when a volunteer is available.

Record what each device did in library-family.md, next to the screen-reader notes.

## 4. Publish

Follow [PUBLISHING.md](../PUBLISHING.md): `npm run release:check`, the dry run, then publish
core first. Afterwards an agent replaces "Not yet on npm" in the READMEs, QUICK_START, and
the Setup lesson.

## 5. The 60-second recording

Record at 1280×800, with captions and no voice. A real trackpad shows native scrolling
better than a script can.

| Seconds | Shot                                                                                        |
| ------- | ------------------------------------------------------------------------------------------- |
| 0–8     | Web pages (Parquet): one 2.15 GB file on Hugging Face, read with HTTP range requests        |
| 8–22    | Scroll with the trackpad, then drag the map to the middle; rows arrive, about 2 MB per jump |
| 22–32   | Go to… a row number; Back returns                                                           |
| 32–46   | Server logs, 4 billion rows: search a status, jump to the incident, the markers on the map  |
| 46–60   | Drop a local CSV into Your file (SQL), filter it into a revision, exact map; end on `npm i` |

Upload it with `gh release upload media <file>.mp4 --clobber`. Do not commit it. Then
replace the film in the README.

## 6. Posts (drafts)

Send all three within one week, each linking the
[integration report template](../../.github/ISSUE_TEMPLATE/integration-report.md). Count
reports with `gh issue list --label integration-report`.

**Show HN**

> Show HN: Granum – scroll a 2 GB Parquet file with a map of the whole dataset
>
> Granum is a small library for reading ordered data too big to load: a viewport that
> scrolls natively over millions to billions of rows, fetched a page at a time, and a map
> of the entire dataset beside it. You can jump to a row, a date, or an event, and Back
> returns.
>
> The playground reads one 2.15 GB FineWeb Parquet file from Hugging Face with range
> requests, about 2 MB per jump. It also opens a file you drop into DuckDB-WASM in the
> tab (nothing leaves the page), and scrolls 4 billion synthetic log lines.
>
> Packages: `@granum-grid/core` (no framework), `@granum-grid/react`, and adapters for Parquet and SQL.
> The map also drives scrollers it does not own, such as TanStack Virtual or a plain
> overflow list.
>
> What it is not: a spreadsheet. There are no columns, resizing, or client-side sorting
> (HighTable is better there). It is 0.1, and screen readers are checked with VoiceOver
> only [update after step 2]. I'd like to hear what breaks with your data.

**DuckDB community** (Discord or discussions)

> I built a scroller plus map for DuckDB results: `@granum-grid/sql` turns a query into rows
> you can scroll by address, an exact map of the whole result, and complete search. Each
> filter or sort becomes a revision with its own row addresses. The playground runs it on
> DuckDB-WASM in the tab, with the Parquet, JSON, and ICU extensions served from the site
> and checked against pinned hashes. Feedback on the query patterns is welcome:
> packages/sql/src/index.ts.

**hyparquet / HighTable** (a GitHub discussion on hyparam/hyparquet)

> `@granum-grid/parquet` reads Parquet over HTTP with hyparquet: footer once, then one row group
> per jump. Thank you for the library. Granum adds a whole-dataset map and typed jumps. The
> map can drive a scroller it does not own through a small `MapTarget` (row count, visible
> range, scroll to index), so it could sit beside HighTable. Would that be useful to you? And
> is the way I use hyparquet's row-group reads right?

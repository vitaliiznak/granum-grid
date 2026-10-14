# Changelog

All four packages are released together with the same version.

## 0.1.0 (unreleased)

The first release on npm.

- `@granum/core`: the navigation engine (a float row address over billions of rows, history,
  alignment, measured heights, saved views), the data session and providers (`/data`),
  native scrolling and `mount()` for the rows explorer without a framework (`/dom`), and
  `mountMap()` for the dataset map beside any scroller (`/map`). No dependencies.
- `@granum/react`: `GranumGrid`, `AtlasRail`, `JumpBar`, and `useGranumGrid`, plus the
  headless hook (`/headless`).
- `@granum/parquet`: a Parquet file on any server that answers byte ranges, read one row
  group per jump. hyparquet is a peer dependency.
- `@granum/sql`: any table DuckDB can read, with filters and sorts as revisions. Bring your
  own DuckDB.

### Changes from the GitHub-only `granum-grid` 0.1.0

For anyone who installed the earlier archive from the repository:

- The package split in two. `granum-grid` and `granum-grid/headless` are now
  `@granum/react` and `@granum/react/headless`; `granum-grid/core` is `@granum/core`, and
  `granum-grid/data` is `@granum/core/data`.
- Rows scroll in a native scroller (the element or the window), so wheel, touch, keys, and
  the scrollbar behave as the browser's do. The hand-built inertia, elastic edges, and
  touch panning are gone, with the hook's `edgeOffset` and `traveling`.
- Jumps are instant. Flights, `ViewCanvas`, `createZoomMapping`, and the engine's motion
  controls are gone.
- The `features` option, `defaultFeatures`, and `Features` are replaced by one `prefetch`
  option. Transitions follow the reader's reduced-motion setting, and loading estimates
  are always on.
- `stats.fps` is gone.
- Style hooks were renamed: `ds-*` classes are `gr-*`, `data-ds-*` attributes are
  `data-gr-*`, `--ds-*` variables are `--gr-*`, and the cascade layer `granum-grid` is
  `granum`.
- The navigation handle (`apiRef`, `api`) gained `beginScrub`, `scrub`, and `endScrub`, so
  an external scrollbar's drag becomes one history entry.

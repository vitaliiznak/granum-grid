# Prune and consolidate

Outcome: less code and documentation to maintain, with one owner for each fact and
helper. No public behavior changes; every contract in `AGENTS.md` holds. Existing
uncommitted work is preserved and built upon.

## Steps

1. [x] Baseline: `npm run check` passed (117 unit tests) before any edit.
2. [x] Library: one `VIEWS` list; engine index/zoom helpers; one log-compression
   helper for both lens mappings (verified equal to the old fixed-height lens to
   floating-point noise); named cache/session/search limits; flat memo props for
   the jump dialog; internal imports from source modules instead of re-exports.
3. [x] Demo: drop dead exports and fields (`help`, the unshown first fact, an unused
   4096-sample density peak computed at load), use `api.getView()` for links, share
   timeline/search/range helpers, move the signal provider beside its dataset, extract
   `App.tsx` header and row-sizing blocks, key the tools panel by provider revision so
   an imported recording resets it, shared test viewport helpers.
4. [ ] CSS: remove dead selectors and duplicated rules.
5. [x] Scripts/CI/config: remove duplicated helpers and redundant scripts.
6. [x] Docs: fold the current parts of `API.md` into `docs/GUIDE.md` and delete it;
   reduce `DESIGN.md` to rationale plus a "Decisions" section that keeps the
   decided-against items from completed plans; delete completed plan logs; one
   owner per topic.
7. [ ] Validate: `npm run check`, lint, format check on touched files, builds,
   package test, Chromium smoke and affected browser specs.

## Decisions

- Keep the published API: no export is removed or renamed.
- `demo/src/data/trace.ts` keeps type-only `granum-grid` imports: the dev server's trace
  plugin loads it without a library build, so it does not use `createArrayProvider`.
- A shared select component for map settings was tried and dropped: after formatting it
  was longer than the seven plain selects.
- Linked comparison panes keep their unclamped progress ratio so a tall final row's
  fractional end carries over (`snapshot.progress` is clamped).

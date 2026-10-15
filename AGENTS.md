# Working on Granum Grid

This npm workspace contains a React/TypeScript indexed-data explorer. Read this
file first; use [the AI workflow](docs/AI_WORKFLOW.md) for setup, focused checks,
browser debugging, and handoffs. No API key, backend, or AI service is needed.

## Start here

- Inspect `git status --short` and the relevant diff before editing. Preserve
  existing work; do not reset, clean, or broadly reformat unrelated files.
- Use Node 22 (`.nvmrc`), npm, and the root `package-lock.json`. Run `npm ci` for a
  fresh checkout and `npm run ai:doctor` to diagnose setup without changing it.
- Make the smallest complete change. Work spanning several subsystems gets a
  [plan file](docs/AI_WORKFLOW.md#task-context-and-handoff) under `docs/plans/`.

## Find the right code

| Area                                    | Entry points / guidance                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Public exports and contracts            | `packages/react/src/index.ts`, `headless.ts`, `packages/core/src/index.ts`, `data/types.ts`, `docs/GUIDE.md` |
| Navigation, mappings, row measurements  | `packages/core/src/core/engine.ts`, `mappings.ts`, `rowSizes.ts`                                             |
| Paging, cancellation, dataset lifecycle | `packages/core/src/data/cache.ts`, `session.ts`, `range.ts`                                                  |
| Native scrolling, keys, event targets   | `packages/core/src/dom/` (framework-free)                                                                    |
| Map drawing, peaks, markers, formats    | `packages/core/src/map/` (framework-free)                                                                    |
| React components, hook, styles          | `packages/react/src/react/`, `packages/core/src/base.css`, `styles.css`, `STYLING.md`                        |
| Data adapter packages                   | `packages/parquet/` (`@granum-grid/parquet`), `packages/sql/` (`@granum-grid/sql`)                                     |
| Demo providers and domain examples      | `demo/src/data/`, `demo/src/datasets/`, `demo/src/App.tsx`                                                   |
| Film and screenshots (frozen studio)    | `media/README.md`; the studio is on the `media-studio` branch                                                |
| Packaging, consumers, size budgets      | `scripts/build-package.mjs`, `package-test.mjs`, `size.mjs`, `docs/PUBLISHING.md`                            |
| Current multi-step plan                 | `docs/plans/library-family.md`                                                                               |

`README.md` describes current use; `docs/GUIDE.md` is the integration reference, with
limits and defaults. `DESIGN.md` records rationale and decisions. Check actual exports
and tests before treating documentation as implemented behavior.

## Preserve these contracts

- API indices are zero-based; visible/ARIA row numbers are one-based. Ranges are
  half-open `[start, end)`. Large counts must not overflow through bitwise math.
- Work and memory must remain bounded by the viewport, pages, or requested
  buckets, not total dataset size. Never scan billions of synthetic rows.
- Packages: `@granum-grid/core` (framework-free; layers `data/` ← `core/` ← `dom/` ← `map/`, each
  importing only the ones below) and `@granum-grid/react`, which reaches core only through its
  entries (`/data`, `/dom`, `/map`, `/internal`). Nothing in core imports React; lint
  enforces all of this. The library must not import demo, media, domain-specific adapters, or
  model SDKs. ESM library imports use `.js` suffixes so published output resolves in Node.
- Provider identity/revision owns cached data and saved views. Preserve aborts,
  stale-result rejection, ordered fetch counts, and append-versus-revision semantics.
- Preserve `exact` / `estimated` / `unavailable`, nullable aggregates, and search
  completeness. Generated data and sampled summaries must remain labeled.
- Preserve SSR-safe imports, keyboard/editable-element behavior, reduced motion,
  focus, bounded mounted rows, and measurement anchoring.
- AI schemas, limits, and model connections belong to the host application.

## Validate and finish

- `npm run check`: type-check source, tests, and configs (`typecheck`), verify tutorial
  snippets and doc links (`test:tutorials`), then run unit tests. No browser, lint, formatting, or package output.
- `npm run test:smoke`: four Chromium acceptance cases for navigation, history, and selection.
- `npm run release:check`: lint, `check`, library/demo builds, isolated React 18/19
  tarball consumers, and per-entry size budgets (`test:package`).
- `npm run check:full`: format check, `release:check`, Chromium/Firefox/WebKit tests,
  and the Pages smoke test. Requires browser installs
  and possibly npm registry access for consumer dependencies. CI runs the same steps
  separately.
- Use the change-to-check table in [the workflow](docs/AI_WORKFLOW.md). Reproduce
  bug fixes with a relevant test; do not weaken assertions to obtain a green run.
- Format touched code only. Keep public behavior docs and package examples aligned
  with API changes. Never edit generated `dist/` files.
- Report changes, commands/results, and any skipped checks or remaining uncertainty.
  Local checks do not prove hosted CI, publication, real-provider performance, or
  human accessibility acceptance. Publish/deploy only when the user requests it.

## Playwright

One named `playwright-cli --session <task-name>` per task; reuse it. Run headless
unless the user asks to watch. Always close the session you opened:

```sh
playwright-cli --session <task-name> close
```

`close` without `--session` only closes the default session. Node scripts that
launch browsers must close them in `finally`. Wait for ready content before a
capture; for WebGL wait for the app ready flag, capture the still, then close.
The `npm run test:*` browser commands use Playwright Test, which owns and closes
its browsers and server; they do not create named CLI sessions.

## Code Review Rules

Prioritize broken address/range math, unbounded work, stale data after a provider
switch, lost anchors/history, inaccessible input handling, and broken public
exports. Distinguish reproducible correctness issues from design preferences.

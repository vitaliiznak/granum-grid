# Working on deepscroll

This npm workspace contains a React/TypeScript indexed-data explorer. Read this
file first; use [the AI workflow](docs/AI_WORKFLOW.md) for setup, focused checks,
browser debugging, and handoffs. No API key, backend, or AI service is needed.

## Start here

- Inspect `git status --short` and the relevant diff before editing. Preserve
  existing work; do not reset, clean, or broadly reformat unrelated files.
- Use Node 22 (`.nvmrc`), npm, and the root `package-lock.json`. Run `npm ci` for a
  fresh checkout and `npm run ai:doctor` to diagnose setup without changing it.
- Make the smallest complete change. For work spanning several subsystems,
  record the intended behavior, steps, and validation in a task-specific file
  under `docs/plans/`; update it when decisions change. Small edits need no plan file.

## Find the right code

| Area                                    | Entry points / guidance                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Public exports and contracts            | `deepscroll/src/index.ts`, `deepscroll/src/core/api.ts`, `deepscroll/src/data/types.ts`, `API.md` |
| Navigation, zoom, row measurements      | `deepscroll/src/core/engine.ts`, `mappings.ts`, `rowSizes.ts`                                     |
| Paging, cancellation, dataset lifecycle | `deepscroll/src/data/cache.ts`, `session.ts`, `range.ts`                                          |
| React, DOM inputs, layout, styles       | `deepscroll/src/react/`, `deepscroll/src/base.css`, `styles.css`, `STYLING.md`                    |
| Demo providers and domain examples      | `demo/src/data/`, `demo/src/datasets/`, `demo/src/App.tsx`                                        |
| Application-owned AI tools              | `demo/src/ai/README.md`, `demo/unit/table-tools.test.ts`                                          |
| Screenshots and video                   | `media/README.md`, `media/scripts/capture.mjs`                                                    |
| Packaging and consumer compatibility    | `scripts/build-package.mjs`, `scripts/package-test.mjs`, `docs/PUBLISHING.md`                     |

`README.md` describes current use; `docs/GUIDE.md` expands it. `DESIGN.md` and parts
of `API.md` contain design/proposal history. Check actual exports and tests before
treating a proposal or an old verification snapshot as implemented behavior.

## Preserve these contracts

- API indices are zero-based; visible/ARIA row numbers are one-based. Ranges are
  half-open `[start, end)`. Large counts must not overflow through bitwise math.
- Work and memory must remain bounded by the viewport, pages, or requested
  buckets, not total dataset size. Never scan billions of synthetic rows.
- Keep `core/` and `data/` independent of React. The library must not import demo,
  media, domain-specific adapters, or model SDKs. ESM library imports use `.js`
  suffixes so published output resolves in Node.
- Provider identity/revision owns cached data and saved views. Preserve aborts,
  stale-result rejection, ordered fetch counts, and append-versus-revision semantics.
- Preserve `exact` / `estimated` / `unavailable`, nullable aggregates, and search
  completeness. Generated data and sampled summaries must remain labeled.
- Preserve SSR-safe imports, keyboard/editable-element behavior, reduced motion,
  focus, bounded mounted rows, and measurement anchoring.
- AI schemas, limits, and model connections belong to the host application.
  `demo/src/ai/` demonstrates deterministic calls; it has no live model connection.

## Validate and finish

- `npm run check`: type-check source **and tests**, then run unit tests.
- `npm run test:smoke`: four Chromium acceptance cases for navigation and views.
- `npm run check:full`: check, library/demo/media builds, isolated React 18/19
  tarball consumers, then Chromium/Firefox/WebKit tests. Requires browser installs
  and possibly npm registry access for consumer dependencies.
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

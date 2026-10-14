# AI development workflow

The repository harness is [AGENTS.md](../AGENTS.md), a setup diagnostic, and npm
validation commands shared with CI. It runs locally without model credentials.
[AGENTS.md](../AGENTS.md#validate-and-finish) says what each check covers; this page
adds setup, focused commands, and browser debugging.

## First run

```sh
nvm use                      # Or select Node 22 with your version manager
npm ci                       # Root workspace; installs from package-lock.json
npm run ai:doctor            # Read-only environment/dependency diagnosis
npm run check
npx playwright install chromium
npm run test:smoke
```

Use `npm run dev` for an interactive demo. Open the loopback URL Vite prints. Stop servers you started when finished.
The generated providers and bundled trace need no network service or API key.

`npm run ai:doctor` checks the Node major, root/demo manifest-lockfile agreement,
installed dependency versions, and browser binary availability. It does not launch
browsers, change dependencies, or dump environment variables. Missing browsers
are warnings: they do not block unit tests. A found binary does not establish
that the host has all OS libraries needed to launch it.

For machine-readable diagnostics (without npm's banner):

```sh
npm run --silent ai:doctor -- --json
```

Exit status is 0 when core setup passes, 1 for setup failures, and 2 for invalid
arguments. The JSON contains `ok` and `checks` with `name`, `status`, and `message`.

## Choose checks for the change

Run commands from the repository root. Add a regression case where behavior changes.

| Change                                                | Validation                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Docs or agent instructions only                       | Review paths, commands, and consistency; no browser needed                                                     |
| Engine, range math, cache, providers                 | `npm run check`; focus first with `npx vitest run packages/core/tests/session.test.ts` or the relevant test path  |
| React, inputs, layout, styles, demo interactions      | `npm run check`, `npm run test:smoke`, relevant browser spec, and visual inspection when appearance changes    |
| Public API, exports, package/build metadata           | `npm run check`, `npm run build`, `npm run test:package`; update `docs/GUIDE.md`, `packages/react/README.md`, and the `scripts/package-*` consumer fixtures when applicable |
| Broad change / release candidate                      | `npm run check:full` after installing all three browsers                                                       |

`npm run typecheck` covers library, adapter packages, demo, unit/browser tests, and the
Vite/Vitest/Playwright configs without emitting files; the package-consumer fixture is
checked separately against an installed tarball, not workspace aliases.
`npm run test:tutorials` compares the seven lesson code blocks with `demo/src/tutorials`
and checks local links and headings in the root `README.md`, `STYLING.md`, `DESIGN.md`,
and `AGENTS.md`, in `docs/*.md`, `docs/lessons/`, `packages/react/README.md`, `media/README.md`,
`media/MUSIC.md`, and the trace fixture README. `npm run lint` applies hook rules to the
library and demo, public-entry imports to the demo, the layer fence to the library, and
browserslist API checks to the library and adapter packages.

Before a full check:

```sh
npx playwright install chromium firefox webkit
# On Linux CI, use: npx playwright install --with-deps chromium firefox webkit
npm run check:full
```

`npm run test:pages` needs a production build and Chromium;
`PAGES_URL=https://vitaliiznak.github.io/granum-grid/ npm run test:pages` checks the
published site with the same navigation flow. The package test writes the verified
archive into `output/`; it does not publish it. A local success does not confirm a CI run.

Use `npx prettier --check <touched-files>` and `npx prettier --write <touched-files>`
for supported file types. The existing `npm run format:check` covers all configured
code paths; do not format someone else's pending changes to clear unrelated failures.

## Browser feedback loop

```sh
npm run test:smoke
npm run test:e2e -- demo/tests/dynamic.spec.ts --project=chromium
npm run test:e2e -- demo/tests/interactions.spec.ts --project=webkit
npm run test:perf   # Chromium only; frame-timing thresholds
```

Playwright Test runs headless with one worker. It starts and stops its own server
at `http://127.0.0.1:5187`, using dev mode locally and the built demo when `CI` is
set. A port conflict fails instead of silently testing an existing process.

```sh
PLAYWRIGHT_PORT=5193 npm run test:smoke
# Only when deliberately testing your already-running demo on the configured port:
PLAYWRIGHT_REUSE_SERVER=1 npm run test:smoke
```

When another task is testing in this checkout, use a free port and a separate
artifact directory outside the shared `test-results/` folder:

```sh
PLAYWRIGHT_PORT=5198 PLAYWRIGHT_OUTPUT_DIR=output/playwright/my-task npm run test:smoke
# The same environment variables also work with check:full and test:e2e.
```

Concurrent source edits can still change the app mid-run; validate a stable
checkout before treating the result as release evidence.

Failures retain screenshots and traces in ignored `test-results/`. CI also uploads
its HTML report. Inspect a trace with `npx playwright show-trace <trace.zip>`.
Do not increase timeouts or retries to hide a regression. First reproduce the
specific failing spec and distinguish an app failure from a missing browser,
port conflict, or unsupported host environment.

For manual browser automation, use the available browser tool. IronBee is useful
when connected, but is not a repo dependency. Follow the Playwright session and
cleanup rules in [AGENTS.md](../AGENTS.md#playwright). Tests already managed by
Playwright Test should use its `page`/`context` fixtures.

Useful readiness signals include `[role="row"][data-status="ready"]`, the
`position` test ID, and the expected dataset's grid label. Wait for the specific
rows required by the assertion; a mounted shell is not loaded data. Prefer role
and accessible-name locators, then existing test IDs. Inspect console/page errors
and the visible result when reviewing UI changes. Check mobile width and keyboard
operation when those behaviors are affected.

## Task context and handoff

Give an agent a concrete outcome, the observable acceptance behavior, and relevant
constraints. Link source files or a failing test rather than pasting the whole repo.
For example:

> Read AGENTS.md. Fix a jump that loses the leading row after an expanded row is
> measured. Preserve existing changes. Reproduce the failure in the row-size or
> dynamic browser tests, implement the smallest fix, and run the relevant checks.
> Report what passed and what remains unverified.

For longer work, use a task-specific `docs/plans/<name>.md` with: outcome and
acceptance, affected areas, steps with status, decisions, validation evidence,
and next action. Keep it current for another agent to resume. No plan file is
required for a small fix. Don't place credentials, private traces, or raw model
transcripts in these documents. When a plan is complete, move its durable decisions
(including options decided against, with reasons) to the "Decisions" section of
[DESIGN.md](../DESIGN.md#decisions) and delete the plan.

Keep durable repo guidance in AGENTS.md and this workflow. `CLAUDE.md`, the Copilot
instruction file, and the Cursor rule point to them so conventions do not diverge.
Tools without automatic instruction discovery should be explicitly asked to read
AGENTS.md. Codex discovers root and scoped instructions as described in the
[official AGENTS.md guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

At handoff, state the changed behavior, checks with results, and remaining limits.
Keep failures present before the task separate from regressions. Avoid claiming
an older benchmark, generated dataset size, or a local pass as live production evidence.

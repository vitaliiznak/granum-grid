# Publishing Granum Grid

The publishable workspaces are four packages under `packages/`, all at version `0.1.0`, under Apache-2.0, released in lockstep:

| Package                | Depends on                                              |
| ---------------------- | ------------------------------------------------------- |
| `@granum-grid/core`    | nothing                                                 |
| `@granum-grid/react`   | `@granum-grid/core` (same version); React 18.2–19 peers |
| `@granum-grid/parquet` | `@granum-grid/core` and hyparquet as peers              |
| `@granum-grid/sql`     | `@granum-grid/core` as a peer                           |

The repository root and demo are private npm workspaces. Each package has ESM exports, TypeScript declarations, and source maps; `@granum-grid/core` ships the CSS, and `@granum-grid/react` ships a copy so React users import one package.

## Verify and prepare the artifacts

From the repository root, using Node.js 22:

```sh
npm ci
npm run release:check
```

[`release:check`](../AGENTS.md#validate-and-finish) ends with the package test. It packs each package through its `prepack` hook, core first, and installs the four exact archives together in temporary, independent React 18.2 and React 19 applications. It checks runtime imports, that core never imports React, SSR, styles, source maps, TypeScript declarations under NodeNext and Bundler resolution, and per-entry size budgets. Temporary consumers are removed even if a check fails. Consumer installation needs npm registry access unless cached.

Only a successful package check copies the archives to `output/granum-grid-core-0.1.0.tgz`, `granum-grid-react-0.1.0.tgz`, `granum-grid-parquet-0.1.0.tgz`, and `granum-grid-sql-0.1.0.tgz`. Source files are included so maps resolve. Tests, the demo, media, and workspace tooling are excluded. The root `LICENSE` is copied into each package during its build.

Run the browser suite before a release as well (the CI workflow runs it):

```sh
npx playwright install chromium firefox webkit
npm run test:e2e
```

GitHub Actions also uploads the checked archives as the `npm-package` artifact. It does not publish to npm. A successful local run does not establish that remote CI or registry publishing succeeded.

## First publication

1. Create the npm organization `granum-grid` (free for public packages) in the npm account that will own the packages, then sign in: `npm login --registry=https://registry.npmjs.org/` and `npm whoami --registry=https://registry.npmjs.org/`. (`@granum` belongs to an npm user named `granum`, so the packages use `@granum-grid`.)
2. Confirm `repository` (with each package's `directory`), `homepage`, and `bugs` in `packages/*/package.json` still point to the public repository, then regenerate the archives.
3. Inspect each archive without publishing, in dependency order:

   ```sh
   for name in core react parquet sql; do
     npm publish ./output/granum-grid-$name-0.1.0.tgz --dry-run --access public --registry=https://registry.npmjs.org/
   done
   ```

4. When ready to make the release public, publish the verified archives in the same order, core first, so `@granum-grid/react`'s dependency resolves:

   ```sh
   for name in core react parquet sql; do
     npm publish ./output/granum-grid-$name-0.1.0.tgz --access public --registry=https://registry.npmjs.org/
   done
   ```

   Complete npm's authentication/2FA prompts if requested. These are the only steps that publish. A dry run does not verify publishing permissions, reserve names, or claim success.

5. Verify each with `npm view @granum-grid/core@0.1.0 version dist.integrity --registry=https://registry.npmjs.org/` (and the other three), then replace the unpublished-release wording and local-archive install steps in the package READMEs, `docs/QUICK_START.md`, and `docs/lessons/Setup.md`.

6. Ask three developers outside the project to install the published packages, connect them to their own data, and file an [integration report](../.github/ISSUE_TEMPLATE/integration-report.md). Hold new features until their reports are in; their friction list becomes the roadmap.

Publishing a tarball uses its existing contents; it does not rebuild or run this repository's release checks. Always use archives from the latest successful `release:check` for the intended source version. Publishing directly from a workspace with `npm publish -w packages/react` runs its `prepublishOnly` (the full release check) and `prepack` (a rebuild).

## Later releases

The packages share one version. Bump all four from the repository root, keeping the lockfile and `@granum-grid/react`'s exact dependency on `@granum-grid/core` in step:

```sh
npm version patch -w packages/core -w packages/react -w packages/parquet -w packages/sql --no-git-tag-version
npm pkg set dependencies.@granum-grid/core="$(node -p "require('./packages/core/package.json').version")" -w packages/react
npm install
npm run release:check
```

Use `minor`, `major`, or an explicit version when appropriate. Review the changes and update release notes and versioned archive examples. Publish the newly versioned archives from `output/`, core first; npm will not let you reuse a published name/version pair. Commit and tag the source according to your repository's release process.

The lifecycle hooks follow [npm's script lifecycle](https://docs.npmjs.com/cli/v11/using-npm/scripts/). Package inclusion and registry metadata follow [npm's package.json reference](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/).

## Frontend CI/CD

[Frontend CI/CD](../.github/workflows/frontend.yml) verifies pull requests, pushes
to `main`, and manual workflow runs. Node 22 comes from `.nvmrc`; `npm ci` installs
the root lockfile. The verification job runs the
[`check:full`](../AGENTS.md#validate-and-finish) steps separately, so each failure and
artifact is easy to inspect. Browser tests run against the production demo, with
navigation performance measured in Chromium only. The Pages smoke test runs under a
project subdirectory and covers worker data, exact jumps, full-page reloads, home
navigation, and tutorial companions.

Only successful verification on `refs/heads/main` permits deployment. Merging a PR
into `main` triggers a push run; **Actions → Frontend CI/CD → Run workflow → main**
provides a manual deployment of that branch. PR runs and manual runs on other
branches only verify. The workflow never publishes to npm.

**Deploy frontend** publishes the verified `demo/dist` from the same run to GitHub Pages,
with Pages and OIDC write access only.

The app includes the static gallery and every tutorial companion except HTTP. The HTTP
lesson requires the local dev/preview server; GitHub Pages cannot host its API.
Relative asset URLs keep the app usable at a domain root or project path.

The lessons are read in the repository under `docs/lessons/`; there is no GitHub Wiki
copy to deploy.

Browser reports and failure traces and the checked npm tarball are retained as
workflow artifacts for 14 days.

### Enable deployment

1. Use `main` as the repository's default branch. If it is still `master`, rename
   it to `main` in **Settings → Branches**, then update local checkouts and PR bases.
   This workflow deliberately deploys only `main`.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. In **Settings → Environments → github-pages**, allow branch `main`. Replace an
   old `master` deployment rule if present. For protected merges, require the
   **Verify frontend** status check in the `main` ruleset.
4. Merge/push the workflow and source to `main`, or run the workflow on `main`.
   Check that **Verify frontend** and **Deploy frontend** succeed.

Pending for `vitaliiznak/granum-grid` (checked 2026-10-13; Pages already uses GitHub
Actions). Remove this list after the first `main` deployment:

- [ ] Rename the default branch from `master` to `main` (step 1).
- [ ] Allow `main` in the `github-pages` environment (step 3).

No personal access token or repository secret is needed; Pages uses its deployment
token/OIDC. See GitHub's [custom Pages workflow setup](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Expected destinations:

- [Demo app](https://vitaliiznak.github.io/granum-grid/)
- [Tutorial companions](https://vitaliiznak.github.io/granum-grid/tutorials.html)
- [Lessons](https://github.com/vitaliiznak/granum-grid/blob/main/docs/lessons/README.md)

### Verify and recover

Reproduce verification locally:

```sh
npm ci
npx playwright install chromium firefox webkit
CI=1 PLAYWRIGHT_PORT=5188 npm run check:full
```

Use an unused port.

After deployment, verify the public app:

```sh
PAGES_URL=https://vitaliiznak.github.io/granum-grid/ npm run test:pages
```

The Pages check saves a screenshot under `output/playwright/pages-smoke/` and a
trace on failure. A local pass does not establish a hosted deployment.

If Pages fails, check its source and environment branch rule, then rerun the failed
job after fixing its setup. To roll back the release,
revert the unwanted source commit on `main`; verification runs before republishing.

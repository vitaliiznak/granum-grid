# Publishing Granum Grid

The publishable workspace is `granum-grid/`, currently version `0.1.0`, under Apache-2.0. The repository root and demo are private npm workspaces. The library has ESM exports, TypeScript declarations, optional CSS, and React/React DOM 18.2–19 peer dependencies.

## Verify and prepare the artifact

From the repository root, using Node.js 22:

```sh
npm ci
npm run release:check
```

This runs lint, source/test type checks, documentation links, tutorial snippets, wiki export/sync tests, and unit tests, builds the library and demo, and packs the library through its `prepack` hook. It installs that exact archive in temporary, independent React 18.2 and React 19 applications, checks runtime imports, SSR, styles, source maps, and TypeScript declarations using NodeNext and Bundler resolution. Temporary consumers are removed even if a check fails. Consumer dependency installation needs npm registry access unless cached.

Only a successful package check copies the archive to `output/granum-grid-0.1.0.tgz`. Source files are included so JavaScript and declaration maps resolve correctly. Tests, the demo, media, and workspace tooling are excluded. The canonical root `LICENSE` is copied into the package during its build.

Run the browser suite before a release as well (the existing CI workflow runs it):

```sh
npx playwright install chromium firefox webkit
npm run test:e2e
```

GitHub Actions also uploads the checked archive as the `npm-package` artifact. It does not publish to npm. A successful local run does not establish that remote CI or registry publishing succeeded.

## First publication

1. Sign in to the npm account that will own the package: `npm login --registry=https://registry.npmjs.org/`, then verify it with `npm whoami --registry=https://registry.npmjs.org/`.
2. Recheck the name with `npm view granum-grid name version --registry=https://registry.npmjs.org/`. If the name is unavailable, choose a scoped name and update the package, demo dependency, examples, and consumer fixtures together before re-running verification.
3. Confirm `repository` (with `directory: "granum-grid"`), `homepage`, and `bugs` in `granum-grid/package.json` still point to the public repository, then regenerate the archive.
4. Inspect the exact archive without publishing:

   ```sh
   npm publish ./output/granum-grid-0.1.0.tgz --dry-run --access public --registry=https://registry.npmjs.org/
   ```

5. When ready to make the release public, publish the verified archive:

   ```sh
   npm publish ./output/granum-grid-0.1.0.tgz --access public --registry=https://registry.npmjs.org/
   ```

   Complete npm's authentication/2FA prompt if requested. This is the only step above that publishes. A dry run does not verify publishing permissions, reserve the name, or claim success.

6. Verify `npm view granum-grid@0.1.0 version dist.integrity --registry=https://registry.npmjs.org/`, then replace the “not yet published” wording and local-archive install steps in `README.md`, `granum-grid/README.md`, `docs/QUICK_START.md`, and `docs/wiki/Setup.md`.

Publishing a tarball uses its existing contents; it does not rebuild or run this repository's release checks. Always use an archive from the latest successful `release:check` for the intended source version. Publishing directly from the workspace with `npm publish -w granum-grid` runs `prepublishOnly` to verify the release and `prepack` to rebuild it.

## Later releases

Bump the library version from the repository root, keeping the lockfile synchronized:

```sh
npm version patch -w granum-grid --no-git-tag-version
npm run release:check
```

Use `minor`, `major`, or an explicit version when appropriate. Review the changes and update release notes and versioned archive examples. Publish the newly versioned archive from `output/`; npm will not let you reuse an already-published name/version pair. Commit and tag the source according to your repository's release process.

The lifecycle hooks follow [npm's script lifecycle](https://docs.npmjs.com/cli/v11/using-npm/scripts/). Package inclusion and registry metadata follow [npm's package.json reference](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/).

## Frontend CI/CD

[Frontend CI/CD](../.github/workflows/frontend.yml) verifies pull requests, pushes
to `main`, and manual workflow runs. Node 22 comes from `.nvmrc`; `npm ci` installs
the root lockfile. The verification job runs:

- Lint, formatting, source/test types, documentation links, source-matched lesson
  snippets, wiki export/sync tests, and unit tests.
- Library, demo, media studio, and wiki builds; isolated React 18.2/19 tarball consumers.
- Chromium, Firefox, and WebKit against the production demo, with navigation
  performance measured in Chromium only.
- A Pages smoke test under a project subdirectory, including workers, exact jumps,
  full-page reloads, home navigation, and tutorial companions.

Only successful verification on `refs/heads/main` permits deployment. Merging a PR
into `main` triggers a push run; **Actions → Frontend CI/CD → Run workflow → main**
provides a manual deployment of that branch. PR runs and manual runs on other
branches only verify. The workflow never publishes to npm.

Two jobs use the verified artifacts from the same run:

| Job             | Output                                       | Write access             |
| --------------- | -------------------------------------------- | ------------------------ |
| Deploy frontend | `demo/dist` → GitHub Pages                   | Pages and OIDC only      |
| Deploy wiki     | `output/wiki` → the repository's `.wiki.git` | Repository contents only |

The app includes the static gallery and first three tutorial companions. The HTTP
lesson requires the local dev/preview server; GitHub Pages cannot host its API.
Relative asset URLs keep the app usable at a domain root or project path.

The wiki build rewrites lesson links to wiki URLs and repository links to the
verified commit. Tutorial code stays unchanged. Its manifest records managed
pages: deleting a lesson from `docs/wiki/` removes that published page at the next
sync, while unrelated manual pages and wiki Git history remain. Edit managed
lessons in the main repository; direct wiki edits to them are overwritten.
Unchanged exports produce no wiki commit.

Browser reports and failure traces, the checked npm tarball, and the wiki export
are retained as workflow artifacts for 14 days. Wiki artifacts are uploaded on
`main` deployment runs; the export is built and tested on PRs too.

### Enable deployment

1. Use `main` as the repository's default branch. If it is still `master`, rename
   it to `main` in **Settings → Branches**, then update local checkouts and PR bases.
   This workflow deliberately deploys only `main`.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. In **Settings → Environments → github-pages**, allow branch `main`. Replace an
   old `master` deployment rule if present. For protected merges, require the
   **Verify frontend** status check in the `main` ruleset.
4. Enable **Wikis** in repository settings, open **Wiki**, and create an initial
   **Home** page. GitHub creates the separate wiki Git repository only after its
   first page is saved. The pipeline replaces that page with `docs/wiki/Home.md`.
5. Merge/push the workflow and source to `main`, or run the workflow on `main`.
   Check that **Verify frontend**, **Deploy frontend**, and **Deploy wiki** succeed.

Pending for `vitaliiznak/deepscroll` (checked 2026-10-13; Pages already uses GitHub
Actions and Wikis are enabled). Remove this list after the first `main` deployment:

- [ ] Rename the default branch from `master` to `main` (step 1).
- [ ] Allow `main` in the `github-pages` environment (step 3).
- [ ] Create the first wiki page (step 4).

No personal access token or repository secret is needed. Wiki publishing uses the
job's `GITHUB_TOKEN` with `contents: write`; Pages uses its deployment token/OIDC.
See GitHub's [custom Pages workflow setup](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
and [wiki initialization instructions](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages).

Expected destinations:

- [Demo app](https://vitaliiznak.github.io/deepscroll/)
- [Tutorial companions](https://vitaliiznak.github.io/deepscroll/tutorials.html)
- [Tutorial wiki](https://github.com/vitaliiznak/deepscroll/wiki)

### Verify and recover

Reproduce verification locally:

```sh
npm ci
npx playwright install chromium firefox webkit
CI=1 PLAYWRIGHT_PORT=5188 npm run check:full
```

Use an unused port. `npm run build:wiki` exports Markdown locally without pushing;
`npm run test:wiki` checks links, code preservation, repeatable sync, and removal
of obsolete managed pages. Review `output/wiki/` before the first deployment.

After deployment, verify the public app:

```sh
PAGES_URL=https://vitaliiznak.github.io/deepscroll/ npm run test:pages
```

The Pages check saves a screenshot under `output/playwright/pages-smoke/` and a
trace on failure. A local pass does not establish a hosted deployment.

If Pages fails, check its source and environment branch rule. If the wiki checkout
reports “repository not found,” enable and initialize the wiki. For a wiki push
permission failure, inspect the job's token permissions and repository policy.
The deployment jobs are independent: one can succeed while the other fails; check
both and rerun the failed job after fixing its setup. To roll back the release,
revert the unwanted source commit on `main`; verification runs before republishing.

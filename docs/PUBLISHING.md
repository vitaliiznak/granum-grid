# Publishing deepscroll to npm

The publishable workspace is `deepscroll/`, currently version `0.1.0`, under Apache-2.0. The repository root and demo are private npm workspaces. The library has ESM exports, TypeScript declarations, optional CSS, and React/React DOM 18.2–19 peer dependencies.

## Verify and prepare the artifact

From the repository root, using Node.js 22:

```sh
npm ci
npm run release:check
```

This runs the unit tests, builds the library and demo, and packs the library through its `prepack` hook. It installs that exact archive in temporary, independent React 18.2 and React 19 applications, checks runtime imports, SSR, styles, source maps, and TypeScript declarations using NodeNext and Bundler resolution. Temporary consumers are removed even if a check fails. Consumer dependency installation needs npm registry access unless cached.

Only a successful package check copies the archive to `output/deepscroll-0.1.0.tgz`. Source files are included so JavaScript and declaration maps resolve correctly. Tests, the demo, media, and workspace tooling are excluded. The canonical root `LICENSE` is copied into the package during its build.

Run the browser suite before a release as well (the existing CI workflow runs it):

```sh
npx playwright install chromium firefox webkit
npm run test:e2e
```

GitHub Actions also uploads the checked archive as the `npm-package` artifact. It does not publish to npm. A successful local run does not establish that remote CI or registry publishing succeeded.

## First publication

1. Sign in to the npm account that will own the package: `npm login --registry=https://registry.npmjs.org/`, then verify it with `npm whoami --registry=https://registry.npmjs.org/`.
2. Recheck the name with `npm view deepscroll name version --registry=https://registry.npmjs.org/`. The registry returned E404 on 13 October 2026; that does not reserve the name or guarantee it is publishable. If the name is unavailable, choose a scoped name and update the package, demo dependency, examples, and consumer fixtures together before re-running verification.
3. This checkout has no Git remote configured. When its public repository URL is known, add `repository` (with `directory: "deepscroll"`), `homepage`, and `bugs` to `deepscroll/package.json`, then regenerate the archive. No placeholder URLs are shipped.
4. Inspect the exact archive without publishing:

   ```sh
   npm publish ./output/deepscroll-0.1.0.tgz --dry-run --access public --registry=https://registry.npmjs.org/
   ```

5. When ready to make the release public, publish the verified archive:

   ```sh
   npm publish ./output/deepscroll-0.1.0.tgz --access public --registry=https://registry.npmjs.org/
   ```

   Complete npm's authentication/2FA prompt if requested. This is the only step above that publishes. A dry run does not verify publishing permissions, reserve the name, or claim success.

6. Verify `npm view deepscroll@0.1.0 version dist.integrity --registry=https://registry.npmjs.org/`, then remove the “not yet published” wording from both READMEs.

Publishing a tarball uses its existing contents; it does not rebuild or run this repository's release checks. Always use an archive from the latest successful `release:check` for the intended source version. Publishing directly from the workspace with `npm publish -w deepscroll` runs `prepublishOnly` to verify the release and `prepack` to rebuild it.

## Later releases

Bump the library version from the repository root, keeping the lockfile synchronized:

```sh
npm version patch -w deepscroll --no-git-tag-version
npm run release:check
```

Use `minor`, `major`, or an explicit version when appropriate. Review the changes and update release notes and versioned archive examples. Publish the newly versioned archive from `output/`; npm will not let you reuse an already-published name/version pair. Commit and tag the source according to your repository's release process.

The lifecycle hooks follow [npm's script lifecycle](https://docs.npmjs.com/cli/v11/using-npm/scripts/). Package inclusion and registry metadata follow [npm's package.json reference](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/).

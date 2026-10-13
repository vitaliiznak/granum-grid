# GitHub Pages deployment

## Outcome

Publish the demo to `vitaliiznak/deepsearch` with GitHub Actions deploying the
verified production artifact from the default branch. Verify the live site.

## Scope and decisions

- Create the requested public repository under the authenticated `vitaliiznak` account.
- Release committed application code plus this task's deployment changes.
  Preserve unrelated working-tree edits and validate in an isolated snapshot.
- Keep the existing type, unit, build, package, and cross-browser gates.
- Include the reviewed dynamic-height test correction: Range summaries starts
  grouped; zoom to individual rows before asserting measured row geometry.
- Include the reviewed mobile demo height fix (460 to 720 px): the committed
  layout leaves no room for rows below the wrapped Range summaries controls.
- Include the endpoint-summary sizing fix: use the occupied viewport area so
  summary bands at row 1 are not all too small to render.
- Keep touch assertions and refresh the gesture coordinates after scrolling or
  pinching, so the second gesture hits the actual current viewport.
- Add a Pages smoke check for project-path assets/workers, navigation, and reloads.
  The same check can target the actual deployed URL.

## Steps

- [x] Review current workflow, application base path, and repository state.
- [x] Add and validate the Pages smoke check and align deployment documentation.
- [x] Validate the isolated release snapshot locally; prepare only reviewed changes.
- [ ] Commit and push the reviewed release.
- [ ] Create the repository, connect the remote, and enable Pages workflow builds.
- [ ] Push, inspect hosted CI, and verify the published site.

## Evidence

- Setup diagnostic passed; working-tree type checks and 56 unit tests passed.
- Created public repository `vitaliiznak/deepsearch` and connected `origin`.
- Release type checks, 56 unit tests, library/demo/media builds, and isolated
  React 18.2/19 package consumers passed.
- Focused Chromium checks passed without retries: three dynamic-height cases
  and ten interaction cases, including the previously failing mobile and touch flows.
- Pages smoke passed for worker data, jump, full-page reload, and home navigation.
- Workflow passed actionlint; touched release code passed Prettier.
- Full hosted cross-browser validation remains the required deployment gate.
- Hosted CI and deployment are not verified yet.

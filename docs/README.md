# Granum Grid documentation

Use Granum Grid to explore an ordered dataset with a known row count: render rows,
jump to exact addresses, and add summaries and search through your own provider.
The library can be installed in another app independently of the demo.

**Learn by building with the [tutorial wiki](wiki/Home.md).** Use inventory, sensor,
log, and recording datasets to build progressively richer integrations. Each lesson
has working code and checkpoints. For a direct setup recipe, use the
[quick start](QUICK_START.md).

## Find the right guide

| I want to…                                      | Read                                                                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Get my first explorer running                   | [Quick start](QUICK_START.md)                                                                                                                        |
| Learn through different datasets                | [Tutorial wiki](wiki/Home.md)                                                                                                                        |
| Adapt an existing array                         | [Array recipe](QUICK_START.md#use-your-own-array)                                                                                                    |
| Load data from my server                        | [HTTP provider recipe](QUICK_START.md#connect-an-http-api) and [provider rules](GUIDE.md#provider-contract)                                          |
| Add search or dataset summaries                 | [Provider capabilities](GUIDE.md#provider-capabilities), [search](GUIDE.md#search), and [range summaries](GUIDE.md#range-summaries-and-custom-bands) |
| Navigate from my own buttons                    | [Custom controls](QUICK_START.md#build-custom-controls)                                                                                              |
| Handle row heights, append mode, or saved views | [Integration guide](GUIDE.md)                                                                                                                        |
| Look up a default or limit                      | [Limits and defaults](GUIDE.md#limits-and-defaults)                                                                                                  |
| Match my application's appearance               | [Styling guide](../STYLING.md)                                                                                                                       |
| Check the exact public types                    | [Exports](../granum-grid/src/index.ts), [provider contract](../granum-grid/src/data/types.ts), and [navigation API](../granum-grid/src/core/api.ts)     |
| Understand a setup problem                      | [Quick-start troubleshooting](QUICK_START.md#if-something-does-not-look-right)                                                                       |
| Know what is not supported                      | [Scope and current limits](../README.md#scope-and-current-limits)                                                                                    |
| Decide whether this library fits the job        | [Manifest](MANIFEST.md)                                                                                                                              |
| Understand why it works this way                | [Design rationale and decisions](../DESIGN.md) and the [manifest](MANIFEST.md)                                                                       |
| Contribute or run checks                        | [AGENTS.md](../AGENTS.md) and the [development workflow](AI_WORKFLOW.md)                                                                             |
| Prepare a release or deployment                 | [Publishing guide](PUBLISHING.md)                                                                                                                    |

The exported types and tests establish what is currently implemented. The library
source is in [`granum-grid/`](../granum-grid/), with its [package README](../granum-grid/README.md).

## Explore the examples

- [Visual tour](../README.md#visual-tour): see the navigation and range workflows.
- [HTTP recording example](QUICK_START.md#try-the-working-http-example): a local server and client using a real, redacted Chromium recording.
- [Application-owned AI tools](../demo/src/ai/README.md): deterministic calls through the public API; the host supplies any model connection.
- [Media studio](../media/README.md): reproduce screenshots and video.

Generated demo data, sampled search, and recording-based examples have different
limits. Read the [demo limitations](../README.md#demo-limitations) before using them
as performance or completeness evidence.

## Tutorial wiki

The [wiki](wiki/Home.md) is tutorial material for library users: setup, complete
examples, expected results, and exercises. Edit lessons in `docs/wiki/` and review
them with the code; `npm run test:tutorials` checks their snippets against the
compiled companions in `demo/src/tutorials`. Verified deployments from `main` export
the lessons to [GitHub Wiki](https://github.com/vitaliiznak/granum-grid/wiki); see
[Frontend CI/CD](PUBLISHING.md#frontend-cicd).

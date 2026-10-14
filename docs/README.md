# Granum Grid documentation

Use Granum Grid to explore an ordered dataset with a known row count: render rows,
jump to exact addresses, and add summaries and search through your own provider.
The library can be installed in another app independently of the demo.

**Learn by building with the [lessons](wiki/Home.md).** Use inventory, sensor,
log, and recording datasets to build progressively richer integrations. Each lesson
has working code and checkpoints. For a direct setup recipe, use the
[quick start](QUICK_START.md).

## Find the right guide

| I want to…                                      | Read                                                                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Get my first explorer running                   | [Quick start](QUICK_START.md)                                                                                                                       |
| Learn through different datasets                | [Lessons](wiki/Home.md)                                                                                                                             |
| Adapt an existing array                         | [Array recipe](QUICK_START.md#use-your-own-array)                                                                                                   |
| Load data from my server                        | [HTTP provider recipe](QUICK_START.md#connect-an-http-api) and [provider rules](GUIDE.md#provider-contract)                                         |
| Read a Parquet file with no server              | [`@granum/parquet`](../packages/parquet/README.md)                                                                                                  |
| Query SQL or a local file with an exact map     | [`@granum/sql`](../packages/sql/README.md)                                                                                                          |
| Sort, filter, or edit on the server             | [Server-owned ordering](GUIDE.md#server-owned-ordering)                                                                                             |
| Add search or dataset summaries                 | [Provider capabilities](GUIDE.md#provider-capabilities), [search](GUIDE.md#search), and [host tools](GUIDE.md#selection-and-host-tools)             |
| Navigate from my own buttons                    | [Custom controls](QUICK_START.md#build-custom-controls) and the [integration interface](GUIDE.md#integration-interface)                             |
| Handle row heights, append mode, or saved views | [Integration guide](GUIDE.md)                                                                                                                       |
| Look up a default or limit                      | [Limits and defaults](GUIDE.md#limits-and-defaults)                                                                                                 |
| Match my application's appearance               | [Styling guide](../STYLING.md)                                                                                                                      |
| Check the exact public types                    | [Exports](../granum-grid/src/index.ts), [provider contract](../granum-grid/src/data/types.ts), and [navigation API](../granum-grid/src/core/api.ts) |
| Understand a setup problem                      | [Quick-start troubleshooting](QUICK_START.md#if-something-does-not-look-right)                                                                      |
| Know what is not supported                      | [Scope and current limits](../README.md#scope-and-current-limits)                                                                                   |
| Decide whether this library fits the job        | [Design principles](../DESIGN.md#principles)                                                                                                        |
| Understand why it works this way                | [Design rationale and decisions](../DESIGN.md)                                                                                                      |
| Contribute or run checks                        | [AGENTS.md](../AGENTS.md) and the [development workflow](AI_WORKFLOW.md)                                                                            |
| Prepare a release or deployment                 | [Publishing guide](PUBLISHING.md)                                                                                                                   |

The exported types and tests establish what is currently implemented. The library
source is in [`granum-grid/`](../granum-grid/), with its [package README](../granum-grid/README.md).

## Explore the examples

- [Visual tour](../README.md#visual-tour): see the navigation and range workflows.
- [HTTP recording lesson](wiki/HTTP-recording.md): a local server and client using a real, redacted Chromium recording.
- [Media studio](../media/README.md): reproduce screenshots and video.

Generated demo data, sampled search, and recording-based examples have different
limits. Read the [demo limitations](../README.md#demo-limitations) before using them
as performance or completeness evidence.

## Lessons

The [lessons](wiki/Home.md) are tutorial material for library users: setup, complete
examples, expected results, and exercises. Edit them in `docs/wiki/` and review them
with the code: their code blocks must match the companions in `demo/src/tutorials`,
which `npm run check` verifies. They are read here in the repository; there is no
separate GitHub Wiki copy.

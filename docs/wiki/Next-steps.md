# Apply the library to another dataset

[All lessons](Home.md) · [Previous: Compose](Compose.md)

The five lessons cover rows, summaries, search, transport, and composition. Choose the next
capability based on what a person needs to do with your data.

| Dataset | Useful first workflow | Add after it works |
| --- | --- | --- |
| Inventory or orders | Find a known record and inspect its neighbours | Server filtering with a new snapshot revision |
| Sensor measurements | Find a warm interval and compare it with baseline | Missing-value handling, precomputed summaries |
| Application logs | Find errors and navigate to their original positions | Append mode and saved investigation views |
| Browser recordings | Find slow events and inspect adjacent activity | Additional map tracks and event categories |
| Genomic coordinates | Jump to a named region | Domain-specific labels, verified coordinate conversion |
| Market records | Navigate a stable time-ordered snapshot | Explicit missing periods and justified aggregation |

The gallery's genome, market, and star datasets are generated demonstrations.
Treat domain coordinates and landmarks as example inputs; use your own validated
sources when building an application. The library does not supply these datasets.

## Add a live feed

Read the [append guide](../GUIDE.md#append-only-live-feeds).

Use `dataMode="append"` when existing rows retain their addresses and only the
count grows; `dataMode="follow"` also follows while already at the end. Preserve the
same ID/revision for a genuine append. Replacing, sorting, removing, or changing
existing rows needs a new revision.

Check three states: following at the end, reading older rows while new ones arrive,
and explicitly resuming. The reader's place must not move while they inspect history.

## Let row content grow

Use `dynamicRowHeight` for wrapped messages and expanded detail. Keep expansion
state in your application because virtualized rows unmount. Start with the
[dynamic-height guide](../GUIDE.md#dynamic-heights-and-standard-list-apis) and check
that expanding a row preserves the viewport anchor.

## Build a custom layout

Keep `GranumGrid` when row rendering and style slots are enough. Use `useGranumGrid`
and the exported components when you need to own the surrounding markup. Follow
[styling and composition](../../STYLING.md) and preserve the props supplied for
keyboard input, focus, measurements, and announcements.

## Verify an integration

Use the lesson checkpoints with your data, then test a jump near the end, cancellation
while navigating, a revision change, and an empty dataset. Check keyboard access and
a narrow viewport. Verify exact/estimated/unavailable summaries and search completeness
against known records rather than relying only on the appearance of a chart.

[Public exports](../../granum-grid/src/index.ts) and the
[provider contract](../../granum-grid/src/data/types.ts) are the source of truth.
The [integration guide](../GUIDE.md) explains the remaining options.

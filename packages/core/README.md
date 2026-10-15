# @granum-grid/core

The framework-free half of [Granum Grid](https://github.com/vitaliiznak/granum-grid): the
navigation engine, the data session that pages a provider, native scrolling for a DOM
element or the window, and the pieces of the dataset map. No React, no dependencies.
[`@granum-grid/react`](https://github.com/vitaliiznak/granum-grid/tree/main/packages/react) is
built on it.

Not yet on npm.

## Entries

| Entry                    | What it gives you                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@granum-grid/core`           | `createEngine`: a float row address over billions of rows, jumps, history, alignment, and measured row heights; saved views (`encodeView`, `decodeView`) |
| `@granum-grid/core/data`      | The `DataProvider` contract and its types, `DataSession` (paged, cancelable, bounded fetching), `PageCache`, and array, cursor, and range providers      |
| `@granum-grid/core/dom`       | `mount`: the rows explorer in any element; `bindScroll` and the other pieces it and `@granum-grid/react` share                                                |
| `@granum-grid/core/map`       | `mountMap`: the dataset map beside any scroller; the drag math, canvas drawing, peak attraction, and marker grouping it and `AtlasRail` share            |
| `@granum-grid/core/internal`  | What `@granum-grid/react` needs beyond those; no compatibility promise                                                                                        |
| `base.css`, `styles.css` | Layout and the optional skin shared by every binding                                                                                                     |

## Without a framework

`mount` puts a complete explorer (rows in a native scroller, typed jumps through the
handle, history, keys, measured heights, and announcements) into any element. It returns
the same `GranumGridApi` handle as `@granum-grid/react`'s `apiRef`.

```ts
import { mount } from '@granum-grid/core/dom';
import { createArrayProvider } from '@granum-grid/core/data';
import '@granum-grid/core/styles.css';

const grid = mount(document.getElementById('grid')!, {
  provider: createArrayProvider(lines, { id: 'lines', revision: '1' }),
  ariaLabel: 'Log lines',
  height: '70vh',
  renderRow(line, index, element) {
    const cell = document.createElement('span');
    cell.setAttribute('role', 'gridcell');
    cell.textContent = `${index + 1}  ${line}`;
    element.append(cell);
  },
});
grid.api.goTo(41_999); // the same handle React's apiRef exposes
// grid.destroy() removes it.
```

`renderRow` runs when a row arrives, not on every scroll frame. Add the dataset map with
`mountMap` (below). The playground's
[No framework page](https://vitaliiznak.github.io/granum-grid/vanilla.html) shows a
billion computed rows this way.

`mount` is assembled from pieces that `@granum-grid/react` uses too, all in `@granum-grid/core/dom`:
`bindScroll` (native scrolling for an element or the window), `rowMapping` and `rowWindow`
(the bounded rows to mount and their viewport pixels), `createRowMeasurements`,
`createRowRequests`, `observeViewport`, `jumpAnnouncement`, and the key handlers. A binding
for another framework composes the same pieces.

## The map beside any scroller

`mountMap` draws the dataset map (the whole dataset's profile, the rows in view, and named
places) and drives a scroller it does not own. Click to jump, drag to scroll, move the
pointer sideways for 1/2, 1/4, or 1/20 speed, and let slow drags settle on markers and
peaks; Shift moves freely. The thumb is a slider: arrows, Page Up/Down, Home, and End.

```ts
import { gridTarget, mountMap, scrollerTarget } from '@granum-grid/core/map';

// Beside Granum's own explorer: a drag becomes one Back entry.
mountMap(document.getElementById('map')!, {
  target: gridTarget(grid.api),
  overview: await provider.fetchOverview?.(240, signal),
  markers,
  metric: { label: 'Latency', kind: 'value' },
});

// Beside a plain overflow list of fixed-height rows.
mountMap(mapElement, { target: scrollerTarget(list, { rowCount: 10_000, rowHeight: 28 }) });
```

Any other scroller passes a `MapTarget`: `rowCount()`, `visibleRange()`, `subscribe`, and
`scrollToIndex`, plus optional `beginScrub`/`scrub`/`endScrub` if it can treat a drag as
one move. The playground's
[Your own scroller page](https://vitaliiznak.github.io/granum-grid/scrollers.html) puts one
map beside Granum (4 billion rows), TanStack Virtual (500,000), and a plain list (10,000),
with the TanStack target written out in a dozen lines.

`mountMap` is the compact map. `@granum-grid/react`'s `AtlasRail` adds the row preview on hover,
help, the axis, the chart picker, range selection, and the marker list; both use the same
drag math (`beginScrub`, `moveScrub`, `rowAtPointer`).

## License

Apache-2.0

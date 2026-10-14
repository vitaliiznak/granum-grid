# @granum/core

The framework-free half of [Granum Grid](https://github.com/vitaliiznak/granum-grid): the
navigation engine, the data session that pages a provider, native scrolling for a DOM
element or the window, and the pieces of the dataset map. No React, no dependencies.
[`@granum/react`](https://github.com/vitaliiznak/granum-grid/tree/main/packages/react) is
built on it.

Not yet on npm.

## Entries

| Entry                    | What it gives you                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@granum/core`           | `createEngine`: a float row address over billions of rows, jumps, history, alignment, and measured row heights; saved views (`encodeView`, `decodeView`) |
| `@granum/core/data`      | The `DataProvider` contract and its types, `DataSession` (paged, cancelable, bounded fetching), `PageCache`, and array, cursor, and range providers      |
| `@granum/core/dom`       | `bindScroll`: drive an engine from a native scroller or the window; the explorer's keys; event-target rules for host controls                            |
| `@granum/core/map`       | The map's overview scale and accuracy, canvas drawing, peak attraction, marker grouping, and number formats                                              |
| `@granum/core/internal`  | What `@granum/react` needs beyond those; no compatibility promise                                                                                        |
| `base.css`, `styles.css` | Layout and the optional skin shared by every binding                                                                                                     |

## Without a framework

`mount` puts a complete explorer (rows in a native scroller, typed jumps through the
handle, history, keys, measured heights, and announcements) into any element. It returns
the same `GranumGridApi` handle as `@granum/react`'s `apiRef`.

```ts
import { mount } from '@granum/core/dom';
import { createArrayProvider } from '@granum/core/data';
import '@granum/core/styles.css';

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

`renderRow` runs when a row arrives, not on every scroll frame. The dataset map is not part
of `mount` yet. The playground's
[No framework page](https://vitaliiznak.github.io/granum-grid/vanilla.html) shows a
billion computed rows this way.

`mount` is assembled from pieces that `@granum/react` uses too, all in `@granum/core/dom`:
`bindScroll` (native scrolling for an element or the window), `rowMapping` and `rowWindow`
(the bounded rows to mount and their viewport pixels), `createRowMeasurements`,
`createRowRequests`, `observeViewport`, `jumpAnnouncement`, and the key handlers. A binding
for another framework composes the same pieces.

## License

Apache-2.0

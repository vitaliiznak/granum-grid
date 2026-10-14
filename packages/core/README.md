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

The engine knows where the reader is; `bindScroll` keeps a native scroller in step with it;
the data session fetches the rows in view. You render the rows wherever the engine says.

```ts
import { createEngine } from '@granum/core';
import { DataSession, createArrayProvider } from '@granum/core/data';
import { bindScroll } from '@granum/core/dom';

const provider = createArrayProvider(lines, { id: 'lines', revision: '1' });
const engine = createEngine({ rowCount: provider.rowCount, rowHeight: 24 });
const session = new DataSession(provider);
session.start();

// `viewport` scrolls; `layer` holds the rows and follows the scroll offset.
engine.setViewport(viewport.clientHeight);
const unbind = bindScroll(viewport, engine, { layer });
function draw() {
  const { position, height } = engine.getSnapshot();
  const first = Math.floor(position);
  session.setRange('visible', first, Math.ceil(height / 24) + 1);
  // Place rows `first…` at y = (row - position) * 24 inside `layer`; session.read(row)
  // returns each loaded row, and session.has(row) says whether it has arrived.
}
engine.subscribe(draw); // the reader moved
session.subscribe(draw); // rows arrived
```

A complete plain-DOM binding with row measurement, keys, and announcements is planned
(`mount()`); until then, `@granum/react`'s hook shows every step.

## License

Apache-2.0

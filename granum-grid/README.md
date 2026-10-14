# Granum Grid

A React + TypeScript explorer for very large indexed datasets. A floating row address drives a bounded viewport, avoiding browser element-height limits. A dataset map shows the shape of the data, chapters, events, and your position.

## Install

React and React DOM 18.2–19 are peer dependencies; there are no other runtime dependencies. The package ships ESM JavaScript and TypeScript declarations; use an ESM-capable bundler and TypeScript 5+ for typed consumers. CommonJS `require()` is not supported.

This version is not yet published to npm. Build and install a local archive with [step 1 of the quick start](https://github.com/vitaliiznak/granum-grid/blob/main/docs/QUICK_START.md#1-install-the-library), which also covers a new-app setup, an HTTP adapter, and troubleshooting.

## Use

```tsx
import { GranumGrid, createArrayProvider } from 'granum-grid';
import 'granum-grid/styles.css';

// Keep the provider outside render, or memoize it by rows and revision.
const provider = createArrayProvider([{ value: 21.4 }, { value: 22.1 }, { value: 20.8 }], {
  id: 'readings',
  revision: '1',
});

export function Explorer() {
  return (
    <GranumGrid
      provider={provider}
      ariaLabel="Readings"
      style={{ height: 480 }}
      renderRow={({ row, rowNumber }) => (
        <span role="gridcell">
          Reading {rowNumber}: {row.value} °C
        </span>
      )}
    />
  );
}
```

For remote data, supply a `DataProvider` with `id`, `revision`, `rowCount`, and `fetchRows(start, count, signal)` instead; the component stays the same. `Row` is your own type, with no required fields. API indices are zero-based and the UI shows one-based row numbers. Change the provider's `revision` when data order or contents change, and fetch exactly the requested count of rows. Overview summaries, markers, chapters, and search are optional provider methods.

No stylesheet is imported automatically: choose `granum-grid/styles.css` for the default theme, `granum-grid/base.css` for layout only, or no CSS with the headless `useGranumGrid` hook. With React Server Components, render the explorer, provider, and renderer inside a `'use client'` component.

## Entry points

| Entry                   | Surface                                                                                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `granum-grid`            | `GranumGrid`, `useGranumGrid`, `AtlasRail`, `JumpBar`, `ViewCanvas`, `createArrayProvider`, `createCursorProvider`, `rangeProvider`, `acceptServerRevision`, `acceptCursorWindow`, `serverActionIssue`, `encodeView`, `decodeView`, `defaultFeatures`, and public types |
| `granum-grid/core`       | Framework-independent engine (`createEngine`), coordinate mappings, saved-view encoding, and `validRange`                                                                                                                                                               |
| `granum-grid/data`       | Provider types, `PageCache`, `DataSession`, `rangeProvider`, `createArrayProvider`, `createCursorProvider`, `acceptServerRevision`, `acceptCursorWindow`, and `serverActionIssue`                                                                                       |
| `granum-grid/base.css`   | Structural layout only                                                                                                                                                                                                                                                  |
| `granum-grid/styles.css` | Optional skin and `--ds-*` theme variables; includes base layout                                                                                                                                                                                                        |

## Browser support

Chrome and Edge 100+, Firefox 104+, and Safari/iOS Safari 15.4+. This is the floor the code needs (for example `Array.prototype.findLast`, `AbortSignal.throwIfAborted`, `<dialog>`, and CSS cascade layers); it is declared as `browserslist` in `package.json`, and `npm run lint` checks JavaScript and Web APIs against it. Browsers without cascade layers ignore the stylesheets entirely, so there is no partial-layout fallback. The optional skin in `styles.css` tints some borders and highlights with `color-mix()` (Chrome 111, Firefox 113, Safari 16.2); earlier browsers show them untinted. Dynamic viewport units fall back to `vh`.

- Trackpad pinch zooms a focused explorer: Ctrl+wheel in Chrome, Edge, and Firefox, and gesture events in desktop Safari. An unfocused explorer leaves pinch to the browser's page zoom.
- On touch screens the viewport captures vertical swipes to pan rows (`touch-action: none`). A swipe that reaches either end of the dataset does not continue into the page. With elastic edges on, the wheel resists and springs back at either end as well. With elastic edges off, the wheel continues into the page. Leave page area outside an embedded explorer on phones, or use `layout="page"`.

## Documentation

- [Quick start](https://github.com/vitaliiznak/granum-grid/blob/main/docs/QUICK_START.md): install, first explorer, array and HTTP providers, custom controls.
- [Integration guide](https://github.com/vitaliiznak/granum-grid/blob/main/docs/GUIDE.md): provider rules, search, dynamic heights, range summaries, saved views, page layout, live feeds, limits and defaults, and the host integration API.
- [Styling](https://github.com/vitaliiznak/granum-grid/blob/main/STYLING.md): themes, CSS hooks, the dataset map, custom controls, and headless layouts.
- [Scope and current limits](https://github.com/vitaliiznak/granum-grid/blob/main/README.md#scope-and-current-limits) and the [documentation home](https://github.com/vitaliiznak/granum-grid/blob/main/docs/README.md).
- [Live demo](https://vitaliiznak.github.io/granum-grid/) and [tutorial wiki](https://github.com/vitaliiznak/granum-grid/wiki).

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE).

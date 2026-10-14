# Granum Grid

A React + TypeScript explorer for very large indexed datasets. A floating row address drives a bounded viewport, avoiding browser element-height limits. A dataset map shows the shape of the data, chapters, events, and your position.

It is a reading surface, not a spreadsheet. There is no column model, sorting, filtering, editing, bookmark store, or range comparison: ordering belongs to your server, and app features belong to your app. The [playground](https://vitaliiznak.github.io/granum-grid/) builds bookmarks, range comparison, and selection summaries on this API in [`demo/src/explorer`](https://github.com/vitaliiznak/granum-grid/tree/main/demo/src/explorer).

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

## The API in four ideas

1. **A provider describes the data.** `{ id, revision, rowCount, fetchRows }` is enough; optional methods add the overview, markers, chapters, and search. `createArrayProvider` and `createCursorProvider` build one from an array or a cursor-paged server.
2. **The component needs three props.** `provider`, `ariaLabel`, and `renderRow`. Everything else has a default.
3. **Each explorer region follows one rule.** `toolbar`, `rail`, and `footer` take `false` to hide the region, an options object to configure it, or a function that renders your own. `panel`, between the toolbar and the rows, is empty until you fill it:

   ```tsx
   <GranumGrid
     provider={provider}
     ariaLabel="Logs"
     renderRow={renderRow}
     toolbar={{ actions: <ExportButton /> }} // configure the built-in toolbar
     rail={{ variant: 'markers', layout: 'compact' }} // configure the dataset map
     panel={<SavedFilters />} // your own controls above the rows
     footer={({ snapshot }) => <MyStatus rows={snapshot.rowCount} />} // replace
   />
   ```

4. **One handle acts on the mounted explorer.** `apiRef` on the component and `api` on the hook hold the same `GranumGridApi`: `goTo`, `scrollToIndex`, `back`/`forward`, marker and chapter steps, `getSelection`/`setSelection`, `getVisibleRange`, `getView`/`restoreView`, `openSearch`, `retry`, plus `getSnapshot`, `subscribe`, and `onNavigate` for continuous state. Pass a decoded view back as `initialView` to reopen a shared place.

```tsx
function Readings() {
  const api = useRef<GranumGridApi<Reading>>(null);
  return (
    <>
      <button onClick={() => api.current?.goTo(73_499_999)}>Row 73.5M</button>
      <GranumGrid apiRef={api} provider={provider} ariaLabel="Readings" renderRow={renderRow} />
    </>
  );
}
```

### Props at a glance

`useGranumGrid` takes the Data, Events, and Behavior options, the place and selection options except `apiRef`, `rowHeight`, `dynamicRowHeight`, and `overscan`, plus `onOpenSearch` for your own search UI.

| Group               | `GranumGrid` props                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Required            | `provider`, `ariaLabel`, `renderRow`                                                                    |
| Rows                | `rowHeight`, `dynamicRowHeight`, `overscan`, `getRowKey`, `renderPlaceholder`, `header`, `emptyContent` |
| Data                | `dataMode` (`snapshot`, `append`, `follow`), `cache`                                                    |
| Place and selection | `apiRef`, `initialIndex`, `initialView`, `selection`, `onSelectionChange`, `markers`                    |
| Events              | `onNavigate`, `onRowActivate`, `onStats`                                                                |
| Regions             | `toolbar`, `panel`, `rail`, `footer`, `stickyChapters`                                                  |
| Behavior            | `layout` (`embedded`, `page`), `features`, `reducedMotion`                                              |
| Appearance          | `theme`, `unstyled`, `className`, `style`, `classNames`, `styles`                                       |

## Layers

Stop at the layer that fits. Each one is built from the layer below it, and the demo uses only these public entries.

| Layer                                         | Import                                 | You own                                                                                                       |
| --------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GranumGrid`                                  | `granum-grid`                          | Row content, theme, and which regions to configure, hide, or replace                                          |
| Widgets: `AtlasRail`, `JumpBar`, `ViewCanvas` | `granum-grid`                          | Layout, and the explorer state they share as props: search open and query, map highlights, map selection mode |
| `useGranumGrid`                               | `granum-grid/headless`                 | All markup. The hook supplies rows, navigation, selection, input, and ARIA props                              |
| Engine and data session                       | `granum-grid/core`, `granum-grid/data` | Rendering and input, without React                                                                            |

Widgets take the hook's result as `grid`: `<AtlasRail grid={grid} />` accepts the same options as the component's `rail` prop, and `<ViewCanvas grid={grid} />` draws the overview behind your rows while `traveling`. The hook holds no dialog, search, bookmark, or map-mode state. Pass your own places with its `markers` option, and an `onOpenSearch` handler for `/`, Ctrl/Cmd+K, and `api.openSearch(query)`; without the handler those do nothing, and the keys stay with the browser. The hook's state carries rows, prop getters, the handle, and display state (`snapshot`, `selection`, `markers`, the current `chapter`, `traveling`, `edgeOffset`, `stats`); its data session and coordinate mapping stay internal.

## Entry points

| Entry                    | Surface                                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `granum-grid`            | `GranumGrid`, `useGranumGrid`, `AtlasRail`, `JumpBar`, `ViewCanvas`, `createArrayProvider`, `createCursorProvider`, `encodeView`, `decodeView`, `defaultFeatures`, and public types                                           |
| `granum-grid/headless`   | `useGranumGrid`, `defaultFeatures`, and the hook, handle, provider, and navigation types; no components or CSS                                                                                                                |
| `granum-grid/core`       | Framework-independent engine (`createEngine`), coordinate mappings, saved-view encoding and validation (`readView`), and `validRange`                                                                                        |
| `granum-grid/data`       | Provider types, `PageCache`, `DataSession`, `rangeProvider`, `createArrayProvider`, `createCursorProvider`, `checkBuckets`, and the cursor helpers `acceptCursorWindow` and `cursorWindowIssue`                              |
| `granum-grid/base.css`   | Structural layout only                                                                                                                                                                                                        |
| `granum-grid/styles.css` | Optional skin and `--ds-*` theme variables; includes base layout                                                                                                                                                              |

The package test pins the runtime exports of `granum-grid` and `granum-grid/headless`, so widening either is a deliberate change.

## Browser support

Chrome and Edge 100+, Firefox 104+, and Safari/iOS Safari 15.4+. This is the floor the code needs (for example `Array.prototype.findLast`, `AbortSignal.throwIfAborted`, `<dialog>`, and CSS cascade layers); it is declared as `browserslist` in `package.json`, and `npm run lint` checks JavaScript and Web APIs against it. Browsers without cascade layers ignore the stylesheets entirely, so there is no partial-layout fallback. The optional skin in `styles.css` tints some borders and highlights with `color-mix()` (Chrome 111, Firefox 113, Safari 16.2); earlier browsers show them untinted. Dynamic viewport units fall back to `vh`.

- Ctrl+wheel and trackpad pinch retain browser page zoom.
- A wheel gesture that starts by pushing past either end of the dataset scrolls the page, as a native scroller does; one that starts by moving rows keeps them to its end. Set `overscroll-behavior: contain` on the viewport to keep every wheel gesture in the rows. Sideways wheels pass through to wide content.
- On touch screens the viewport captures vertical swipes to pan rows (`touch-action: pan-x pinch-zoom`). A swipe that reaches either end of the dataset does not continue into the page. Leave page area outside an embedded explorer on phones, or use `layout="page"`.

## Documentation

- [Quick start](https://github.com/vitaliiznak/granum-grid/blob/main/docs/QUICK_START.md): install, first explorer, array and HTTP providers, custom controls.
- [Integration guide](https://github.com/vitaliiznak/granum-grid/blob/main/docs/GUIDE.md): provider rules, server-owned ordering, search, dynamic heights, selection and host tools, saved views, page layout, live feeds, limits and defaults, and the host integration API.
- [Styling](https://github.com/vitaliiznak/granum-grid/blob/main/STYLING.md): themes, CSS hooks, the dataset map, custom controls, and headless layouts.
- [Scope and current limits](https://github.com/vitaliiznak/granum-grid/blob/main/README.md#scope-and-current-limits) and the [documentation home](https://github.com/vitaliiznak/granum-grid/blob/main/docs/README.md).
- [Live demo](https://vitaliiznak.github.io/granum-grid/) and [tutorial wiki](https://github.com/vitaliiznak/granum-grid/wiki).

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](https://github.com/vitaliiznak/granum-grid/blob/main/LICENSE).

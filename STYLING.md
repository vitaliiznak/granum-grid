# Styling and composition

Granum Grid has no styling-framework dependency and imports no CSS from JavaScript. Import `granum-grid/styles.css` for the default skin and theme tokens, `granum-grid/base.css` to supply your own colors, type, spacing, controls, and borders, or no CSS with the headless hook. The [layer table](granum-grid/README.md#layers) shows what each layer leaves to you.

The `unstyled` prop also disables the default skin on one instance when another instance on the same page uses `styles.css`. Structural layout is preserved.

## Theme the default component

```tsx
import { GranumGrid } from 'granum-grid';
import 'granum-grid/styles.css';
import './explorer.css';

<GranumGrid
  className="my-explorer"
  provider={provider}
  ariaLabel="Readings"
  renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
/>;
```

```css
.my-explorer {
  height: 480px;
  --ds-bg: var(--surface);
  --ds-panel: var(--surface-subtle);
  --ds-text: var(--foreground);
  --ds-muted: var(--foreground-muted);
  --ds-line: var(--border);
  --ds-accent: #536aa1;
  --ds-hover: #edf0f7;
  --ds-mark: #986421;
  --ds-radius: 4px;
  --ds-rail-width: 232px;
  --ds-rail-width-mobile: 92px;
  --ds-rail-width-compact: 92px;
}
```

Define the host variables used above, or replace them with colors. Typography inherits from the host. The component's `theme` accepts `light`, `dark`, and `system`; the default is `system`. Your overrides take precedence over the built-in light/dark palette. The travel overview uses `--ds-accent` and `--ds-muted`, falling back to inherited text color without the skin.

Both stylesheets use the `granum-grid` cascade layer and zero-specificity `:where()` selectors. Normal unlayered application CSS overrides them regardless of import order. For a framework that also uses cascade layers, declare the order before either stylesheet so its utilities come last; for example:

```css
@layer granum-grid, theme, base, components, utilities;
@import 'granum-grid/base.css';
/* Import your framework and application styles after declaring the order. */
```

No `!important` is needed. The default skin targets only library-owned `.ds-button` and `.ds-input` controls. It does not reset buttons, inputs, links, or selects rendered by your application.

## Style individual parts

Use CSS Modules, utility class strings, ordinary classes, or inline styles:

```tsx
<GranumGrid
  provider={provider}
  ariaLabel="Readings"
  className={styles.explorer}
  classNames={{
    toolbar: styles.toolbar,
    row: 'flex items-center gap-4 px-4 border-b',
    rail: styles.rail,
  }}
  styles={{ footer: { fontSize: 12 }, row: { paddingInline: 16 } }}
  renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
/>
```

`classNames` and `styles` accept `toolbar`, `header`, `body`, `viewport`, `row`, `rail`, `footer`, and `jump`. Types are exported as `GranumGridPart` and `GranumGridAppearance`. The corresponding elements have stable `data-ds-part` attributes. Rows expose `data-focused` and `data-status="ready|loading|error"`. The root exposes `data-theme`, `data-motion`, and `data-unstyled`.

The virtualizer owns row position, transform, height, minimum height, and border-box sizing. These are inline geometry styles; style the row's content instead of overriding them. Enable `dynamicRowHeight` for content-driven heights and put padding inside rows. Always give the explorer or headless viewport a bounded height.

## Configure the dataset map

The map runs top to bottom in **row order**. Each horizontal strip represents a provider-supplied group of rows; its width shows the mean value, or count divided by group size for density metrics. Optional shading shows the group's min–max range. The horizontal scale uses `provider.metric.domain` and `unit`; when no domain is supplied, it comes from the overview (density defaults to 0–1). Missing summaries remain blank.

Chapter labels come from `fetchChapters`. They represent time only when your provider orders rows by time and supplies date chapters. Event diamonds come from `fetchMarkers` and search results. A separate track at the far right holds the scroll handle; a dashed line marks the current row within the chart. The small fixed-size handle is a navigation target, **not the proportion of rows visible**. The plot, events, and scrollbar occupy separate columns in expanded and compact layouts.

```tsx
<GranumGrid
  provider={provider}
  ariaLabel="Readings"
  rail={{
    title: 'Scrollbar',
    variant: 'profile',
    axis: 'chapters',
    axisLabel: 'Year', // For this provider's date chapters.
    showRange: false,
    showMarkers: true,
    showVisibleRange: true,
    showTrail: false,
    showLegend: true,
    markerLabels: 'label',
    layout: 'auto',
    maxAxisTicks: 5,
    preview: 'summary', // No exact-row fetches on hover.
    previewRows: 3, // Used when preview is 'rows'.
    showMagnifier: true,
    snapToMarkers: false,
    formatValue: (value) => value.toFixed(1),
    actions: <MapSettingsButton />, // Your controls beside the map title.
  }}
  renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
/>
```

| `AtlasRailOptions` | Choices and default                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `variant`          | `profile` (default) or `markers` for navigation without the value chart                                                                                                                          |
| `axis`             | `chapters` (default, falls back to rows) or `rows`                                                                                                                                               |
| `axisLabel`        | Optional axis caption; otherwise Position or Row                                                                                                                                                 |
| `title`            | Expanded heading; defaults to Scrollbar                                                                                                                                                          |
| `showRange`        | Min–max shading for value metrics; defaults to false                                                                                                                                             |
| `showTracks`       | Offer additional provider metrics in a chart selector; defaults to false. One chart is shown at a time, using that metric's own scale and units.                                                 |
| `showMarkers`      | Event and search markers; defaults to true. Hidden events do not attract map drags.                                                                                                              |
| `showVisibleRange` | Shading for the rows currently in view; defaults to true                                                                                                                                         |
| `showTrail`        | Previously visited positions; defaults to true                                                                                                                                                   |
| `showLegend`       | Profile accuracy and marker legend; defaults to true                                                                                                                                             |
| `markerLabels`     | `label` (default), `number`, or `none` (symbols only)                                                                                                                                            |
| `layout`           | `auto` (compact below 650 px), `expanded`, or `compact`                                                                                                                                          |
| `maxAxisTicks`     | Maximum axis labels; default 5, clamped to 2–12 and available height                                                                                                                             |
| `preview`          | `rows` (default, summary plus exact rows), `summary` (no row requests), or `none`. Drag position feedback remains available.                                                                     |
| `previewRows`      | Exact rows per hover preview; default 3, clamped to 1–5 and remaining rows                                                                                                                       |
| `showMagnifier`    | Local profile crop in hover details; defaults to false. Reuses the overview buckets. Requires a profile and hover details.                                                                       |
| `precision`        | Slow scrubbing while the pointer moves sideways during a drag (½, ¼, then 1/20 speed); defaults to true.                                                                                         |
| `snapToMarkers`    | Snap slow map drags to visible provider events; defaults to true. Shift temporarily bypasses snapping.                                                                                           |
| `snapToPeaks`      | Gently attract hover previews, clicks, and slow full-speed drags to nearby visible chart peaks; defaults to true. Shift bypasses attraction. Does not affect range selection or precision drags. |
| `formatValue`      | Display formatter for the primary metric's scale and group details, including any desired unit. Additional metrics use their own `metric.unit`.                                                  |
| `actions`          | Your controls beside the map title and help button                                                                                                                                               |

Peak attraction uses the selected chart's existing overview groups, never a scan of individual rows. It ignores missing groups and small ripples, gently pulls within 10 screen pixels, and settles on the peak group's midpoint within 3 pixels. Hovering shows the target without navigating; clicking uses that target. Visible provider events take priority during a drag. Set `snapToMarkers: false` and `snapToPeaks: false` to disable both event snapping and peak attraction.

Expanded layout labels the chart, row-order axis, value direction, markers, and current-row handle. With `showTracks`, choose a metric using **Chart**; changing the chart updates its scale, accuracy, range shading, and hover summary without moving the current row or changing navigation history. Providers should return only additional metrics from `fetchOverviewTracks`, without repeating the primary metric. Short rails collapse explanatory text and the legend into the help button to preserve plot height.

Compact layout shows numbers instead of marker names (a marker's place in row order; a group shows its named marker's place and a +N count), hides the chart selector, and keeps the selected chart and its explanation available through the question-mark button and hover details. The scrollbar column runs the full height of the table. Help and host controls sit in one compact group over the chart and leave the marker gutter and scroll column clear. The metric name stays in the legend and in the help note. Navigation targets retain their accessible names in every layout. Configure width with the three `--ds-rail-width*` tokens above. The axis and marker gutters can be adjusted with `--ds-map-axis-width` and `--ds-map-events-width` on the rail.

These options are the only switches for map layers; the hook's `features` cover motion and data, not the map. Hiding a layer does not disable provider metadata loading. The current-row handle and explicit range selection stay visible independently of these layer options.

For composition, pass the same options straight to the widget: `<AtlasRail grid={grid} {...mapOptions} />`. The rail is controlled: `highlights` draws extra places such as search results, and `selecting` with `onSelectingChange` turns a drag into a range selection; on the component, pass them as `rail` options from your own "Select rows" control. Configuration changes preserve the current row and history. `rail={false}` hides the map; a function as `rail`, or the headless hook, replaces it entirely.

## Use your React controls

Every explorer region is one prop with one rule: `false` hides it, an options object configures the built-in part, and a function renders your own. `toolbar`, `rail`, and `footer` accept functions, which receive the hook state (`GranumGridState<Row>`) with its `api` handle. `panel` has no built-in part: it holds your own content between the toolbar and the rows, such as selection or bookmark tools.

| Region    | Options object                          | Function                                    |
| --------- | --------------------------------------- | ------------------------------------------- |
| `toolbar` | `{ actions, fullPageUrl }`              | `(grid) => ReactNode`                       |
| `panel`   | Your element                            | `(grid) => ReactNode`, called every frame   |
| `rail`    | `AtlasRailOptions`, including `actions` | `(grid, rail: AtlasRailProps) => ReactNode` |
| `footer`  | —                                       | `(grid) => ReactNode`                       |

Open the built-in search dialog with `api.openSearch()`. A `rail` function also receives the built-in map's props as a second argument; spread them to wrap or adjust the map while keeping search highlights and map selection: `rail={(_, rail) => <AtlasRail {...rail} layout="expanded" />}`. The example `Button` below is your application's component; it can come from a React UI library or wrap a native button.

```tsx
import 'granum-grid/base.css';

<GranumGrid
  unstyled
  provider={provider}
  ariaLabel="Readings"
  className={styles.explorer}
  classNames={{ row: styles.row }}
  toolbar={({ api, snapshot, chapter }) => (
    <div className={styles.toolbar}>
      <Button disabled={!snapshot.canGoBack} onClick={() => api.back()}>
        Back
      </Button>
      <Button onClick={() => api.openSearch()}>Find a row</Button>
      <span>{chapter?.label}</span>
    </div>
  )}
  footer={({ snapshot }) => (
    <output>
      {snapshot.rowCount ? (snapshot.activeIndex ?? 0) + 1 : 0} / {snapshot.rowCount}
    </output>
  )}
  rail={false}
  renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
/>;
```

Replacement renderers own their wrapper styling and accessibility; the replaced part's `classNames`/`styles` no longer apply. To keep the built-in toolbar and add your own controls to it, pass `toolbar={{ actions: <MyButtons /> }}`. `header`, `renderRow`, `renderPlaceholder(slot, retry)`, and `emptyContent` remain content slots. Use `styles={{ header: { display: 'none' } }}` to omit the default legend. For complete markup control, use the hook.

## Build a headless list

```tsx
import { useGranumGrid, type DataProvider } from 'granum-grid/headless';

function ReadingList({ provider }: { provider: DataProvider<{ value: number }> }) {
  const grid = useGranumGrid({
    provider,
    rowHeight: 48,
    // Rows only: no animated flights and no overview during fast flings.
    features: { automaticAggregation: false, flight: false },
  });

  return (
    <section>
      <button onClick={() => grid.api.scrollToIndex(4999, { align: 'start' })}>
        Go to row 5,000
      </button>
      <div
        {...grid.getViewportProps({
          'aria-label': 'Readings',
          className: 'my-list',
          style: { height: 320 },
        })}
      >
        {grid.rows.map((slot) => (
          <div
            key={slot.index}
            {...grid.getRowProps(slot, {
              className: 'my-row',
              style: { padding: 12 },
            })}
          >
            <span role="gridcell">
              {slot.status === 'ready' ? slot.row.value : slot.error ? 'Unavailable' : 'Loading…'}
            </span>
          </div>
        ))}
      </div>
      <div {...grid.getAnnouncementProps()} />
    </section>
  );
}
```

No stylesheet is required for positioning, clipping, touch navigation, or visually hidden announcements. Prop getters merge your classes, styles, and handlers while retaining the internal viewport ref, row measurement ref, ARIA addresses, and row geometry. The viewport click/key handlers call yours first and respect `preventDefault()`.

`grid.rows` holds only the bounded visible slots. Each slot is `ready` with a `row`, or `loading`/`error` with an optional aggregate `estimate`; error slots carry an `error` message. Placeholder estimates are never presented as `Row` values.

Headless mode gives you the navigation state; render empty/error/retry UI (`grid.api.retry()` requests failed pages again), focus styles, and any navigation controls you need. `granum-grid/headless` loads no explorer components. `AtlasRail`, `JumpBar`, and `ViewCanvas` are exported from `granum-grid` for composition. Each takes the hook's result as `grid`, and you hold the state they share:

```tsx
import { useState } from 'react';
import { AtlasRail, JumpBar, useGranumGrid, type DataProvider, type Marker } from 'granum-grid';

function Explorer({ provider }: { provider: DataProvider<{ value: number }> }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlights, setHighlights] = useState<Marker[]>([]);
  const [selecting, setSelecting] = useState(false);
  const grid = useGranumGrid({ provider, onOpenSearch: () => setSearchOpen(true) });
  return (
    <>
      {/* viewport and rows as above, with <ViewCanvas grid={grid} /> inside the viewport */}
      <AtlasRail
        grid={grid}
        highlights={highlights}
        selecting={selecting}
        onSelectingChange={setSelecting}
      />
      <JumpBar
        grid={grid}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onHighlightsChange={setHighlights}
      />
    </>
  );
}
```

`onOpenSearch` receives the query from `api.openSearch(query)`; pass `query` and `onQueryChange` to `JumpBar` to prefill it. The [layer table](granum-grid/README.md#layers) says what happens without the handler. Add your own places, such as saved bookmarks, with the hook's `markers` option: they join N/P navigation, marker snapping, and named search. Keep that array stable between renders. These visual primitives require `base.css` plus your styling, or a `.ds-root` wrapper and `styles.css` for the default skin. `AtlasRail` reuses the hook's engine and cache rather than creating its own; its hover preview shows up to three scalar fields per row unless you pass `renderPreviewRow(row, index)`. Render `ViewCanvas` alongside rows to show overview context while `grid.traveling`. Translate your own row wrapper by `grid.edgeOffset` if you want elastic edge feedback. The built-in viewport also marks the empty space below the last row as the end of the dataset.

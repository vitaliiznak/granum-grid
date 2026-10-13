# Styling and composition

DeepScroll has no styling-framework dependency and imports no CSS from JavaScript. Choose the amount of UI you want to keep.

| Approach | Import | What you own |
| --- | --- | --- |
| Default component | `deepscroll/styles.css` | Theme tokens, row content, optional part overrides |
| Component with your styling | `deepscroll/base.css` | Colors, type, spacing, controls, borders |
| Headless hook | No CSS import | All markup and presentation |

The demo's **Use it in your app** section has live examples of all three approaches. The `unstyled` prop also disables the default skin on one instance when another instance on the same page uses `styles.css`. Structural layout is preserved.

## Theme the default component

```tsx
import { DeepScroll } from 'deepscroll';
import 'deepscroll/styles.css';
import './explorer.css';

<DeepScroll
  className="my-explorer"
  provider={provider}
  ariaLabel="Readings"
  renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
/>
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
  --ds-rail-width-mobile: 72px;
  --ds-rail-width-compact: 76px;
}
```

Define the host variables used above, or replace them with colors. Typography inherits from the host. The component's `theme` accepts `light`, `dark`, and `system`; the default is `system`. Your overrides take precedence over the built-in light/dark palette. Canvas summaries use `--ds-accent` and `--ds-muted`, falling back to inherited text color without the skin.

Both stylesheets use the `deepscroll` cascade layer and zero-specificity `:where()` selectors. Normal unlayered application CSS overrides them regardless of import order. For a framework that also uses cascade layers, declare the order before either stylesheet so its utilities come last; for example:

```css
@layer deepscroll, theme, base, components, utilities;
@import 'deepscroll/base.css';
/* Import your framework and application styles after declaring the order. */
```

No `!important` is needed. The default skin targets only library-owned `.ds-button` and `.ds-input` controls. It does not reset buttons, inputs, links, or selects rendered by your application.

## Style individual parts

Use CSS Modules, utility class strings, ordinary classes, or inline styles:

```tsx
<DeepScroll
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

`classNames` and `styles` accept `toolbar`, `header`, `scale`, `body`, `viewport`, `row`, `rail`, `footer`, `jump`, and `hint`. Types are exported as `DeepScrollPart` and `DeepScrollAppearance`. The corresponding elements have stable `data-ds-part` attributes. Rows expose `data-focused` and `data-status="ready|loading|error"`. The root exposes `data-view`, `data-theme`, `data-motion`, and `data-unstyled`.

The virtualizer owns row position, transform, height, minimum height, and border-box sizing. These are inline geometry styles; style the row's content instead of overriding them. Enable `dynamicRowHeight` for content-driven heights and put padding inside rows. Always give the explorer or headless viewport a bounded height.

## Configure the dataset map

The map runs top to bottom in **row order**. Each horizontal strip represents a provider-supplied group of rows; its width shows the mean value, or count divided by group size for density metrics. Optional shading shows the group's min–max range. The horizontal scale uses `provider.metric.domain` and `unit`; when no domain is supplied, it comes from the overview (density defaults to 0–1). Missing summaries remain blank.

Chapter labels come from `fetchChapters`. They represent time only when your provider orders rows by time and supplies date chapters. Event diamonds come from `fetchMarkers` and search results. The position line marks the current row; the small fixed-size handle is a navigation target, **not the proportion of rows visible**.

```tsx
<DeepScroll
  provider={provider}
  ariaLabel="Readings"
  atlas={{
    title: 'Dataset map',
    variant: 'profile',
    axis: 'chapters',
    axisLabel: 'Year', // For this provider's date chapters.
    showRange: false,
    markerLabels: 'label',
    layout: 'auto',
    formatValue: (value) => value.toFixed(1),
  }}
  renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
/>
```

| `AtlasRailOptions` | Choices and default |
| --- | --- |
| `variant` | `profile` (default) or `markers` for navigation without the value chart |
| `axis` | `chapters` (default, falls back to rows) or `rows` |
| `axisLabel` | Optional axis caption; otherwise Position or Row |
| `title` | Expanded heading; defaults to Dataset map |
| `showRange` | Min–max shading for value metrics; defaults to false |
| `markerLabels` | `label` (default), `number`, or `none` (symbols only) |
| `layout` | `auto` (compact below 650 px), `expanded`, or `compact` |
| `formatValue` | Number formatter for the scale and group details |

Compact layout shows marker numbers instead of names and keeps the explanation available through the question-mark button. Navigation targets retain their accessible names in every layout. Configure width with the three `--ds-rail-width*` tokens above. The axis and event gutters can be adjusted with `--ds-map-axis-width` and `--ds-map-events-width` on the rail.

For composition, pass the same configuration as `<AtlasRail scroll={scroll} options={atlas} />`. Presentation changes preserve the current row and history. The demo's **Map settings** menu controls these options with ordinary React state; the library does not require that menu or any particular UI framework. Use `renderRail` or the headless hook to replace the map entirely.

## Use your React controls

`renderToolbar`, `renderFooter`, and `renderRail` receive the full `DeepScrollState<Row>`. Return your own component or `null` to omit a region. The example `Button` below is your application's component; it can come from a React UI library or wrap a native button.

```tsx
import 'deepscroll/base.css';

<DeepScroll
  unstyled
  provider={provider}
  ariaLabel="Readings"
  className={styles.explorer}
  classNames={{ row: styles.row }}
  renderToolbar={({ controller, snapshot, setJumpOpen }) => (
    <div className={styles.toolbar}>
      <Button disabled={!snapshot.canGoBack} onClick={() => controller.back()}>
        Back
      </Button>
      <Button onClick={() => setJumpOpen(true)}>Find a row</Button>
    </div>
  )}
  renderFooter={({ snapshot }) => (
    <output>{snapshot.rowCount ? (snapshot.activeIndex ?? 0) + 1 : 0} / {snapshot.rowCount}</output>
  )}
  renderRail={() => null}
  renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
/>
```

Replacement renderers own their wrapper styling and accessibility; the replaced part's `classNames`/`styles` no longer apply. `header`, `renderRow`, `renderPlaceholder`, and `emptyContent` remain content slots. Use `styles={{ header: { display: 'none' } }}` to omit the default legend. For complete markup control, use the hook.

## Build a headless list

```tsx
import { useDeepScroll, type DataProvider } from 'deepscroll';

function ReadingList({ provider }: { provider: DataProvider<{ value: number }> }) {
  const scroll = useDeepScroll({
    provider,
    rowHeight: 48,
    // This simple list renders exact rows only, without overview canvas bands.
    features: { automaticAggregation: false, flight: false },
  });

  return <section>
    <button onClick={() => scroll.controller.scrollToIndex(4999, { align: 'start' })}>
      Go to row 5,000
    </button>
    <div {...scroll.getViewportProps({
      'aria-label': 'Readings',
      className: 'my-list',
      style: { height: 320 },
    })}>
      {scroll.rows.map(slot => (
        <div key={slot.index} {...scroll.getRowProps(slot, {
          className: 'my-row',
          style: { padding: 12 },
        })}>
          <span role="gridcell">
            {slot.status === 'ready' ? slot.row.value : slot.error ? 'Unavailable' : 'Loading…'}
          </span>
        </div>
      ))}
    </div>
    <div {...scroll.getAnnouncementProps()} />
  </section>;
}
```

No stylesheet is required for positioning, clipping, touch navigation, or visually hidden announcements. Prop getters merge your classes, styles, and handlers while retaining the internal viewport ref, row measurement ref, ARIA addresses, and row geometry. The viewport click/key handlers call yours first and respect `preventDefault()`.

Headless mode gives you the navigation state; render empty/error/retry UI, focus styles, and any optional view controls you need. `AtlasRail`, `JumpBar`, and `ViewCanvas` are exported for composition. These visual primitives require `base.css` plus your styling, or a `.ds-root` wrapper and `styles.css` for the default skin. A headless layout that enables Lens/aggregate Zoom must render `ViewCanvas` as well as rows. Render `scroll.edgeOffset` on your own pan wrapper if you want elastic edge feedback.

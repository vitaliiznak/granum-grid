# 5. Compose your own explorer

[All lessons](README.md) · [Previous: HTTP](HTTP-recording.md) · [Next steps](Next-steps.md)

**Build:** the inventory from lesson 1 with your own toolbar and rows, the dataset map,
and the search dialog, without the ready-made `GranumGrid`.
**Run the finished lesson:** `/tutorials.html?lesson=compose` on your local demo server.

## 1. Choose a layer

`GranumGrid` is assembled from smaller public parts, and you can stop at any of its
[layers](../../packages/react/README.md#layers). This lesson uses the headless hook with the
`AtlasRail` and `JumpBar` widgets. The hook supplies rows, navigation, selection,
keyboard and pointer input, and ARIA props; you decide whether search is open and what
the map highlights. This lesson reuses `src/inventory.ts` from
[lesson 1](Inventory.md).

## 2. Assemble the explorer

Use this as `src/App.tsx`.

<!-- source: demo/src/tutorials/ComposeLesson.tsx -->
```tsx
import { useMemo, useState } from 'react';
import { AtlasRail, JumpBar, type Marker } from '@granum-grid/react';
import { useGranumGrid } from '@granum-grid/react/headless';
import { inventory } from './inventory';
import '@granum-grid/react/styles.css';

// The headless hook supplies rows, navigation, and input. This component owns the markup
// and the state the two widgets share: whether search is open and what it highlights.
export default function Compose() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlights, setHighlights] = useState<Marker[]>([]);
  // Your own places join N/P and the map. A kind of your own ranks like an event.
  const restock = useMemo<Marker[]>(
    () => [{ id: 'restock', index: 99, label: 'Restock SKU-100', kind: 'restock' }],
    [],
  );
  const grid = useGranumGrid({
    provider: inventory,
    rowHeight: 40,
    markers: restock,
    onOpenSearch: () => setSearchOpen(true),
  });
  const { snapshot } = grid;
  return (
    <section aria-label="Compose lesson">
      <p>The same 120 products, with your own toolbar and rows beside the dataset map.</p>
      <button
        onClick={(event) => {
          event.currentTarget.focus();
          grid.api.openSearch();
        }}
      >
        Search products
      </button>{' '}
      <button disabled={!snapshot.canGoBack} onClick={() => grid.api.back()}>
        Back
      </button>{' '}
      <output aria-label="Current row">
        Row {(snapshot.activeIndex ?? 0) + 1} of {snapshot.rowCount}
      </output>
      <div className="gr-root" data-gr-root="" style={{ height: 480, marginTop: 16 }}>
        <div className="gr-body">
          <div {...grid.getViewportProps({ 'aria-label': 'Composed inventory' })}>
            <div {...grid.getLayerProps()}>
              {grid.rows.map((slot) => (
                <div key={slot.index} {...grid.getRowProps(slot)}>
                  <span role="gridcell">
                    {slot.status === 'ready'
                      ? `${slot.index + 1}. ${slot.row.sku} · ${slot.row.name}`
                      : 'Loading…'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <AtlasRail grid={grid} highlights={highlights} />
        </div>
        <JumpBar
          grid={grid}
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onHighlightsChange={setHighlights}
        />
        <div {...grid.getAnnouncementProps()} />
      </div>
    </section>
  );
}
```

`onOpenSearch` is what `/`, Ctrl/Cmd+K, and `api.openSearch()` call. `JumpBar` reports the
places a query found through `onHighlightsChange`; passing them to `AtlasRail` draws
them on the map. The `restock` marker is yours: keep the array stable with `useMemo`,
and give it any `kind`. The map exposes the kind as `data-kind` for styling.

## 3. Check the result

1. The position reads **Row 1 of 120**, and the map shows one marker near the end.
2. Click a row to focus the list, then press **N**. The position becomes
   **Row 100 of 120**, with `SKU-100` at the top.
3. Click **Back** to return to row 1.
4. Click **Search products**, type `restock`, and choose **Restock SKU-100**.

## 4. Make it yours

**Exercise:** add a **Select on map** button. Hold `selecting` in state, pass
`selecting` and `onSelectingChange` to `AtlasRail`, and show `grid.selection` as a
row range after you drag on the map.

**Next: [Apply the library to another dataset](Next-steps.md).**

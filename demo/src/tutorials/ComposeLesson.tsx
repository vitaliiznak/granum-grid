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

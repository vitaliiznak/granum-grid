import { useRef } from 'react';
import { GranumGrid, type GranumGridApi } from '@granum/react';
import { inventory, type Product } from './inventory';
import '@granum/react/styles.css';

export default function Inventory() {
  const api = useRef<GranumGridApi<Product>>(null);
  return (
    <section aria-label="Inventory lesson">
      <p>120 generated products. Jump to SKU-060, then use Back to return.</p>
      <button onClick={() => api.current?.scrollToIndex(59, { align: 'start' })}>
        Find SKU-060
      </button>
      <GranumGrid
        provider={inventory}
        apiRef={api}
        ariaLabel="Inventory products"
        rowHeight={40}
        style={{ height: 560, marginTop: 16 }}
        rail={false}
        toolbar
        footer
        getRowKey={(row) => row.sku}
        renderRow={({ row, rowNumber }) => (
          <span role="gridcell">
            {rowNumber}. {row.sku} · {row.name} · {row.stock} in stock
          </span>
        )}
      />
    </section>
  );
}

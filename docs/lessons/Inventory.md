# 1. Build an inventory explorer

[All lessons](README.md) · [Setup](Setup.md) · [Next: Sensors](Sensors.md)

**Build:** a product list with your own row content and a button that jumps to a SKU.
**Run the finished lesson:** `/tutorials.html?lesson=inventory` on your local demo server.

## 1. Describe the data

These are generated teaching records, ordered by SKU. There are 120 products;
the application holds the whole array. For example:

| Visible row | SKU | Product | Stock |
| --- | --- | --- | --- |
| 1 | SKU-001 | Notebook | 0 |
| 2 | SKU-002 | Pencil | 7 |
| 60 | SKU-060 | Folder | 13 |

Create `src/inventory.ts`. `createArrayProvider` supplies the four required provider
members: `id`, `revision`, `rowCount`, and `fetchRows`. The module-level value stays
stable when React renders again.

<!-- source: demo/src/tutorials/inventory.ts -->
```ts
import { createArrayProvider } from '@granum/react';

export type Product = { sku: string; name: string; stock: number };

// Generated teaching data, already held in memory. Order is stable by SKU.
const products: Product[] = Array.from({ length: 120 }, (_, index) => ({
  sku: `SKU-${String(index + 1).padStart(3, '0')}`,
  name: ['Notebook', 'Pencil', 'Folder'][index % 3],
  stock: (index * 7) % 50,
}));

export const inventory = createArrayProvider(products, {
  id: 'tutorial-inventory',
  revision: '1',
});
```

This adapter copies only the requested slice. It does not infer stock summaries
or content search. Row and percentage jumps work immediately. An unavailable
overview label is expected for a provider that only supplies rows.

## 2. Render products and add a control

Use this as `src/App.tsx`. `renderRow` owns the displayed content. `apiRef` lets an
application button navigate without finding DOM nodes or simulating keyboard input.

<!-- source: demo/src/tutorials/InventoryLesson.tsx -->
```tsx
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
```

`scrollToIndex(59)` targets visible row 60. `align: 'start'` places it at the top.
`getRowKey` uses the SKU as the record identity. `rail={false}` hides the map because
this provider only supplies rows. `toolbar` adds Back, Forward, and **Go to…**, and
`footer` adds the current row. Without them the explorer shows only rows and the map.
The `toolbar`, `rail`, and `footer` regions follow one rule: `true` or an options object
shows the built-in region, `false` hides it, and a function renders your own.

## 3. Check the result

1. The initial position is **Row 1 of 120**.
2. Click **Find SKU-060**. The position becomes **Row 60 of 120**, and the row shows
   `SKU-060 · Folder · 13 in stock`.
3. Use **Back** to return to row 1.
4. Open **Go to…**, enter `90`, and press Enter. This is a user-facing row number,
   so it targets JavaScript index 89.

## 4. Make it yours

Replace the generated array with 120 actual products supplied by your application.
Keep the array immutable. If stock values or ordering change, create a new array
and update `revision`. When data arrives through props, memoize the provider by
that array and revision; the [array recipe](../QUICK_START.md#use-your-own-array)
shows the full pattern.

**Exercise:** add a button for SKU-090. Use index `89`; verify that Back still works.
A business key is not always its row index. For filtered or differently sorted
products, your application must resolve the SKU to its address in that snapshot.

**Next: [Add a sensor map and summaries](Sensors.md).**

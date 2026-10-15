import { createArrayProvider } from '@granum-grid/react';

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

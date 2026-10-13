import { DeepScroll, type DataProvider } from 'deepscroll';
import { createEngine } from 'deepscroll/core';
import { PageCache } from 'deepscroll/data';
const provider: DataProvider<{ value: number }> = {
  id: 'consumer',
  revision: '1',
  rowCount: 100_000_000,
  async fetchRows(start, count, signal) {
    signal.throwIfAborted();
    return Array.from({ length: count }, (_, i) => ({ value: start + i }));
  },
};
export const example = (
  <DeepScroll
    provider={provider}
    ariaLabel="Consumer fixture"
    renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
  />
);
export const engine = createEngine({ rowCount: provider.rowCount });
export const cache = new PageCache<{ value: number }>();

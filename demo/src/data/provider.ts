import type { DataProvider } from 'deepscroll';
import { rowAt, ROW_COUNT, type Reading } from './signal';
export const provider: DataProvider<Reading> = {
  id: 'signal-observatory', revision: '1', rowCount: ROW_COUNT,
  metric: { label: 'Signal amplitude', unit: 'mV', kind: 'value', domain: [0, 180] },
  async fetchRows(start, count, signal) { signal.throwIfAborted(); return Array.from({ length: count }, (_, i) => rowAt(start + i)); },
};

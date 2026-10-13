import type { DataProvider } from '../data/types.js';
import type { DeepScrollEngine } from './engine.js';

/** Public integration surface for a mounted table. The host owns automation policy. */
export interface DeepScrollApi<Row> {
  readonly provider: DataProvider<Row>;
  readonly controller: DeepScrollEngine;
}

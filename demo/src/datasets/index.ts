import { genome } from './genome';
import { logs } from './logs';
import { market } from './market';
import { signal } from './signal';
import { stars } from './stars';
import type { DemoDataset } from './types';

export const datasets: DemoDataset[] = [logs, signal, genome, market, stars];
export const findDataset = (id: string | null) =>
  datasets.find((dataset) => dataset.id === id) ?? logs;
export type { DemoDataset, RowExtras, TourContext } from './types';

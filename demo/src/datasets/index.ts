import { bitcoin } from './bitcoin';
import { genome } from './genome';
import { logs } from './logs';
import { market } from './market';
import { signal } from './signal';
import { stars } from './stars';
import { performance } from './performance';
import type { DemoDataset } from './types';

export const datasets: DemoDataset[] = [logs, signal, genome, market, bitcoin, stars, performance];
export const findDataset = (id: string | null) =>
  datasets.find((dataset) => dataset.id === id) ?? logs;
export type { DemoDataset, TourContext } from './types';

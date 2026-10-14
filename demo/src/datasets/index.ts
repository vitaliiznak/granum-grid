import { hackernews } from './hackernews';
import { logs } from './logs';
import { signal } from './signal';
import { parquet } from './parquet';
import { fileStart } from './sql';
import type { DemoDataset } from './types';

const datasets: DemoDataset[] = [fileStart, parquet, hackernews, logs, signal];
/** Datasets read from a real source first, then the generated ones. */
export const datasetGroups = (['real', 'synthetic'] as const).map((origin) => ({
  origin,
  label: origin === 'synthetic' ? 'Synthetic' : 'Real',
  datasets: datasets.filter((dataset) => dataset.origin === origin),
}));
export const findDataset = (id: string | null) =>
  datasets.find((dataset) => dataset.id === id) ?? logs;
export type { DemoDataset } from './types';

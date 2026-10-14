import { bitcoin } from './bitcoin';
import { genome } from './genome';
import { hackernews } from './hackernews';
import { logs } from './logs';
import { market } from './market';
import { signal } from './signal';
import { stars } from './stars';
import { performance } from './performance';
import { parquet } from './parquet';
import type { DemoDataset } from './types';

const datasets: DemoDataset[] = [
  parquet,
  bitcoin,
  hackernews,
  performance,
  logs,
  signal,
  genome,
  market,
  stars,
];
/** Datasets read from a real source first, then the generated ones. */
export const datasetGroups = (['real', 'synthetic'] as const).map((origin) => ({
  origin,
  label: origin === 'synthetic' ? 'Synthetic' : 'Real',
  datasets: datasets.filter((dataset) => dataset.origin === origin),
}));
export const findDataset = (id: string | null) =>
  datasets.find((dataset) => dataset.id === id) ?? logs;
export type { DemoDataset } from './types';

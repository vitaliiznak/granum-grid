import { bitcoin } from './bitcoin';
import { genome } from './genome';
import { hackernews } from './hackernews';
import { logs } from './logs';
import { market } from './market';
import { signal } from './signal';
import { stars } from './stars';
import { performance } from './performance';
import type { DemoDataset } from './types';

const datasets: DemoDataset[] = [
  logs,
  signal,
  genome,
  market,
  bitcoin,
  hackernews,
  stars,
  performance,
];
/** Generated datasets first, then the ones read from a real source. */
export const datasetGroups = (['synthetic', 'real'] as const).map((origin) => ({
  origin,
  label: origin === 'synthetic' ? 'Synthetic' : 'Real',
  datasets: datasets.filter((dataset) => dataset.origin === origin),
}));
export const findDataset = (id: string | null) =>
  datasets.find((dataset) => dataset.id === id) ?? logs;
export type { DemoDataset } from './types';

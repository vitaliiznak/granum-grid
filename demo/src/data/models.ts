import { ROW_COUNT, rowAt, valueAt } from './signal';
import { GENOME_LENGTH, gcAt, geneDensityAt, locate, repeatShareAt } from './genome';
import { TRADE_COUNT, priceAt, tradeAt, volatilityAt, volumeAt } from './market';
import { LOG_COUNT, errorRateAt, latencyAt, logAt } from './logs';
import { STAR_COUNT, densityAt, diskShareAt, planeDec, raAt, DENSITY_MAX } from './stars';

/** Worker-safe description of a synthetic dataset's sampled profiles. */
export interface Model {
  rowCount: number;
  value(index: number): number | null;
  label(index: number): string;
  tracks?: {
    id: string;
    label: string;
    domain: readonly [number, number];
    value(index: number): number | null;
  }[];
}
const hours = (index: number) => {
  const h = raAt(index);
  return `${String(Math.floor(h)).padStart(2, '0')}h ${String(Math.floor((h % 1) * 60)).padStart(2, '0')}m`;
};
export const models: Record<string, Model> = {
  signal: {
    rowCount: ROW_COUNT,
    value: (index) => valueAt(index),
    label: (index) => rowAt(index).timestamp.slice(0, 7),
  },
  genome: {
    rowCount: GENOME_LENGTH,
    value: gcAt,
    label: (index) => {
      const { chromosome, position } = locate(index);
      return `chr${chromosome.name}:${(position / 1e6).toFixed(1)} Mb`;
    },
    tracks: [
      { id: 'gc', label: 'GC content', domain: [30, 60], value: gcAt },
      { id: 'genes', label: 'Gene density', domain: [0, 100], value: geneDensityAt },
      { id: 'repeats', label: 'Repeats', domain: [20, 70], value: repeatShareAt },
    ],
  },
  market: {
    rowCount: TRADE_COUNT,
    value: priceAt,
    label: (index) => tradeAt(index).time.slice(0, 10),
    tracks: [
      { id: 'price', label: 'Price', domain: [0, 360], value: priceAt },
      { id: 'volume', label: 'Volume', domain: [0, 400], value: volumeAt },
      { id: 'volatility', label: 'Volatility', domain: [0, 40], value: volatilityAt },
    ],
  },
  logs: {
    rowCount: LOG_COUNT,
    value: errorRateAt,
    label: (index) => logAt(index).time.slice(5, 16).replace('T', ' '),
    tracks: [
      { id: 'errors', label: 'Error rate', domain: [0, 30], value: errorRateAt },
      { id: 'latency', label: 'p95 latency', domain: [0, 2600], value: latencyAt },
    ],
  },
  stars: {
    rowCount: STAR_COUNT,
    value: densityAt,
    label: hours,
    tracks: [
      { id: 'density', label: 'Sky density', domain: [0, DENSITY_MAX], value: densityAt },
      { id: 'disk', label: 'Milky Way share', domain: [0, 100], value: diskShareAt },
      {
        id: 'plane',
        label: 'Galactic plane dec',
        domain: [-63, 63],
        value: (i) => planeDec(raAt(i)),
      },
    ],
  },
};

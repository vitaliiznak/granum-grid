import { CHANNELS, ROW_COUNT, rowAt, valueAt } from './signal';
import { GENOME_LENGTH, gcAt, geneDensityAt, locate, repeatShareAt } from './genome';
import { TRADE_COUNT, priceAt, tradeAt, volatilityAt, volumeAt } from './market';
import { LOG_COUNT, errorRateAt, latencyAt, logAt } from './logs';
import { STAR_COUNT, densityAt, diskShareAt, planeDec, raAt } from './stars';

/** Worker-safe description of a synthetic dataset's sampled profiles. */
export interface Model {
  rowCount: number;
  value(index: number): number | null;
  label(index: number): string;
  tracks?: {
    id: string;
    label: string;
    unit?: string;
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
    value: valueAt,
    label: (index) => rowAt(index).timestamp.slice(0, 7),
    // Channels interleave by row; each track reads the nearest row from its channel.
    tracks: CHANNELS.map((label, channel) => ({
      id: label,
      label,
      unit: 'mV',
      domain: [0, 180] as const,
      value: (index: number) =>
        valueAt(Math.min(ROW_COUNT - 1, index + ((channel - (index % 4) + 4) % 4))),
    })),
  },
  genome: {
    rowCount: GENOME_LENGTH,
    value: gcAt,
    label: (index) => {
      const { chromosome, position } = locate(index);
      return `chr${chromosome.name}:${(position / 1e6).toFixed(1)} Mb`;
    },
    tracks: [
      { id: 'genes', label: 'Gene density', domain: [0, 100], value: geneDensityAt },
      { id: 'repeats', label: 'Repeats', unit: '%', domain: [20, 70], value: repeatShareAt },
    ],
  },
  market: {
    rowCount: TRADE_COUNT,
    value: priceAt,
    label: (index) => tradeAt(index).time.slice(0, 10),
    tracks: [
      { id: 'volume', label: 'Volume', domain: [0, 400], value: volumeAt },
      { id: 'volatility', label: 'Volatility', domain: [0, 40], value: volatilityAt },
    ],
  },
  logs: {
    rowCount: LOG_COUNT,
    value: errorRateAt,
    label: (index) => logAt(index).time.slice(5, 16).replace('T', ' '),
    tracks: [
      { id: 'latency', label: 'p95 latency', unit: 'ms', domain: [0, 2600], value: latencyAt },
    ],
  },
  stars: {
    rowCount: STAR_COUNT,
    value: densityAt,
    label: hours,
    tracks: [
      { id: 'disk', label: 'Milky Way share', unit: '%', domain: [0, 100], value: diskShareAt },
      {
        id: 'plane',
        label: 'Galactic plane dec',
        unit: '°',
        domain: [-63, 63],
        value: (i) => planeDec(raAt(i)),
      },
    ],
  },
};

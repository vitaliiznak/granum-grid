import { CHANNELS, ROW_COUNT, rowAt, valueAt } from './signal';
import { LOG_COUNT, errorRateAt, latencyAt, logAt } from './logs';

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
  logs: {
    rowCount: LOG_COUNT,
    value: errorRateAt,
    label: (index) => logAt(index).time.slice(5, 16).replace('T', ' '),
    tracks: [
      { id: 'latency', label: 'p95 latency', unit: 'ms', domain: [0, 2600], value: latencyAt },
    ],
  },
};

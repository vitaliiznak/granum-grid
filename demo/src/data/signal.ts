import { bump } from './noise';
import { timeline } from './timeline';

export const ROW_COUNT = 100_000_000;
export const SPIKES = [0.12, 0.345, 0.617, 0.843];
/** Rows of the four numbered spikes. */
export const SPIKE_ROWS = SPIKES.map((p) => Math.round(p * (ROW_COUNT - 1)));
/** Channels interleave by row: row `i` belongs to `CHANNELS[i % 4]`. */
export const CHANNELS = ['North', 'East', 'West', 'South'];
/** Readings span 2010 through 2029. */
export const signalTime = timeline(Date.UTC(2010, 0, 1), Date.UTC(2030, 0, 1), ROW_COUNT);
export interface Reading {
  timestamp: string;
  value: number;
  category: string;
  event: boolean;
}
export function valueAt(index: number) {
  const x = index / (ROW_COUNT - 1);
  const base = x < 0.25 ? 33 : x < 0.51 ? 63 : x < 0.76 ? 44 : 79;
  const waves = 8 * Math.sin(x * 91) + 4 * Math.cos(x * 217);
  const peaks = SPIKES.reduce((sum, p) => sum + 90 * bump(x, p, 0.006), 0);
  return Math.round((base + waves + peaks + 2 * Math.sin(index * 0.07)) * 10) / 10;
}
export function rowAt(index: number): Reading {
  return {
    timestamp: new Date(signalTime.timeAt(index)).toISOString(),
    value: valueAt(index),
    category: CHANNELS[index % 4],
    event: SPIKES.some((p) => Math.abs(index / (ROW_COUNT - 1) - p) < 0.006),
  };
}

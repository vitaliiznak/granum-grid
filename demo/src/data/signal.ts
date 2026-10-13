export const ROW_COUNT = 100_000_000;
export const START_TIME = Date.UTC(2010, 0, 1);
export const END_TIME = Date.UTC(2030, 0, 1);
export const SPIKES = [0.12, 0.345, 0.617, 0.843];
export interface Reading {
  timestamp: string;
  value: number;
  category: string;
  event: boolean;
}
export function valueAt(index: number, total = ROW_COUNT) {
  const x = index / Math.max(1, total - 1);
  const base = x < 0.25 ? 33 : x < 0.51 ? 63 : x < 0.76 ? 44 : 79;
  const waves = 8 * Math.sin(x * 91) + 4 * Math.cos(x * 217);
  const peaks = SPIKES.reduce((sum, p) => sum + 90 * Math.exp(-(((x - p) / 0.006) ** 2)), 0);
  return Math.round((base + waves + peaks + 2 * Math.sin(index * 0.07)) * 10) / 10;
}
export function rowAt(index: number, total = ROW_COUNT): Reading {
  return {
    timestamp: new Date(
      START_TIME + (index / Math.max(1, total - 1)) * (END_TIME - START_TIME - 1),
    ).toISOString(),
    value: valueAt(index, total),
    category: ['North', 'East', 'West', 'South'][index % 4],
    event: SPIKES.some((p) => Math.abs(index / Math.max(1, total - 1) - p) < 0.006),
  };
}

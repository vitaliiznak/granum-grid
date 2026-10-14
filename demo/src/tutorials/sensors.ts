import {
  createArrayProvider,
  type AggregateRequest,
  type Bucket,
  type DataProvider,
} from '@granum/react';

export type Reading = { minute: number; celsius: number };

// One generated day: 20 °C, with a known warm interval at minutes 720–739.
const readings: Reading[] = Array.from({ length: 1440 }, (_, minute) => ({
  minute,
  celsius: minute >= 720 && minute < 740 ? 40 : 20,
}));

async function summarize(
  { start, end, buckets }: AggregateRequest,
  signal: AbortSignal,
): Promise<Bucket[]> {
  signal.throwIfAborted();
  if (
    ![start, end, buckets].every(Number.isSafeInteger) ||
    start < 0 ||
    end > readings.length ||
    end <= start ||
    buckets < 1 ||
    buckets > 512
  )
    throw new RangeError('Expected a valid range and 1–512 buckets');
  const count = Math.min(buckets, end - start);
  return Array.from({ length: count }, (_, index) => {
    const from = start + Math.floor(((end - start) * index) / count);
    const to = start + Math.floor(((end - start) * (index + 1)) / count);
    let sum = 0,
      min = Infinity,
      max = -Infinity;
    // This lesson scans at most 1,440 readings, never a large remote dataset.
    for (let i = from; i < to; i++) {
      const value = readings[i].celsius;
      sum += value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return {
      start: from,
      end: to,
      count: to - from,
      avg: sum / (to - from),
      min,
      max,
      accuracy: 'exact',
    };
  });
}

export const sensors: DataProvider<Reading> = {
  ...createArrayProvider(readings, { id: 'tutorial-sensors', revision: '1' }),
  metric: { label: 'Temperature', unit: '°C', kind: 'value', domain: [0, 50] },
  fetchOverview: (buckets, signal) =>
    summarize({ start: 0, end: readings.length, buckets }, signal),
  fetchAggregates: summarize,
  async fetchMarkers(signal) {
    signal.throwIfAborted();
    return [{ id: 'warm', index: 720, label: 'Warm interval', kind: 'event' }];
  },
};

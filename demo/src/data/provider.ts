import type { DataProvider } from 'deepscroll';
import { rowAt, valueAt, ROW_COUNT, SPIKES, START_TIME, END_TIME, type Reading } from './signal';
import { aggregate } from './worker-client';
let latency = 80;
export const setLatency = (value: number) => {
  latency = value;
};
export function delay(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, latency);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export const provider: DataProvider<Reading> = {
  id: 'signal-observatory',
  revision: '1',
  rowCount: ROW_COUNT,
  metric: { label: 'Signal amplitude', unit: 'mV', kind: 'value', domain: [0, 180] },
  async search(query, context) {
    await delay(context.signal);
    if (query.kind === 'date') {
      const text =
        query.value.length === 4
          ? `${query.value}-01-01`
          : query.value.length === 7
            ? `${query.value}-01`
            : query.value;
      const time = Date.parse(`${text}T00:00:00Z`);
      if (!Number.isFinite(time) || time < START_TIME || time >= END_TIME)
        return { matches: [], complete: true };
      const index = Math.ceil(
        ((time - START_TIME) / (END_TIME - START_TIME - 1)) * (ROW_COUNT - 1),
      );
      return {
        matches: [{ id: `date-${text}`, index, label: query.value, kind: 'search' }],
        complete: true,
      };
    }
    if (!['value', 'category'].includes(query.field))
      throw new Error('Search supports value and category.');
    if (query.field === 'value' && typeof query.value !== 'number')
      throw new Error('value requires a number.');
    if (
      query.field === 'category' &&
      (typeof query.value !== 'string' || !['=', '!='].includes(query.operator))
    )
      throw new Error('Use category = "North" or category != "North".');
    const matches: import('deepscroll').Marker[] = [];
    for (let i = 0; i < 20_000 && matches.length < context.limit; i++) {
      if (i % 512 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        context.signal.throwIfAborted();
      }
      const index = (Math.floor(context.fromIndex) + i * 5000 + (i % 4)) % ROW_COUNT;
      const value =
        query.field === 'value' ? valueAt(index) : ['North', 'East', 'West', 'South'][index % 4];
      const target = query.value;
      const matchesQuery =
        query.operator === '>'
          ? value > target
          : query.operator === '>='
            ? value >= target
            : query.operator === '<'
              ? value < target
              : query.operator === '<='
                ? value <= target
                : query.operator === '='
                  ? value === target
                  : value !== target;
      if (matchesQuery)
        matches.push({
          id: `result-${index}`,
          index,
          label: `${query.field}: ${value}`,
          kind: 'search',
        });
    }
    return {
      matches,
      complete: false,
      message: 'Verified rows from a bounded sample; not an exhaustive search.',
    };
  },
  async fetchRows(start, count, signal) {
    await delay(signal);
    return Array.from({ length: count }, (_, i) => rowAt(start + i));
  },
  async fetchOverviewTracks(buckets, signal) {
    await delay(signal);
    return ['North', 'East', 'West', 'South'].map((label, channel) => ({
      id: label,
      label,
      metric: { label, kind: 'value' as const, domain: [0, 180] as const },
      buckets: Array.from({ length: buckets }, (_, i) => {
        const start = Math.floor((i * ROW_COUNT) / buckets),
          end = Math.floor(((i + 1) * ROW_COUNT) / buckets);
        const samples = Array.from({ length: 16 }, (_, j) => {
          const index = start + Math.floor((j * (end - start)) / 16);
          return valueAt(Math.min(end - 1, index + ((channel - (index % 4) + 4) % 4)));
        });
        return {
          start,
          end,
          count: null,
          avg: samples.reduce((a, b) => a + b, 0) / samples.length,
          min: Math.min(...samples),
          max: Math.max(...samples),
          accuracy: 'estimated' as const,
        };
      }),
    }));
  },
  async fetchOverview(buckets, signal) {
    await delay(signal);
    return aggregate('signal', { start: 0, end: ROW_COUNT, buckets }, signal);
  },
  async fetchAggregates(range, signal) {
    await delay(signal);
    return aggregate('signal', range, signal);
  },
  async fetchMarkers(signal) {
    await delay(signal);
    return SPIKES.map((p, i) => ({
      id: `spike-${i + 1}`,
      index: Math.round(p * (ROW_COUNT - 1)),
      label: `Spike ${i + 1}`,
      kind: 'spike',
    }));
  },
  async fetchChapters(signal) {
    await delay(signal);
    return Array.from({ length: 20 }, (_, i) => ({
      id: `year-${2010 + i}`,
      start: Math.ceil(
        ((Date.UTC(2010 + i, 0, 1) - START_TIME) / (END_TIME - START_TIME - 1)) * (ROW_COUNT - 1),
      ),
      end:
        i === 19
          ? ROW_COUNT
          : Math.ceil(
              ((Date.UTC(2011 + i, 0, 1) - START_TIME) / (END_TIME - START_TIME - 1)) *
                (ROW_COUNT - 1),
            ),
      label: `${2010 + i}`,
      breadcrumb: ['Signal archive', `${2010 + i}`],
    }));
  },
};

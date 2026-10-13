import type { DataProvider } from 'deepscroll';
import { rowAt, ROW_COUNT, SPIKES, START_TIME, END_TIME, type Reading } from './signal';
import { aggregate } from './worker-client';
let latency = 80;
export const setLatency = (value: number) => { latency = value; };
export function delay(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, latency);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export const provider: DataProvider<Reading> = {
  id: 'signal-observatory', revision: '1', rowCount: ROW_COUNT,
  metric: { label: 'Signal amplitude', unit: 'mV', kind: 'value', domain: [0, 180] },
  async fetchRows(start, count, signal) { await delay(signal); return Array.from({ length: count }, (_, i) => rowAt(start + i)); },
  async fetchOverview(buckets, signal) { await delay(signal); return aggregate({ start: 0, end: ROW_COUNT, buckets }, ROW_COUNT, signal); },
  async fetchAggregates(range, signal) { await delay(signal); return aggregate(range, ROW_COUNT, signal); },
  async fetchMarkers(signal) { await delay(signal); return SPIKES.map((p, i) => ({ id: `spike-${i + 1}`, index: Math.round(p * (ROW_COUNT - 1)), label: `Spike ${i + 1}`, kind: 'spike' })); },
  async fetchChapters(signal) {
    await delay(signal);
    return Array.from({ length: 20 }, (_, i) => ({ id: `year-${2010 + i}`, start: Math.ceil((Date.UTC(2010 + i, 0, 1) - START_TIME) / (END_TIME - START_TIME) * (ROW_COUNT - 1)), end: i === 19 ? ROW_COUNT : Math.ceil((Date.UTC(2011 + i, 0, 1) - START_TIME) / (END_TIME - START_TIME) * (ROW_COUNT - 1)), label: `${2010 + i}`, breadcrumb: ['Signal archive', `${2010 + i}`] }));
  },
};

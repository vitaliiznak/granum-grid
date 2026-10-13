import { rowAt, valueAt } from './signal';
import type { AggregateRequest, Bucket } from 'deepscroll';
self.onmessage = (event: MessageEvent<{ id: number; range: AggregateRequest; total: number }>) => {
  const { id, range, total } = event.data;
  const buckets: Bucket[] = [];
  const count = Math.min(range.buckets, range.end - range.start);
  for (let i = 0; i < count; i++) {
    const start = range.start + Math.floor(i / count * (range.end - range.start));
    const end = range.start + Math.floor((i + 1) / count * (range.end - range.start));
    const samples = Math.min(64, end - start);
    const values = Array.from({ length: samples }, (_, n) => valueAt(start + Math.floor(n / samples * (end - start)), total));
    buckets.push({ start, end, count: end - start, avg: values.reduce((a, b) => a + b, 0) / samples, min: Math.min(...values), max: Math.max(...values), accuracy: samples === end - start ? 'exact' : 'estimated', label: rowAt(start, total).timestamp.slice(0, 7) });
  }
  self.postMessage({ id, buckets });
};

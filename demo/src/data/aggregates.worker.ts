import { models, type Model } from './models';
import type { AggregateRequest, Bucket, OverviewTrack } from 'deepscroll';

function summarize(
  model: Model,
  value: (index: number) => number | null,
  start: number,
  end: number,
  samples: number,
): Omit<Bucket, 'start' | 'end' | 'count' | 'label'> {
  const n = Math.min(samples, end - start);
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = value(start + Math.floor((i / n) * (end - start)));
    if (v !== null && Number.isFinite(v)) values.push(v);
  }
  if (!values.length) return { avg: null, min: null, max: null, accuracy: 'unavailable' };
  return {
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    accuracy: n === end - start && values.length === n ? 'exact' : 'estimated',
  };
}
function aggregate(model: Model, range: AggregateRequest): Bucket[] {
  const buckets: Bucket[] = [];
  const count = Math.min(range.buckets, range.end - range.start);
  for (let i = 0; i < count; i++) {
    const start = range.start + Math.floor((i * (range.end - range.start)) / count);
    const end = range.start + Math.floor(((i + 1) * (range.end - range.start)) / count);
    buckets.push({
      start,
      end,
      count: end - start,
      ...summarize(model, model.value, start, end, 64),
      label: model.label(start),
    });
  }
  return buckets;
}
function tracks(model: Model, buckets: number): OverviewTrack[] {
  return (model.tracks ?? []).map((track) => ({
    id: track.id,
    label: track.label,
    metric: { label: track.label, kind: 'value', domain: track.domain },
    buckets: Array.from({ length: buckets }, (_, i) => {
      const start = Math.floor((i * model.rowCount) / buckets),
        end = Math.floor(((i + 1) * model.rowCount) / buckets);
      return { start, end, count: null, ...summarize(model, track.value, start, end, 16) };
    }),
  }));
}
self.onmessage = (
  event: MessageEvent<
    | { id: number; dataset: string; op: 'aggregate'; range: AggregateRequest }
    | { id: number; dataset: string; op: 'tracks'; buckets: number }
  >,
) => {
  const message = event.data;
  const model = models[message.dataset];
  const result =
    message.op === 'aggregate' ? aggregate(model, message.range) : tracks(model, message.buckets);
  self.postMessage({ id: message.id, result });
};

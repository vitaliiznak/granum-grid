import type { AggregateRequest, Bucket, OverviewTrack } from '@granum/react';
let nextId = 0;
let worker: Worker | undefined;
const jobs = new Map<
  number,
  { resolve: (result: never) => void; reject: (error: Error) => void; cleanup: () => void }
>();
function request<T>(message: object, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  if (!worker) {
    worker = new Worker(new URL('./aggregates.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const job = jobs.get(event.data.id);
      if (!job) return;
      job.cleanup();
      job.resolve(event.data.result as never);
      jobs.delete(event.data.id);
    };
    worker.onerror = () => {
      for (const job of jobs.values()) {
        job.cleanup();
        job.reject(new Error('Aggregation worker failed'));
      }
      jobs.clear();
      worker?.terminate();
      worker = undefined;
    };
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const abort = () => {
      jobs.delete(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    jobs.set(id, { resolve, reject, cleanup: () => signal.removeEventListener('abort', abort) });
    worker!.postMessage({ id, ...message });
  });
}
/** Sampled buckets for a dataset registered in ./models. */
export function aggregate(
  dataset: string,
  range: AggregateRequest,
  signal: AbortSignal,
): Promise<Bucket[]> {
  return request({ dataset, op: 'aggregate', range }, signal);
}
export function overviewTracks(
  dataset: string,
  buckets: number,
  signal: AbortSignal,
): Promise<OverviewTrack[]> {
  return request({ dataset, op: 'tracks', buckets }, signal);
}
export function stopWorker() {
  worker?.terminate();
  worker = undefined;
  for (const job of jobs.values()) {
    job.cleanup();
    job.reject(new DOMException('Aborted', 'AbortError'));
  }
  jobs.clear();
}

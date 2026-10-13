import type { AggregateRequest, Bucket } from 'deepscroll';
let nextId = 0;
let worker: Worker | undefined;
const jobs = new Map<
  number,
  { resolve: (buckets: Bucket[]) => void; reject: (error: Error) => void; cleanup: () => void }
>();
export function aggregate(
  range: AggregateRequest,
  total: number,
  signal: AbortSignal,
): Promise<Bucket[]> {
  signal.throwIfAborted();
  if (!worker) {
    worker = new Worker(new URL('./aggregates.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const job = jobs.get(event.data.id);
      if (!job) return;
      job.cleanup();
      job.resolve(event.data.buckets);
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
    worker!.postMessage({ id, range, total });
  });
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

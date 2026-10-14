/** Simulated server latency shared by the generated demo providers. */
export const DEFAULT_LATENCY = 1000;
let latency = DEFAULT_LATENCY;
export const setLatency = (value: number) => {
  latency = value;
};
/** Resolve after `ms`, or reject with the signal's reason if it aborts first. */
export function wait(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export const delay = (signal: AbortSignal) => wait(latency, signal);

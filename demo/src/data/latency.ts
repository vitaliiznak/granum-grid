/** Simulated server latency shared by the generated demo providers. */
export const DEFAULT_LATENCY = 1000;
let latency = DEFAULT_LATENCY;
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

/** Helpers shared by the providers that read live public APIs (Binance, Hacker News). */

/** A `fetch` replacement, for tests. */
export type Fetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

/** Fetch `url`; a network failure (not an abort) becomes a readable error naming `source`. */
export async function reach(request: Fetch, url: string, signal: AbortSignal, source: string) {
  try {
    return await request(url, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(`Could not reach ${source}. Check the connection and retry.`);
  }
}

/** Store `value` as the most recent entry, dropping the oldest beyond `limit`. */
export function remember<K, V>(map: Map<K, V>, key: K, value: V, limit: number) {
  map.delete(key);
  map.set(key, value);
  if (map.size > limit) map.delete(map.keys().next().value!);
}

/**
 * A load shared by every caller. A caller's signal ends only its own wait; a failed load
 * is retried by the next caller.
 */
export function sharedLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  let pending: Promise<T> | null = null;
  return (signal: AbortSignal) => {
    const shared = (pending ??= load(new AbortController().signal).catch((error) => {
      pending = null;
      throw error;
    }));
    return new Promise<T>((resolve, reject) => {
      signal.throwIfAborted();
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      shared.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  };
}

/**
 * UTC `[start, end)` of a `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` period, NaN when invalid.
 * `year` is set only for a whole year.
 */
export function datePeriod(text: string) {
  const parts = text.split('-').map(Number);
  const [year, month = 1, day = 1] = parts;
  return {
    start: Date.UTC(year, month - 1, day),
    end:
      parts.length === 1
        ? Date.UTC(year + 1, 0, 1)
        : parts.length === 2
          ? Date.UTC(year, month, 1)
          : Date.UTC(year, month - 1, day + 1),
    year: parts.length === 1 ? year : null,
  };
}

export const iso = (time: number) => new Date(time).toISOString();
/** `YYYY-MM-DD HH:MM:SS` in UTC. */
export const secondLabel = (time: number) => iso(time).slice(0, 19).replace('T', ' ');

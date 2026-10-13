import type {
  AggregateRequest,
  Bucket,
  Chapter,
  DataProvider,
  Marker,
  OverviewTrack,
  ProviderQuery,
  SearchContext,
  SearchResult,
} from 'granum-grid';
import { splitRange } from './ranges';
import { checkPredicate } from './search';

/**
 * Binance's public market-data host: no key, any origin. The documented budget is
 * 6,000 request weight per minute per IP, and one klines request costs 2 whatever
 * its limit (up to 1,000 candles).
 */
export const BINANCE_API = 'https://data-api.binance.vision/api/v3';
export const SYMBOL = 'BTCUSDT';
/** Open time of the first BTCUSDT 1-second candle: 2017-08-17 04:00:28 UTC. */
export const FIRST_SECOND = 1_502_942_428_000;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const KLINES_WEIGHT = 2;
/** Half the per-IP budget: other tabs and applications may share the address. */
const WEIGHT_PER_MINUTE = 3000;
const PAGE = 1000;
/** Each summary reads at most this many candles (three requests). */
const SUMMARY_CANDLES = 3000;
const SEARCH_REQUESTS = 16;
/** Completed responses kept for repeated overview, marker, and search reads. */
const CACHED_RESPONSES = 32;

const INTERVALS = [
  ['1s', 1],
  ['1m', 60],
  ['3m', 180],
  ['5m', 300],
  ['15m', 900],
  ['30m', 1800],
  ['1h', 3600],
  ['2h', 7200],
  ['4h', 14400],
  ['6h', 21600],
  ['8h', 28800],
  ['12h', 43200],
  ['1d', 86400],
  ['3d', 259200],
  ['1w', 604800],
] as const;
type Interval = (typeof INTERVALS)[number][0];
const seconds = (interval: Interval) => INTERVALS.find(([name]) => name === interval)![1];
/** Each level nests whole candles of the next, so a parent's high and low bound its children. */
const LEVELS = ['1w', '1d', '1h', '1m', '1s'] as const;

export interface Candle {
  /** Open time, UTC milliseconds. The candle covers `[time, end)`. */
  time: number;
  end: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** BTC traded. */
  volume: number;
  /** USDT traded. */
  quoteVolume: number;
  trades: number;
  /** BTC bought by takers. */
  takerBuyVolume: number;
}
/** One UTC second. `missing` marks a second for which Binance published no candle. */
export type BitcoinSecond = (Candle & { missing: false }) | { time: number; missing: true };

export const timeAt = (index: number) => FIRST_SECOND + index * SECOND;
/** First row at or after `time`. */
export const indexAt = (time: number) => Math.ceil((time - FIRST_SECOND) / SECOND);
/** Seconds with a closed candle when the page loaded; a minute of margin for publication. */
export const liveRowCount = (now = Date.now()) =>
  Math.floor((now - MINUTE - FIRST_SECOND) / SECOND);

function parseCandle(value: unknown): Candle {
  if (!Array.isArray(value) || value.length < 10)
    throw new Error('Binance returned an invalid candle.');
  const [time, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyVolume] =
    value.map(Number);
  const candle = {
    time,
    end: closeTime + 1,
    open,
    high,
    low,
    close,
    volume,
    quoteVolume,
    trades,
    takerBuyVolume,
  };
  if (!Object.values(candle).every(Number.isFinite) || candle.end <= time)
    throw new Error('Binance returned an invalid candle.');
  return candle;
}
function wait(ms: number, signal: AbortSignal) {
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

export interface BinanceClientOptions {
  fetch?: (url: string, init: { signal: AbortSignal }) => Promise<Response>;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}
/**
 * Klines reader with a client-side weight budget. Browsers cannot read Binance's
 * weight or Retry-After headers (they are not CORS-exposed), so the client counts its
 * own requests and pauses every caller after a 429 or 418 instead of retrying into a ban.
 */
export function createBinanceClient(options: BinanceClientOptions = {}) {
  const request = options.fetch ?? ((url, init) => fetch(url, init));
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? wait;
  const budget = WEIGHT_PER_MINUTE / KLINES_WEIGHT;
  const sent: number[] = [];
  const cache = new Map<string, Candle[]>();
  let pausedUntil = 0;

  async function admit(signal: AbortSignal) {
    for (;;) {
      signal.throwIfAborted();
      const t = now();
      while (sent.length && sent[0] <= t - MINUTE) sent.shift();
      const delay = Math.max(pausedUntil - t, sent.length < budget ? 0 : sent[0] + MINUTE - t);
      if (delay <= 0) {
        sent.push(t);
        return;
      }
      await sleep(delay, signal);
    }
  }
  async function read(url: string, signal: AbortSignal): Promise<Candle[]> {
    const cached = cache.get(url);
    if (cached) {
      cache.delete(url);
      cache.set(url, cached);
      return cached;
    }
    await admit(signal);
    let response: Response;
    try {
      response = await request(url, { signal });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error('Could not reach Binance market data. Check the connection and retry.');
    }
    if (response.status === 429 || response.status === 418) {
      const retry = Number(response.headers.get('retry-after'));
      const pause = retry > 0 ? retry * SECOND : response.status === 418 ? 5 * MINUTE : MINUTE;
      pausedUntil = Math.max(pausedUntil, now() + pause);
      throw new Error(
        response.status === 418
          ? 'Binance temporarily blocked this address for exceeding its rate limit. Requests are paused.'
          : 'Binance rate limit reached. Requests are paused for about a minute.',
      );
    }
    if (response.status === 451 || response.status === 403)
      throw new Error(
        `Binance market data is not available from this location (HTTP ${response.status}).`,
      );
    if (!response.ok) throw new Error(`Binance request failed (HTTP ${response.status}).`);
    const body: unknown = await response.json();
    signal.throwIfAborted();
    if (!Array.isArray(body)) throw new Error('Binance returned an invalid response.');
    const candles = body.map(parseCandle);
    if (candles.some((candle, i) => i > 0 && candle.time < candles[i - 1].end))
      throw new Error('Binance returned unordered candles.');
    cache.set(url, candles);
    if (cache.size > CACHED_RESPONSES) cache.delete(cache.keys().next().value!);
    return candles;
  }
  return {
    /** Candles opening in `[start, end)`, oldest first; one request per 1,000 candles. */
    async klines(interval: Interval, start: number, end: number, signal: AbortSignal) {
      const step = seconds(interval) * SECOND;
      if (Math.ceil((end - start) / step) > 8 * PAGE)
        throw new Error(`Refusing to read more than ${8 * PAGE} ${interval} candles.`);
      const candles: Candle[] = [];
      for (let from = start; from < end;) {
        const limit = Math.min(PAGE, Math.ceil((end - from) / step));
        const url = `${BINANCE_API}/klines?symbol=${SYMBOL}&interval=${interval}&startTime=${from}&endTime=${end - 1}&limit=${limit}`;
        const page = await read(url, signal);
        candles.push(...page);
        if (page.length < limit) break;
        from = page[page.length - 1].end;
      }
      return candles;
    },
  };
}
export type BinanceClient = ReturnType<typeof createBinanceClient>;

/** The coarsest interval that still gives each bucket a candle, within the read cap. */
function summaryInterval(rows: number, buckets: number): Interval {
  let choice = 0;
  INTERVALS.forEach(([, size], i) => {
    if (size <= rows / buckets) choice = i;
  });
  while (choice < INTERVALS.length - 1 && rows / INTERVALS[choice][1] > SUMMARY_CANDLES) choice++;
  return INTERVALS[choice][0];
}
interface Summary {
  bucket: Bucket;
  volume: Bucket;
  trades: Bucket;
}
function summarize(
  candles: readonly Candle[],
  interval: Interval,
  range: { start: number; end: number; buckets: number },
): Summary[] {
  let first = 0;
  return splitRange(range.start, range.end, Math.min(range.buckets, range.end - range.start)).map(
    ({ start, end }) => {
      const t0 = timeAt(start),
        t1 = timeAt(end);
      while (first < candles.length && candles[first].end <= t0) first++;
      let low = Infinity,
        high = -Infinity,
        volume = 0,
        quote = 0,
        trades = 0,
        closes = 0,
        covered = 0,
        contained = true;
      const volumeRates: number[] = [],
        tradeRates: number[] = [];
      for (let i = first; i < candles.length && candles[i].time < t1; i++) {
        const c = candles[i],
          span = c.end - c.time,
          overlap = Math.min(c.end, t1) - Math.max(c.time, t0),
          share = overlap / span;
        contained &&= c.time >= t0 && c.end <= t1;
        covered += overlap;
        low = Math.min(low, c.low);
        high = Math.max(high, c.high);
        volume += c.volume * share;
        quote += c.quoteVolume * share;
        trades += c.trades * share;
        closes += c.close * overlap;
        volumeRates.push(c.volume / (span / SECOND));
        tradeRates.push(c.trades / (span / SECOND));
      }
      const base = { start, end, count: end - start, label: rangeLabel(t0, t1) };
      if (!covered) {
        const none = { ...base, avg: null, min: null, max: null, accuracy: 'unavailable' as const };
        return { bucket: none, volume: none, trades: none };
      }
      // Whole candles tiling the bucket give exact extremes and a volume-weighted average.
      const exact = contained && covered === t1 - t0;
      const rate = (sum: number, rates: number[]) => ({
        ...base,
        avg: sum / (covered / SECOND),
        min: Math.min(...rates),
        max: Math.max(...rates),
        // Per-second extremes need 1-second candles.
        accuracy: exact && interval === '1s' ? ('exact' as const) : ('estimated' as const),
      });
      return {
        bucket: {
          ...base,
          avg: volume > 0 ? quote / volume : closes / covered,
          min: low,
          max: high,
          accuracy: exact ? 'exact' : 'estimated',
        },
        volume: rate(volume, volumeRates),
        trades: rate(trades, tradeRates),
      };
    },
  );
}
const iso = (time: number) => new Date(time).toISOString();
export const secondLabel = (time: number) => iso(time).slice(0, 19).replace('T', ' ');
function rangeLabel(t0: number, t1: number) {
  return t1 - t0 >= 86_400 * SECOND ? iso(t0).slice(0, 10) : iso(t0).slice(0, 16).replace('T', ' ');
}
const usd = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Index of a `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` period's first row, or null outside the data. */
function dateIndex(text: string, rowCount: number) {
  const [year, month = 1, day = 1] = text.split('-').map(Number);
  const start = Date.UTC(year, month - 1, day);
  const parts = text.split('-').length;
  const end =
    parts === 1
      ? Date.UTC(year + 1, 0, 1)
      : parts === 2
        ? Date.UTC(year, month, 1)
        : Date.UTC(year, month - 1, day + 1);
  if (!Number.isFinite(start) || end <= FIRST_SECOND || start >= timeAt(rowCount)) return null;
  return Math.max(0, indexAt(start));
}

type Predicate = Extract<ProviderQuery, { kind: 'predicate' }>;
function candleTest(query: Predicate): (candle: Candle) => boolean {
  checkPredicate(query, 'number');
  const value = query.value as number;
  if (query.field === 'high' && query.operator === '>') return (c) => c.high > value;
  if (query.field === 'high' && query.operator === '>=') return (c) => c.high >= value;
  if (query.field === 'low' && query.operator === '<') return (c) => c.low < value;
  if (query.field === 'low' && query.operator === '<=') return (c) => c.low <= value;
  throw new Error('Search supports high > price, high >= price, low < price, and low <= price.');
}
class SearchBudget extends Error {}

export type BitcoinProvider = DataProvider<BitcoinSecond> & {
  /** Data-derived landmarks, computed once per provider. */
  loadMarkers(signal: AbortSignal): Promise<Marker[]>;
};
/**
 * BTC/USDT on Binance, one row per UTC second since the pair opened. Row `i` is the
 * second starting at `FIRST_SECOND + i` seconds, so addresses never move; a later
 * visit only appends rows.
 */
export function bitcoinProvider(
  rowCount: number,
  client: BinanceClient = createBinanceClient(),
): BitcoinProvider {
  const lastTime = timeAt(rowCount);
  async function summaries(range: AggregateRequest, signal: AbortSignal) {
    const start = Math.max(0, range.start),
      end = Math.min(rowCount, range.end);
    if (end <= start || range.buckets < 1) return [];
    const interval = summaryInterval(end - start, Math.min(range.buckets, end - start));
    // Include the candle already open at the range start.
    const step = seconds(interval) * SECOND;
    const candles = await client.klines(interval, timeAt(start) - step + 1, timeAt(end), signal);
    return summarize(candles, interval, { start, end, buckets: range.buckets });
  }
  /** Highest 1-second candle inside `[t0, t1)`, found by descending through whole candles. */
  async function highest(signal: AbortSignal) {
    let t0 = FIRST_SECOND,
      t1 = lastTime,
      best: Candle | undefined;
    for (const interval of LEVELS) {
      const step = seconds(interval) * SECOND;
      const candles = (await client.klines(interval, t0 - step + 1, t1, signal)).filter(
        (c) => c.end > t0 && c.time < t1,
      );
      best = candles.reduce<Candle | undefined>(
        (a, c) => (a && a.high >= c.high ? a : c),
        undefined,
      );
      if (!best) return null;
      t0 = Math.max(t0, best.time);
      t1 = Math.min(t1, best.end);
    }
    return best!;
  }
  let markers: Promise<Marker[]> | null = null;
  async function computeMarkers(signal: AbortSignal): Promise<Marker[]> {
    const day = 86_400 * SECOND;
    const [peak, days] = await Promise.all([
      highest(signal),
      client.klines('1d', FIRST_SECOND - day + 1, lastTime, signal),
    ]);
    const moves = days
      .filter((c) => c.end <= lastTime && c.open > 0)
      .map((c) => ({ candle: c, change: c.close / c.open - 1 }))
      .sort((a, b) => a.change - b.change);
    const percent = (value: number) =>
      `${value > 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(1)}%`;
    const move = (
      { candle, change }: (typeof moves)[number],
      kind: 'fall' | 'rise',
      rank: number,
    ): Marker => ({
      id: `${kind}-${rank}`,
      index: Math.max(0, indexAt(candle.time)),
      label: `${rank === 1 ? 'Largest' : `#${rank}`} daily ${kind} · ${percent(change)} · ${iso(candle.time).slice(0, 10)}`,
      kind: 'spike',
    });
    const result = [
      ...moves.slice(0, 3).map((m, i) => move(m, 'fall', i + 1)),
      ...moves
        .slice(-3)
        .reverse()
        .map((m, i) => move(m, 'rise', i + 1)),
    ];
    if (peak)
      result.push({
        id: 'highest',
        index: indexAt(peak.time),
        label: `Highest trade · ${usd(peak.high)} · ${iso(peak.time).slice(0, 10)}`,
        kind: 'event',
      });
    return result.sort((a, b) => a.index - b.index);
  }
  function loadMarkers(signal: AbortSignal) {
    // Shared once complete; a canceled or failed load is retried by the next caller.
    const pending = (markers ??= computeMarkers(new AbortController().signal).catch((error) => {
      markers = null;
      throw error;
    }));
    return new Promise<Marker[]>((resolve, reject) => {
      signal.throwIfAborted();
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }
  async function search(query: ProviderQuery, context: SearchContext): Promise<SearchResult> {
    context.signal.throwIfAborted();
    if (query.kind === 'date') {
      const index = dateIndex(query.value, rowCount);
      return {
        matches:
          index === null
            ? []
            : [{ id: `date-${query.value}`, index, label: query.value, kind: 'search' }],
        complete: true,
      };
    }
    if (query.kind === 'text')
      throw new Error('Search supports dates and price thresholds, such as high > 100000.');
    const test = candleTest(query);
    const from = Math.min(rowCount, Math.max(0, Math.floor(context.fromIndex)));
    let requests = 0;
    /** 1-second candles from the first match in `[t0, t1)` to the end of its minute. */
    async function first(level: number, t0: number, t1: number): Promise<Candle[] | null> {
      if (++requests > SEARCH_REQUESTS) throw new SearchBudget();
      const step = seconds(LEVELS[level]) * SECOND;
      const candles = await client.klines(LEVELS[level], t0 - step + 1, t1, context.signal);
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (c.end <= t0 || c.time >= t1 || !test(c)) continue;
        if (level === LEVELS.length - 1)
          return candles.slice(i).filter((s) => s.time >= t0 && s.time < t1 && test(s));
        // A partial candle at either edge can match outside the range; keep looking.
        const found = await first(level + 1, Math.max(c.time, t0), Math.min(c.end, t1));
        if (found) return found;
      }
      return null;
    }
    let found: Candle[] | null;
    try {
      found = from < rowCount ? await first(0, timeAt(from), lastTime) : null;
    } catch (error) {
      if (!(error instanceof SearchBudget)) throw error;
      return {
        matches: [],
        complete: false,
        message: `Search stopped after ${SEARCH_REQUESTS} requests to respect Binance's rate limit.`,
      };
    }
    if (!found)
      return from === 0
        ? { matches: [], complete: true }
        : {
            matches: [],
            complete: false,
            message: 'No matching second after this position. Earlier rows were not searched.',
          };
    return {
      matches: found.slice(0, context.limit).map((c) => ({
        id: `search-${c.time}`,
        index: indexAt(c.time),
        label: `${query.field} ${usd(query.field === 'high' ? c.high : c.low)} · ${secondLabel(c.time)}`,
        kind: 'search' as const,
      })),
      complete: false,
      message: 'First matching seconds after this position. Search from a later row for more.',
    };
  }
  const years = Array.from(
    { length: new Date(lastTime).getUTCFullYear() - 2017 + 1 },
    (_, i) => 2017 + i,
  );
  const chapters: Chapter[] = years.map((year, i) => ({
    id: `year-${year}`,
    label: `${year}`,
    breadcrumb: ['BTC/USDT', `${year}`],
    start: Math.max(0, indexAt(Date.UTC(year, 0, 1))),
    end: i === years.length - 1 ? rowCount : indexAt(Date.UTC(year + 1, 0, 1)),
  }));
  return {
    id: 'bitcoin',
    // Addresses are fixed seconds, so the revision survives later visits with more rows.
    revision: 'binance-btcusdt-1s-1',
    rowCount,
    metric: { label: 'Price', unit: 'USDT', kind: 'value' },
    searchHelp: {
      examples: ['high > 100000', 'low < 4000', '2020-03-12', '2021-11'],
      placeholder: 'Row number, date, or price threshold…',
      text: false,
      dates: true,
      fields: [
        { name: 'high', type: 'number', operators: ['>', '>='] },
        { name: 'low', type: 'number', operators: ['<', '<='] },
      ],
    },
    async fetchRows(start, count, signal) {
      const from = timeAt(start);
      const candles = await client.klines('1s', from, timeAt(start + count), signal);
      const rows: BitcoinSecond[] = Array.from({ length: count }, (_, i) => ({
        time: from + i * SECOND,
        missing: true,
      }));
      for (const candle of candles) {
        const i = (candle.time - from) / SECOND;
        if (Number.isInteger(i) && i >= 0 && i < count) rows[i] = { ...candle, missing: false };
      }
      return rows;
    },
    async fetchOverview(buckets, signal) {
      return (await summaries({ start: 0, end: rowCount, buckets }, signal)).map((s) => s.bucket);
    },
    async fetchAggregates(range, signal) {
      return (await summaries(range, signal)).map((s) => s.bucket);
    },
    async fetchOverviewTracks(buckets, signal): Promise<OverviewTrack[]> {
      const result = await summaries({ start: 0, end: rowCount, buckets }, signal);
      return [
        {
          id: 'volume',
          label: 'Volume',
          metric: { label: 'Volume', unit: 'BTC/s', kind: 'value' },
          buckets: result.map((s) => s.volume),
        },
        {
          id: 'trades',
          label: 'Trades',
          metric: { label: 'Trades', unit: '/s', kind: 'value' },
          buckets: result.map((s) => s.trades),
        },
      ];
    },
    fetchMarkers: loadMarkers,
    loadMarkers,
    async fetchChapters() {
      return chapters;
    },
    search,
  };
}

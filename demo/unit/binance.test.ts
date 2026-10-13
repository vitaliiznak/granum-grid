import { describe, expect, it } from 'vitest';
import {
  FIRST_SECOND,
  bitcoinProvider,
  createBinanceClient,
  indexAt,
  timeAt,
  type BinanceClientOptions,
} from '../src/data/binance';

const S = 1000,
  DAY = 86_400 * S;
const ROWS = 40 * 86_400;
const END = timeAt(ROWS);
/** Price rises one cent per second; one second trades far above the rest. */
const price = (time: number) => 1000 + (time - FIRST_SECOND) / 100_000;
const SPIKE = 30 * 86_400 + 1234;
const GAP = 5 * 86_400;
const SIZES: Record<string, number> = {
  '1s': 1,
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14_400,
  '6h': 21_600,
  '8h': 28_800,
  '12h': 43_200,
  '1d': 86_400,
  '3d': 259_200,
  '1w': 604_800,
};

/** Binance-shaped klines: 1w opens on Mondays, other intervals on epoch multiples. */
function fakeBinance() {
  const urls: string[] = [];
  const fetch: BinanceClientOptions['fetch'] = async (url) => {
    urls.push(url);
    const params = new URL(url).searchParams;
    const size = SIZES[params.get('interval')!] * S;
    const startTime = Number(params.get('startTime')),
      endTime = Number(params.get('endTime')),
      limit = Number(params.get('limit'));
    const offset = size === 604_800 * S ? 4 * DAY : 0;
    const body = [];
    for (
      let open = Math.ceil((startTime - offset) / size) * size + offset;
      open <= endTime && body.length < limit;
      open += size
    ) {
      const first = Math.max(open, FIRST_SECOND),
        last = Math.min(open + size, END) - S;
      if (last < first) continue;
      if (size === S && open >= timeAt(GAP) && open < timeAt(GAP + 2)) continue;
      const n = (last - first) / S + 1,
        spike = timeAt(SPIKE) >= first && timeAt(SPIKE) <= last;
      const low = price(first),
        high = spike ? 1_000_000 : price(last);
      body.push([
        open,
        `${low}`,
        `${high}`,
        `${low}`,
        `${price(last)}`,
        `${n}`,
        open + size - 1,
        `${(n * (price(first) + price(last))) / 2}`,
        n,
        `${n / 2}`,
        '0',
        '0',
      ]);
    }
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { urls, fetch };
}
const signal = new AbortController().signal;
const setup = () => {
  const server = fakeBinance();
  return { ...server, provider: bitcoinProvider(ROWS, createBinanceClient(server)) };
};

describe('Binance BTC/USDT provider', () => {
  it('addresses rows by second and keeps gaps in place', async () => {
    const { provider, urls } = setup();
    expect(timeAt(indexAt(Date.UTC(2017, 8, 1)))).toBe(Date.UTC(2017, 8, 1));
    const rows = await provider.fetchRows(GAP - 2, 5, signal);
    expect(rows.map((row) => row.missing)).toEqual([false, false, true, true, false]);
    expect(rows[0]).toMatchObject({ time: timeAt(GAP - 2), close: price(timeAt(GAP - 2)) });
    expect(rows[2]).toEqual({ time: timeAt(GAP), missing: true });
    const page = await provider.fetchRows(10_000, 2500, signal);
    expect(page).toHaveLength(2500);
    expect(page.every((row, i) => !row.missing && row.time === timeAt(10_000 + i))).toBe(true);
    expect(urls).toHaveLength(4);
  });

  it('marks summaries exact only where whole candles tile a group', async () => {
    const { provider } = setup();
    const minute = indexAt(Math.ceil(FIRST_SECOND / 60_000) * 60_000);
    const aligned = await provider.fetchAggregates!(
      { start: minute, end: minute + 120, buckets: 2 },
      signal,
    );
    const first = timeAt(minute);
    expect(aligned[0]).toMatchObject({
      start: minute,
      end: minute + 60,
      count: 60,
      accuracy: 'exact',
      min: price(first),
      max: price(first + 59 * S),
    });
    expect(aligned[0].avg).toBeCloseTo((price(first) + price(first + 59 * S)) / 2, 6);
    const shifted = await provider.fetchAggregates!(
      { start: minute + 1, end: minute + 121, buckets: 2 },
      signal,
    );
    expect(shifted.map((bucket) => bucket.accuracy)).toEqual(['estimated', 'estimated']);
    const seconds = await provider.fetchAggregates!({ start: 0, end: 10, buckets: 10 }, signal);
    expect(seconds.every((bucket) => bucket.accuracy === 'exact')).toBe(true);
    const overview = await provider.fetchOverview!(96, signal);
    expect(overview).toHaveLength(96);
    expect(overview.at(-1)!.end).toBe(ROWS);
    expect(Math.max(...overview.map((bucket) => bucket.max!))).toBe(1_000_000);
  });

  it('descends to the first matching second with bounded requests', async () => {
    const { provider, urls } = setup();
    const target = 12 * 86_400 + 4321;
    const result = await provider.search!(
      { kind: 'predicate', field: 'high', operator: '>=', value: price(timeAt(target)) },
      { fromIndex: 0, limit: 3, signal },
    );
    expect(result.matches.map((match) => match.index)).toEqual([target, target + 1, target + 2]);
    expect(result.complete).toBe(false);
    expect(urls.length).toBeLessThanOrEqual(6);
    const spike = await provider.search!(
      { kind: 'predicate', field: 'high', operator: '>', value: 500_000 },
      { fromIndex: target, limit: 5, signal },
    );
    expect(spike.matches.map((match) => match.index)).toEqual([SPIKE]);
    const none = await provider.search!(
      { kind: 'predicate', field: 'low', operator: '<', value: 999 },
      { fromIndex: 0, limit: 5, signal },
    );
    expect(none).toEqual({ matches: [], complete: true });
    await expect(
      provider.search!(
        { kind: 'predicate', field: 'low', operator: '>', value: 1 },
        { fromIndex: 0, limit: 5, signal },
      ),
    ).rejects.toThrow(/low < price/);
  });

  it('answers date queries by arithmetic', async () => {
    const { provider, urls } = setup();
    const at = (value: string) =>
      provider.search!({ kind: 'date', value }, { fromIndex: 0, limit: 1, signal });
    expect((await at('2017')).matches[0].index).toBe(0);
    expect((await at('2017-09-03')).matches[0].index).toBe(indexAt(Date.UTC(2017, 8, 3)));
    expect((await at('2030')).matches).toEqual([]);
    expect(urls).toEqual([]);
  });

  it('derives markers once and lands on the highest second', async () => {
    const { provider, urls } = setup();
    const markers = await provider.fetchMarkers!(signal);
    expect(markers.find((marker) => marker.id === 'highest')).toMatchObject({
      index: SPIKE,
      kind: 'event',
    });
    expect(markers.find((marker) => marker.id === 'highest')!.label).toContain('$1,000,000.00');
    const requests = urls.length;
    await provider.fetchMarkers!(signal);
    expect(urls).toHaveLength(requests);
  });
});

describe('Binance client', () => {
  it('pauses every caller after a rate-limit answer', async () => {
    let clock = 0,
      status = 429;
    const sleeps: number[] = [];
    const client = createBinanceClient({
      fetch: async () => new Response('[]', { status }),
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    await expect(client.klines('1m', 0, 60_000, signal)).rejects.toThrow(/rate limit/);
    status = 200;
    await client.klines('1m', 60_000, 120_000, signal);
    expect(sleeps).toEqual([60_000]);
  });

  it('keeps within half of the per-minute weight budget', async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const client = createBinanceClient({
      fetch: async () => new Response('[]', { status: 200 }),
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    for (let i = 0; i <= 1500; i++) await client.klines('1m', i * 60_000, (i + 1) * 60_000, signal);
    expect(sleeps).toEqual([60_000]);
  });

  it('reports regional refusals and invalid candles', async () => {
    const refused = createBinanceClient({ fetch: async () => new Response('', { status: 451 }) });
    await expect(refused.klines('1m', 0, 60_000, signal)).rejects.toThrow(/location/);
    const invalid = createBinanceClient({
      fetch: async () => new Response('[[1, "x"]]', { status: 200 }),
    });
    await expect(invalid.klines('1m', 0, 60_000, signal)).rejects.toThrow(/invalid/);
  });
});

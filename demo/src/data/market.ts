import { bump, clamp, gaussian, noise, pick } from './noise';
import { timeline } from './timeline';

export const TRADE_COUNT = 750_000_000;
const MARKET_START = Date.UTC(2016, 0, 1);
const MARKET_END = Date.UTC(2026, 0, 1);
/** 2016 through 2025, UTC. */
export const marketTime = timeline(MARKET_START, MARKET_END, TRADE_COUNT);
const at = (date: string) =>
  (Date.parse(`${date}T00:00:00Z`) - MARKET_START) / (MARKET_END - MARKET_START);
/** Row at a position given as a fraction of the tape, such as an event's `x`. */
export const tradeIndex = (x: number) => Math.round(x * (TRADE_COUNT - 1));

/** Fast drop, slower recovery. Positions are fractions of the ten-year tape. */
export const MARKET_EVENTS = [
  {
    id: 'flash',
    label: 'Flash crash',
    x: at('2018-02-05'),
    depth: 0.11,
    fall: 0.0005,
    recover: 0.002,
  },
  {
    id: 'crunch',
    label: 'Liquidity crunch',
    x: at('2020-03-16'),
    depth: 0.38,
    fall: 0.012,
    recover: 0.05,
  },
  { id: 'rates', label: 'Rate shock', x: at('2022-06-13'), depth: 0.2, fall: 0.03, recover: 0.09 },
  {
    id: 'breaker',
    label: 'Circuit breaker',
    x: at('2024-08-05'),
    depth: 0.09,
    fall: 0.0006,
    recover: 0.003,
  },
] as const;
function shock(x: number) {
  return MARKET_EVENTS.reduce((sum, e) => {
    const t = x - e.x;
    return sum + e.depth * (t < 0 ? bump(t, 0, e.fall) : Math.exp(-t / e.recover));
  }, 0);
}
function trendAt(x: number) {
  const wave =
    1.12 * x +
    0.2 * Math.sin(2 * Math.PI * 1.7 * x + 0.4) +
    0.065 * Math.sin(2 * Math.PI * 6.3 * x + 1.1) +
    0.032 * Math.sin(2 * Math.PI * 23.1 * x + 2) +
    0.014 * Math.sin(2 * Math.PI * 97.3 * x) +
    0.006 * Math.sin(2 * Math.PI * 411 * x);
  return 118 * Math.exp(wave - shock(x));
}
export function priceAt(index: number) {
  const x = index / (TRADE_COUNT - 1);
  const micro = 1 + 0.0007 * gaussian(index, 3) + 0.0012 * Math.sin(index * 0.0031);
  return Math.round(trendAt(x) * micro * 100) / 100;
}
export function volatilityAt(index: number) {
  const x = index / (TRADE_COUNT - 1);
  return (
    12 +
    4 * Math.sin(2 * Math.PI * 9.1 * x) +
    MARKET_EVENTS.reduce((sum, e) => sum + 60 * e.depth * bump(x, e.x + e.fall, e.recover), 0)
  );
}
export function volumeAt(index: number) {
  const x = index / (TRADE_COUNT - 1);
  return clamp(1 + 0.25 * Math.sin(2 * Math.PI * 41 * x) + shock(x) * 6, 0.4, 4) * 100;
}
let high = { x: 0, price: 0 };
for (let i = 0; i <= 4000; i++) {
  const price = trendAt(i / 4000);
  if (price > high.price) high = { x: i / 4000, price };
}
export const ALL_TIME_HIGH = tradeIndex(high.x);

export interface Trade {
  time: string;
  side: 'BUY' | 'SELL';
  price: number;
  change: number;
  size: number;
  venue: 'Lit' | 'Dark' | 'Auction';
  block: boolean;
}
export function tradeAt(index: number): Trade {
  const price = priceAt(index),
    previous = index ? priceAt(index - 1) : price;
  const block = noise(index, 11) < 0.004;
  const size = block
    ? Math.round(5_000 + noise(index, 12) * 45_000)
    : Math.round(10 ** (1 + 2.3 * noise(index, 13) ** 3));
  return {
    time: new Date(marketTime.timeAt(index)).toISOString(),
    side: noise(index, 14) < 0.5 + (price - previous) * 2 ? 'BUY' : 'SELL',
    price,
    change: Math.round((price - previous) * 100) / 100,
    size,
    venue: block
      ? pick(['Dark', 'Auction'] as const, noise(index, 15))
      : pick(['Lit', 'Lit', 'Lit', 'Dark'] as const, noise(index, 15)),
    block,
  };
}

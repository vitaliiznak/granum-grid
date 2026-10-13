import { bump, clamp, gaussian, noise, pick } from './noise';

export const LOG_COUNT = 1_296_000_000;
export const LOG_START = Date.UTC(2026, 8, 1);
export const LOG_END = Date.UTC(2026, 9, 1);
const DAY = 86_400_000;
const day = (d: number) => (d * DAY) / (LOG_END - LOG_START);

export const INCIDENTS = [
  {
    id: 'INC-2041',
    label: 'INC-2041 · payments 502s',
    x: day(4.62),
    width: day(0.07),
    peak: 24,
    service: 'payments',
  },
  {
    id: 'INC-2049',
    label: 'INC-2049 · auth latency',
    x: day(11.3),
    width: day(0.16),
    peak: 12,
    service: 'auth',
  },
  {
    id: 'INC-2057',
    label: 'INC-2057 · cache stampede',
    x: day(17.86),
    width: day(0.05),
    peak: 30,
    service: 'search',
  },
  {
    id: 'INC-2063',
    label: 'INC-2063 · DNS failover',
    x: day(23.4),
    width: day(0.1),
    peak: 17,
    service: 'gateway',
  },
  {
    id: 'INC-2070',
    label: 'INC-2070 · bad deploy',
    x: day(27.12),
    width: day(0.06),
    peak: 20,
    service: 'orders',
  },
] as const;
export const DEPLOYS = [
  { label: 'Deploy orders v4.12', x: day(3.5) },
  { label: 'Deploy auth v2.8', x: day(9.6) },
  { label: 'Deploy search v3.1', x: day(17.8) },
  { label: 'Deploy orders v4.13', x: day(27.07) },
  { label: 'Rollback orders v4.12', x: day(27.16) },
] as const;
export const SERVICES = ['gateway', 'auth', 'orders', 'payments', 'search', 'cdn'] as const;
const ROUTES: Record<(typeof SERVICES)[number], readonly string[]> = {
  gateway: ['GET /healthz', 'GET /v1/config'],
  auth: ['POST /oauth/token', 'GET /v1/session', 'POST /v1/login'],
  orders: ['GET /v1/orders', 'PATCH /v1/orders/:id', 'POST /v1/orders'],
  payments: ['POST /v1/charges', 'GET /v1/invoices/:id', 'POST /v1/refunds'],
  search: ['GET /v1/search', 'GET /v1/suggest'],
  cdn: ['GET /assets/app.js', 'GET /assets/app.css', 'GET /img/:id'],
};
const MESSAGES = {
  ERROR: [
    'upstream connect error: connection refused',
    'timeout after 3000ms waiting for db pool',
    'bad gateway from payments-ledger',
    'circuit open for dependency inventory',
  ],
  WARN: [
    'rate limit exceeded for client',
    'retrying request (attempt 2/3)',
    'slow query 812ms on orders_by_user',
    'cache miss storm detected',
  ],
  INFO: ['request completed', 'request completed', 'token refreshed', 'cache hit'],
  DEBUG: ['span exported', 'feature flag evaluated', 'pool checkout 2ms'],
} as const;

function incidentWeight(x: number) {
  let best = { weight: 0, incident: INCIDENTS[0] as (typeof INCIDENTS)[number] };
  for (const incident of INCIDENTS) {
    const weight = bump(x, incident.x, incident.width);
    if (weight > best.weight) best = { weight, incident };
  }
  return best;
}
/** Error percentage at a fraction of the month. */
export function errorRateAt(index: number) {
  const x = index / (LOG_COUNT - 1);
  const hour = ((x * (LOG_END - LOG_START)) / 3_600_000) % 24;
  const diurnal = 1.6 * Math.max(0, Math.sin(((hour - 7) / 24) * 2 * Math.PI));
  const incidents = INCIDENTS.reduce((sum, i) => sum + i.peak * bump(x, i.x, i.width), 0);
  return clamp(0.5 + diurnal + 0.2 * Math.sin(index * 0.000_013) + incidents, 0, 30);
}
export function latencyAt(index: number) {
  const x = index / (LOG_COUNT - 1);
  const { weight } = incidentWeight(x);
  return 120 + 40 * Math.sin(x * 190) + 2400 * weight;
}
export interface LogLine {
  time: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  service: (typeof SERVICES)[number];
  route: string;
  status: number;
  latency: number;
  trace: string;
  message: string;
}
export function logAt(index: number): LogLine {
  const x = index / (LOG_COUNT - 1);
  const rate = errorRateAt(index);
  const roll = noise(index, 1) * 100;
  const level =
    roll < rate ? 'ERROR' : roll < rate * 2.5 + 3 ? 'WARN' : roll > 91 ? 'DEBUG' : 'INFO';
  const { weight, incident } = incidentWeight(x);
  const service =
    level === 'ERROR' && noise(index, 2) < weight * 0.95
      ? incident.service
      : pick(SERVICES, noise(index, 3));
  const status =
    level === 'ERROR'
      ? pick([500, 502, 503, 504], noise(index, 4))
      : level === 'WARN'
        ? pick([429, 404, 499, 408], noise(index, 4))
        : pick([200, 200, 200, 200, 200, 201, 204, 304], noise(index, 4));
  const slow = 1 + weight * 12;
  const latency =
    level === 'ERROR' && status === 504
      ? 3000 + Math.round(noise(index, 5) * 27_000)
      : Math.round(clamp(18 * Math.exp(0.9 * gaussian(index, 6)) * slow, 1, 29_000));
  return {
    time: new Date(LOG_START + x * (LOG_END - LOG_START - 1)).toISOString(),
    level,
    service,
    route: pick(ROUTES[service], noise(index, 7)),
    status,
    latency,
    trace: Math.floor(noise(index, 8) * 0xffffffff)
      .toString(16)
      .padStart(8, '0'),
    message: pick(MESSAGES[level], noise(index, 9)),
  };
}
export function logIndexAt(time: number) {
  return Math.ceil(((time - LOG_START) / (LOG_END - LOG_START - 1)) * (LOG_COUNT - 1));
}

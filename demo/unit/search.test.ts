import { afterAll, beforeAll, expect, it } from 'vitest';
import { logs } from '../src/datasets/logs';
import { genome } from '../src/datasets/genome';
import { signal } from '../src/datasets/signal';
import { DEFAULT_LATENCY, setLatency } from '../src/data/latency';
import { logAt } from '../src/data/logs';
import { gcAt } from '../src/data/genome';
import { stars } from '../src/datasets/stars';
import { market } from '../src/datasets/market';
import { syntheticProvider } from '../src/data/synthetic';
import { parseTrace, traceProvider } from '../src/data/trace';
import { parseJump } from '../../granum-grid/src/core/navigation';
import type { DataProvider } from 'granum-grid';

const signalProvider = signal.provider;

const context = () => ({ fromIndex: 0, limit: 100, signal: new AbortController().signal });
beforeAll(() => setLatency(0));
afterAll(() => setLatency(DEFAULT_LATENCY));

it('finds verified auth log rows beyond the two named markers', async () => {
  const result = await logs.provider.search!({ kind: 'text', value: '  AuTh  ' }, context());
  expect(result.matches).toHaveLength(100);
  expect(result.complete).toBe(false);
  expect(new Set(result.matches.map((m) => m.index)).size).toBe(100);
  for (const match of result.matches) {
    const row = logAt(match.index);
    expect(
      [row.service, row.level, row.route, row.message, row.trace].join(' ').toLowerCase(),
    ).toContain('auth');
  }
});

it('uses case-insensitive text equality consistently in the signal provider', async () => {
  const result = await signalProvider.search!(
    { kind: 'predicate', field: 'category', operator: '=', value: 'north' },
    context(),
  );
  expect(result.matches.length).toBeGreaterThan(0);
  expect(result.matches.every((m) => m.index % 4 === 0)).toBe(true);
});

it('does not claim a gene landmark exhausts matching base rows', async () => {
  const result = await genome.provider.search!(
    { kind: 'predicate', field: 'gene', operator: '=', value: 'TP53' },
    context(),
  );
  expect(result.matches.length).toBeGreaterThan(0);
  expect(result.complete).toBe(false);
});

it('excludes missing numeric values even from inequality results', async () => {
  const result = await genome.provider.search!(
    { kind: 'predicate', field: 'gc', operator: '!=', value: 50 },
    context(),
  );
  expect(result.matches.length).toBeGreaterThan(0);
  expect(result.matches.every((m) => gcAt(m.index) !== null)).toBe(true);
});

it.each(['gateway', 'auth', 'orders', 'payments', 'search', 'cdn'])(
  'finds verified %s service predicates',
  async (service) => {
    const result = await logs.provider.search!(
      { kind: 'predicate', field: 'service', operator: '=', value: service.toUpperCase() },
      context(),
    );
    expect(result.matches).toHaveLength(100);
    expect(result.matches.every((m) => logAt(m.index).service === service)).toBe(true);
  },
);

it.each([
  ['oauth', 'route'],
  ['connection refused', 'message'],
  ['error', 'level'],
] as const)('finds log text in the %s query', async (value, field) => {
  const result = await logs.provider.search!({ kind: 'text', value }, context());
  expect(result.matches.length).toBeGreaterThan(0);
  expect(result.matches.every((m) => logAt(m.index)[field].toLowerCase().includes(value))).toBe(
    true,
  );
});

it('retains partial coverage for empty samples and honors cancellation', async () => {
  const result = await logs.provider.search!(
    { kind: 'text', value: 'nonexistent-service' },
    context(),
  );
  expect(result).toMatchObject({ matches: [], complete: false });
  const controller = new AbortController();
  const pending = logs.provider.search!(
    { kind: 'text', value: 'nonexistent-service' },
    { ...context(), signal: controller.signal },
  );
  controller.abort();
  await expect(pending).rejects.toThrow();
});

async function verifyText<Row>(
  provider: DataProvider<Row>,
  value: string,
  matchesRow: (row: Row) => boolean,
) {
  const result = await provider.search!({ kind: 'text', value }, context());
  expect(result.matches.length).toBeGreaterThan(0);
  for (const match of result.matches.slice(0, 5)) {
    const [row] = await provider.fetchRows(match.index, 1, context().signal);
    expect(matchesRow(row)).toBe(true);
  }
}
it('verifies plain-text matches against genome, star, market, and signal rows', async () => {
  await verifyText(genome.provider, 'brca1', (row) =>
    row.region.label.toLowerCase().includes('brca1'),
  );
  await verifyText(stars.provider, 'vega', (row) => row.name === 'Vega');
  await verifyText(market.provider, 'sell', (row) => row.side === 'SELL');
  await verifyText(signalProvider, 'east', (row) => row.category === 'East');
});

it('keeps every advertised demo search usable and every address in bounds', async () => {
  const providers: DataProvider<unknown>[] = [
    logs.provider,
    genome.provider,
    stars.provider,
    market.provider,
    signalProvider,
  ];
  for (const provider of providers) {
    for (const example of provider.searchHelp!.examples) {
      const parsed = parseJump(example, provider.rowCount, 0, []);
      expect(parsed.kind, example).toBe('provider');
      if (parsed.kind !== 'provider') throw new Error('Expected a provider query');
      const result = await provider.search!(parsed.query, context());
      expect(result.matches.length, `${provider.id}: ${example}`).toBeGreaterThan(0);
      for (const { index } of result.matches)
        expect(Number.isSafeInteger(index) && index >= 0 && index < provider.rowCount).toBe(true);
    }
  }
});

it('bounds text work and marks truncated direct lookups incomplete', async () => {
  let reads = 0;
  const provider = syntheticProvider({
    id: 'logs',
    metric: undefined,
    rowAt: () => 'row',
    markers: [],
    chapters: [],
    search: {
      examples: [],
      fields: {
        name: {
          kind: 'text',
          read: () => {
            reads++;
            return 'row';
          },
        },
      },
      label: () => 'row',
      lookup: () => ({
        complete: true,
        matches: [0, 1].map((index) => ({
          id: String(index),
          index,
          label: 'row',
          kind: 'search',
        })),
      }),
    },
  });
  expect(await provider.search!({ kind: 'text', value: 'missing' }, context())).toMatchObject({
    matches: [],
    complete: false,
  });
  expect(reads).toBeLessThanOrEqual(20_000);
  expect(
    await provider.search!(
      { kind: 'predicate', field: 'name', operator: '=', value: 'row' },
      { ...context(), limit: 1 },
    ),
  ).toMatchObject({ complete: false, matches: [{ index: 0 }] });
});

it('searches recorded event text, reports truncation, and rejects unsupported queries', async () => {
  const provider = traceProvider(
    parseTrace(
      JSON.stringify([
        { name: 'Layout', ph: 'X', ts: 0, dur: 3000, pid: 1, tid: 2 },
        { name: 'Layout', ph: 'X', ts: 5000, dur: 3000, pid: 1, tid: 2 },
      ]),
    ),
    'test',
  );
  expect(
    await provider.search!({ kind: 'text', value: ' lay ' }, { ...context(), limit: 1 }),
  ).toMatchObject({ complete: false, matches: [{ index: 0 }] });
  expect(
    await provider.search!(
      { kind: 'predicate', field: 'name', operator: '=', value: 'layout' },
      context(),
    ),
  ).toMatchObject({ complete: true, matches: [{ index: 0 }, { index: 1 }] });
  await expect(
    provider.search!({ kind: 'predicate', field: 'name', operator: '>', value: 'x' }, context()),
  ).rejects.toThrow('Use name');
  await expect(provider.search!({ kind: 'date', value: '2026' }, context())).rejects.toThrow(
    'does not support date',
  );
});

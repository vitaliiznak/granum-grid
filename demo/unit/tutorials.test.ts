import { expect, it } from 'vitest';
import { inventory } from '../src/tutorials/inventory';
import { sensors } from '../src/tutorials/sensors';
import { logs } from '../src/tutorials/logs';

const signal = new AbortController().signal;
it('the inventory lesson maps visible row 60 to the correct product', async () => {
  expect(inventory.rowCount).toBe(120);
  expect(await inventory.fetchRows(59, 1, signal)).toEqual([
    { sku: 'SKU-060', name: 'Folder', stock: 13 },
  ]);
});

it('sensor summaries cover their range without gaps and retain the warm interval', async () => {
  const whole = await sensors.fetchOverview!(7, signal);
  expect(whole).toHaveLength(7);
  expect(whole[0].start).toBe(0);
  expect(whole.at(-1)!.end).toBe(1440);
  expect(whole.reduce((count, bucket) => count + bucket.count!, 0)).toBe(1440);
  for (let i = 1; i < whole.length; i++) expect(whole[i].start).toBe(whole[i - 1].end);
  expect(Math.max(...whole.map((bucket) => bucket.max!))).toBe(40);
  expect(await sensors.fetchAggregates!({ start: 720, end: 740, buckets: 1 }, signal)).toEqual([
    { start: 720, end: 740, count: 20, avg: 40, min: 40, max: 40, accuracy: 'exact' },
  ]);
  expect(await sensors.fetchAggregates!({ start: 719, end: 721, buckets: 1 }, signal)).toEqual([
    { start: 719, end: 721, count: 2, avg: 30, min: 20, max: 40, accuracy: 'exact' },
  ]);
  await expect(sensors.fetchOverview!(513, signal)).rejects.toThrow(RangeError);
});

it('log search distinguishes complete, truncated, empty, invalid, and aborted queries', async () => {
  const context = { limit: 100, fromIndex: 0, signal };
  const errors = await logs.search!(
    { kind: 'predicate', field: 'status', operator: '>=', value: 500 },
    context,
  );
  expect(errors.complete).toBe(true);
  expect(errors.matches).toHaveLength(20);
  expect(errors.matches.at(-1)!.index).toBe(570);
  const auth = await logs.search!({ kind: 'text', value: 'auth' }, context);
  expect(auth.complete).toBe(false);
  expect(auth.matches).toHaveLength(100);
  expect((await logs.search!({ kind: 'text', value: 'unavailable' }, context)).complete).toBe(true);
  expect(await logs.search!({ kind: 'text', value: 'missing-service' }, context)).toEqual({
    matches: [],
    complete: true,
  });
  await expect(logs.search!({ kind: 'date', value: '2026-10' }, context)).rejects.toThrow(
    'Dates are not supported',
  );
  await expect(
    logs.search!({ kind: 'predicate', field: 'status', operator: '>=', value: 'oops' }, context),
  ).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(
    logs.search!({ kind: 'text', value: 'auth' }, { ...context, signal: controller.signal }),
  ).rejects.toThrow();
});

import { expect, it } from 'vitest';
import { decodeView, encodeView, type SavedView } from '../src/core/exploration';
import { createEngine } from '../src/core/engine';
import { clusterMarkers } from '../src/react/MarkerLayer';
import { rangeProvider } from '../src/data/range';

it('restores only valid locations and selections from the same ordered revision', () => {
  const provider = { id: 'a', revision: '1', rowCount: 100 };
  const view: SavedView = {
    version: 1,
    dataset: 'a',
    revision: '1',
    location: { position: 12.5, view: 'lens', rowsPerPixel: 1 },
    selection: { start: 10, end: 20 },
  };
  expect(decodeView(encodeView(view), provider)).toEqual(view);
  expect(decodeView(encodeView(view), { ...provider, revision: '2' })).toBeNull();
  expect(
    decodeView(encodeView({ ...view, selection: { start: 90, end: 101 } }), provider),
  ).toBeNull();
  expect(decodeView('%not-json', provider)).toBeNull();
  expect(
    decodeView(
      encodeView({ ...view, location: { ...view.location, position: Infinity } }),
      provider,
    ),
  ).toBeNull();
});
it('bounds dense rail groups by screen height while preserving all events', () => {
  const markers = Array.from({ length: 4096 }, (_, i) => ({
    id: String(i),
    index: i * 20000,
    label: String(i),
    kind: 'event' as const,
  }));
  const groups = clusterMarkers(markers, 100_000_000, 500);
  expect(groups.length).toBeLessThanOrEqual(19);
  expect(groups.flat()).toEqual(markers);
});
it('append preserves the current address and follows only from the end', () => {
  const engine = createEngine({ rowCount: 100, rowHeight: 40 });
  engine.goTo(20);
  engine.appendRows(120, true);
  expect(engine.getSnapshot().position).toBe(20);
  engine.scrollToIndex(119, { align: 'end' });
  engine.appendRows(130, true);
  expect(engine.rowSizes.distance(engine.getSnapshot().position, 130)).toBeCloseTo(
    engine.getSnapshot().height,
  );
  expect(() => engine.appendRows(100)).toThrow();
});
it('range providers translate local requests and aggregate addresses without scanning', async () => {
  const calls: number[] = [];
  const resolutions: number[] = [];
  const provider = rangeProvider(
    {
      id: 'a',
      revision: '1',
      rowCount: 1000,
      async fetchRows(start, count) {
        calls.push(start);
        return Array.from({ length: count }, (_, i) => start + i);
      },
      async fetchAggregates(range) {
        resolutions.push(range.buckets);
        return [
          {
            ...range,
            count: range.end - range.start,
            avg: 1,
            min: 1,
            max: 1,
            accuracy: 'exact' as const,
          },
        ];
      },
    },
    { start: 200, end: 250 },
  );
  expect(await provider.fetchRows(10, 2, new AbortController().signal)).toEqual([210, 211]);
  expect(calls).toEqual([210]);
  expect((await provider.fetchOverview!(320, new AbortController().signal))[0]).toMatchObject({
    start: 0,
    end: 50,
  });
  await provider.fetchAggregates!(
    { start: 10, end: 12, buckets: 160 },
    new AbortController().signal,
  );
  expect(resolutions).toEqual([50, 2]);
});

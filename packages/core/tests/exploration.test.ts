import { expect, it } from 'vitest';
import { decodeView, encodeView, type SavedView } from '../src/core/exploration';
import { createEngine } from '../src/core/engine';
import type { Marker } from '../src/data/types';
import { clusterMarkers, leadMarker } from '../src/map/markers';

it('restores only valid locations and selections from the same ordered revision', () => {
  const provider = { id: 'a', revision: '1', rowCount: 100 };
  const view: SavedView = {
    version: 1,
    dataset: 'a',
    revision: '1',
    location: { position: 12.5 },
    selection: { start: 10, end: 20 },
  };
  expect(decodeView(encodeView(view), provider)).toEqual(view);
  expect(decodeView(encodeView(view), { ...provider, revision: '2' })).toBeNull();
  expect(
    decodeView(encodeView({ ...view, selection: { start: 90, end: 101 } }), provider),
  ).toBeNull();
  // Links to the removed view are unsupported, just like any unknown mode.
  for (const mode of ['zoom', 'lens']) {
    const legacy = { ...view, location: { ...view.location, view: mode, rowsPerPixel: 1 } };
    expect(decodeView(encodeView(legacy), provider)).toBeNull();
  }
  const legacyRows = {
    ...view,
    location: { ...view.location, view: 'rows', rowsPerPixel: 1 / 32 },
  };
  expect(decodeView(encodeView(legacyRows), provider)).toEqual(view);
  expect(decodeView('%not-json', provider)).toBeNull();
  expect(
    decodeView(
      encodeView({ ...view, location: { ...view.location, position: Infinity } }),
      provider,
    ),
  ).toBeNull();
});
it('bounds dense rail groups by screen height while preserving all markers', () => {
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
/** A marker `px` CSS px down a 500 px rail over 500,001 rows. */
const at = (id: string, px: number, kind: Marker['kind'] = 'event'): Marker => ({
  id,
  index: px * 1000,
  label: id,
  kind,
});
it('groups rail markers by distance in row order, not by fixed bins', () => {
  // 27 px and 29 px straddle a 28 px bin edge but would overlap on screen.
  const straddling = [at('a', 27), at('b', 29), at('c', 60)];
  expect(clusterMarkers(straddling, 500_001, 500).map((g) => g.map((m) => m.id))).toEqual([
    ['a', 'b'],
    ['c'],
  ]);
  // Search hits are appended after provider markers; groups still follow row order.
  const appended = [at('deploy', 100), at('later', 300), at('hit', 110, 'search')];
  expect(clusterMarkers(appended, 500_001, 500).map((g) => g.map((m) => m.id))).toEqual([
    ['deploy', 'hit'],
    ['later'],
  ]);
});
it('names a rail group after its most severe marker', () => {
  const marker = (id: string, kind: Marker['kind']): Marker => ({ id, index: 0, label: id, kind });
  const deploy = marker('Deploy search v3.1', 'event');
  const incident = marker('INC-2057 · cache stampede', 'error');
  expect(leadMarker([deploy, incident])).toBe(incident);
  expect(leadMarker([marker('first', 'event'), marker('second', 'event')]).id).toBe('first');
  expect(leadMarker([marker('hit', 'search'), deploy])).toBe(deploy);
  // A reader's bookmark outranks a deploy but not an incident.
  const saved = marker('Before the stampede', 'bookmark');
  expect(leadMarker([deploy, saved])).toBe(saved);
  expect(leadMarker([saved, incident])).toBe(incident);
  // A host's own kind ranks like an event: after incidents and bookmarks, before search hits.
  const release = marker('Release 4.2', 'release');
  expect(leadMarker([release, incident])).toBe(incident);
  expect(leadMarker([release, saved])).toBe(saved);
  expect(leadMarker([marker('hit', 'search'), release])).toBe(release);
  expect(leadMarker([release, deploy])).toBe(release);
});
it('numbers a rail group by the marker that names it, not by how many it holds', () => {
  // A group of three named for its second marker (an incident), then a lone marker.
  const groups = clusterMarkers(
    [at('deploy', 100), at('incident', 105, 'error'), at('restart', 110), at('later', 300)],
    500_001,
    500,
  );
  // The rail number is the named marker's one-based place in row order, as in Bookmarks.
  const places = groups.flat();
  expect(groups.map((group) => places.indexOf(leadMarker(group)) + 1)).toEqual([2, 4]);
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

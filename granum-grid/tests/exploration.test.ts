import { expect, it } from 'vitest';
import {
  bookmarkMarkers,
  decodeView,
  encodeView,
  readBookmarks,
  writeBookmarks,
  type Bookmark,
  type SavedView,
} from '../src/core/exploration';
import { createEngine } from '../src/core/engine';
import type { Marker } from '../src/data/types';
import { clusterMarkers, leadMarker, railGroupNumber } from '../src/react/MarkerLayer';

it('restores only valid locations and selections from the same ordered revision', () => {
  const provider = { id: 'a', revision: '1', rowCount: 100 };
  const view: SavedView = {
    version: 1,
    dataset: 'a',
    revision: '1',
    location: { position: 12.5, view: 'zoom', rowsPerPixel: 1 },
    selection: { start: 10, end: 20 },
  };
  expect(decodeView(encodeView(view), provider)).toEqual(view);
  expect(decodeView(encodeView(view), { ...provider, revision: '2' })).toBeNull();
  expect(
    decodeView(encodeView({ ...view, selection: { start: 90, end: 101 } }), provider),
  ).toBeNull();
  // Links to the removed view are unsupported, just like any unknown mode.
  expect(decodeView(encodeView(view).replace('zoom', 'lens'), provider)).toBeNull();
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
it('groups rail markers by distance in row order, not by fixed bins', () => {
  const at = (id: string, px: number, kind: Marker['kind'] = 'event'): Marker => ({
    id,
    index: px * 1000,
    label: id,
    kind,
  });
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
});
it('numbers a rail group by the marker that names it, not by how many it holds', () => {
  // A group of three that starts at place 1 and is named for its second marker is 2, then 4.
  expect(railGroupNumber(1, 1)).toBe(2);
  expect(railGroupNumber(4, 0)).toBe(4);
});
it('places bookmarks on the map at their selection or saved position', () => {
  const bookmark = (id: string, position: number, selection: Bookmark['selection']): Bookmark => ({
    version: 1,
    dataset: 'a',
    revision: '1',
    location: { position, view: 'zoom', rowsPerPixel: 4 },
    selection,
    id,
    name: `Saved ${id}`,
  });
  expect(
    bookmarkMarkers([bookmark('x', 41.7, null), bookmark('y', 10, { start: 90, end: 95 })]),
  ).toEqual([
    { id: 'bookmark:x', index: 41, label: 'Saved x', kind: 'bookmark' },
    { id: 'bookmark:y', index: 90, label: 'Saved y', kind: 'bookmark' },
  ]);
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
it('saving bookmarks under a shared key keeps other datasets and revisions', () => {
  const a = { id: 'a', revision: '1', rowCount: 100 };
  const mark = (dataset: string, revision: string, id: string): Bookmark => ({
    version: 1,
    dataset,
    revision,
    location: { position: 5, view: 'rows', rowsPerPixel: 1 / 32 },
    selection: null,
    id,
    name: id,
  });
  const stored = JSON.stringify([
    mark('b', '1', 'other'),
    mark('a', '0', 'old'),
    mark('a', '1', 'x'),
  ]);
  expect(readBookmarks(stored, a).map((b) => b.id)).toEqual(['x']);
  const saved = writeBookmarks(stored, [mark('a', '1', 'new')], a);
  expect(JSON.parse(saved).map((b: Bookmark) => b.id)).toEqual(['new', 'other', 'old']);
  expect(readBookmarks(saved, { id: 'b', revision: '1', rowCount: 100 }).map((b) => b.id)).toEqual([
    'other',
  ]);
  // Bookmarks beyond the first 40 stored entries still load for this dataset.
  const crowded = JSON.stringify([
    ...Array.from({ length: 45 }, (_, i) => mark('b', '1', `b${i}`)),
    mark('a', '1', 'mine'),
  ]);
  expect(readBookmarks(crowded, a).map((b) => b.id)).toEqual(['mine']);
  // Foreign entries are trimmed before the stored text would become unreadable.
  const foreign = (i: number) => mark('b', '1', `b${String(i).padStart(4, '0')}`);
  const fits = Math.floor(99_999 / (JSON.stringify(foreign(0)).length + 1));
  const full = JSON.stringify(Array.from({ length: fits }, (_, i) => foreign(i)));
  expect(full.length).toBeLessThanOrEqual(100_000);
  const trimmed = writeBookmarks(full, [mark('a', '1', 'keep')], a);
  const ids = JSON.parse(trimmed).map((b: Bookmark) => b.id);
  expect(trimmed.length).toBeLessThanOrEqual(100_000);
  expect(ids.length).toBeLessThan(fits + 1);
  expect(ids.slice(0, 2)).toEqual(['keep', 'b0000']);
  expect(readBookmarks(trimmed, a).map((b) => b.id)).toEqual(['keep']);
  expect(readBookmarks('not json', a)).toEqual([]);
});

import { expect, it } from 'vitest';
import {
  bookmarkMarkers,
  readBookmarks,
  writeBookmarks,
  type Bookmark,
} from '../src/explorer/bookmarks';

it('places bookmarks on the map at their selection or saved position', () => {
  const bookmark = (id: string, position: number, selection: Bookmark['selection']): Bookmark => ({
    version: 1,
    dataset: 'a',
    revision: '1',
    location: { position },
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
it('saving bookmarks under a shared key keeps other datasets and revisions', () => {
  const a = { id: 'a', revision: '1', rowCount: 100 };
  const mark = (dataset: string, revision: string, id: string): Bookmark => ({
    version: 1,
    dataset,
    revision,
    location: { position: 5 },
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

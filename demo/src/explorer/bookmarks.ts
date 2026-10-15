import { readView, type SavedView } from '@granum-grid/core';
import type { Marker } from '@granum-grid/react';

/** A saved view with a reader-given name. The playground stores these in localStorage. */
export interface Bookmark extends SavedView {
  id: string;
  name: string;
}
type ProviderIdentity = { id: string; revision: string; rowCount: number };

export const MAX_BOOKMARKS = 40;
const MAX_STORED_LENGTH = 100_000;
function parseStored(raw: string | null): unknown[] {
  if (!raw || raw.length > MAX_STORED_LENGTH) return [];
  try {
    const values = JSON.parse(raw);
    return Array.isArray(values) ? values : [];
  } catch {
    return [];
  }
}
function readBookmark(value: unknown, provider: ProviderIdentity): Bookmark | null {
  const { id, name } = (value ?? {}) as { id?: unknown; name?: unknown };
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  const saved = readView(value, provider);
  return saved && { ...saved, id: id.slice(0, 128), name: name.slice(0, 80) };
}
/** One storage key may hold bookmarks for several datasets and revisions. */
export function readBookmarks(raw: string | null, provider: ProviderIdentity): Bookmark[] {
  return parseStored(raw)
    .flatMap((value) => readBookmark(value, provider) ?? [])
    .slice(0, MAX_BOOKMARKS);
}
/** Bookmarks as map markers. A range bookmark marks its first row. */
export function bookmarkMarkers(bookmarks: readonly Bookmark[]): Marker[] {
  return bookmarks.map((bookmark) => ({
    id: `bookmark:${bookmark.id}`,
    index: bookmark.selection?.start ?? Math.floor(bookmark.location.position),
    label: bookmark.name,
    kind: 'bookmark',
  }));
}
/** Replace this dataset's bookmarks and keep entries that belong to any other. */
export function writeBookmarks(
  raw: string | null,
  bookmarks: readonly Bookmark[],
  provider: ProviderIdentity,
): string {
  const others = parseStored(raw).filter((value) => !readBookmark(value, provider));
  let text = JSON.stringify([...bookmarks, ...others]);
  // Stay readable: drop the oldest foreign entries rather than exceed the load limit.
  while (text.length > MAX_STORED_LENGTH && others.length) {
    others.pop();
    text = JSON.stringify([...bookmarks, ...others]);
  }
  return text;
}

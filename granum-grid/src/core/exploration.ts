import type { NavigationLocation } from './engine.js';
import type { Marker, RowRange } from '../data/types.js';
import { validRange } from '../data/bounds.js';

export interface SavedView {
  version: 1;
  dataset: string;
  revision: string;
  location: NavigationLocation;
  selection: RowRange | null;
}
export interface Bookmark extends SavedView {
  id: string;
  name: string;
}
export function encodeView(view: SavedView): string {
  return encodeURIComponent(JSON.stringify(view));
}
type ProviderIdentity = { id: string; revision: string; rowCount: number };
/**
 * A copy of a parsed link, stored bookmark, or host view for this ordered revision, or null
 * when it belongs to another revision or any field is malformed.
 */
export function readView(value: unknown, provider: ProviderIdentity): SavedView | null {
  // Unchecked shape: every field is validated below before it is used.
  const view = value as {
    version?: unknown;
    dataset?: unknown;
    revision?: unknown;
    location?: { position: number; view?: unknown } | null;
    selection?: RowRange | null;
  } | null;
  const loc = view?.location;
  if (
    view?.version !== 1 ||
    view.dataset !== provider.id ||
    view.revision !== provider.revision ||
    !loc ||
    !Number.isFinite(loc.position) ||
    loc.position < 0 ||
    // A tall final row can have a fractional leading address past its integer index.
    (provider.rowCount === 0 ? loc.position !== 0 : loc.position >= provider.rowCount) ||
    // Older row bookmarks remain valid; removed reading modes do not.
    (loc.view !== undefined && loc.view !== 'rows') ||
    (view.selection !== null && (!view.selection || !validRange(view.selection, provider.rowCount)))
  )
    return null;
  return {
    version: 1,
    dataset: provider.id,
    revision: provider.revision,
    location: { position: loc.position },
    selection:
      view.selection === null ? null : { start: view.selection.start, end: view.selection.end },
  };
}
/** Reject links/bookmarks for another ordered revision, including malformed input. */
export function decodeView(
  text: string,
  provider: { id: string; revision: string; rowCount: number },
): SavedView | null {
  try {
    if (text.length > 8192) return null;
    return readView(JSON.parse(decodeURIComponent(text)), provider);
  } catch {
    return null;
  }
}
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

import type { NavigationLocation } from './engine.js';
import type { RowRange } from '../data/types.js';

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
export function validRange(range: RowRange, count: number): boolean {
  return (
    Number.isSafeInteger(range.start) &&
    Number.isSafeInteger(range.end) &&
    range.start >= 0 &&
    range.end > range.start &&
    range.end <= count
  );
}
export function encodeView(view: SavedView): string {
  return encodeURIComponent(JSON.stringify(view));
}
/** Reject links/bookmarks for another ordered revision, including malformed input. */
export function decodeView(
  text: string,
  provider: { id: string; revision: string; rowCount: number },
): SavedView | null {
  try {
    if (text.length > 8192) return null;
    const value = JSON.parse(decodeURIComponent(text));
    const loc = value?.location;
    if (
      value?.version !== 1 ||
      value.dataset !== provider.id ||
      value.revision !== provider.revision ||
      !loc ||
      !Number.isFinite(loc.position) ||
      loc.position < 0 ||
      loc.position > Math.max(0, provider.rowCount - 1) ||
      !['rows', 'lens', 'zoom'].includes(loc.view) ||
      !Number.isFinite(loc.rowsPerPixel) ||
      loc.rowsPerPixel <= 0 ||
      (value.selection !== null &&
        (!value.selection || !validRange(value.selection, provider.rowCount)))
    )
      return null;
    return {
      version: 1,
      dataset: provider.id,
      revision: provider.revision,
      location: { position: loc.position, view: loc.view, rowsPerPixel: loc.rowsPerPixel },
      selection:
        value.selection === null
          ? null
          : { start: value.selection.start, end: value.selection.end },
    };
  } catch {
    return null;
  }
}

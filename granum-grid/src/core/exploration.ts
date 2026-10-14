import type { NavigationLocation } from './engine.js';
import type { RowRange } from '../data/types.js';
import { validRange } from '../data/bounds.js';

export interface SavedView {
  version: 1;
  dataset: string;
  revision: string;
  location: NavigationLocation;
  selection: RowRange | null;
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

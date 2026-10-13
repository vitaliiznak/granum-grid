import type { Chapter, Marker, ProviderQuery } from '../data/types.js';

/**
 * The chapter containing `position`. Chapters are sorted and non-overlapping (the data
 * session validates them), so this is a binary search rather than a scan per frame.
 */
export function chapterAt(chapters: readonly Chapter[], position: number): Chapter | undefined {
  let low = 0,
    high = chapters.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (chapters[middle].start <= position) low = middle + 1;
    else high = middle;
  }
  const chapter = chapters[low - 1];
  return chapter && position < chapter.end ? chapter : undefined;
}
export type JumpTarget =
  | { kind: 'index'; index: number; label: string }
  | { kind: 'provider'; query: ProviderQuery }
  | { kind: 'error'; message: string };
export function parseJump(
  input: string,
  count: number,
  position: number,
  markers: Marker[],
): JumpTarget {
  const text = input.trim();
  if (!count) return { kind: 'error', message: 'This dataset has no rows.' };
  if (/^\d+(?:,\d{3})*$/.test(text)) {
    const row = Number(text.replaceAll(',', ''));
    return Number.isSafeInteger(row) && row >= 1 && row <= count
      ? { kind: 'index', index: row - 1, label: `Row ${row.toLocaleString()}` }
      : { kind: 'error', message: `Enter a row from 1 to ${count.toLocaleString()}.` };
  }
  if (/^\d+(?:\.\d+)?%$/.test(text)) {
    const percent = Number(text.slice(0, -1));
    if (percent > 100) return { kind: 'error', message: 'Enter a percentage from 0% to 100%.' };
    const index = Math.round((percent / 100) * (count - 1));
    return { kind: 'index', index, label: `${percent}% · Row ${(index + 1).toLocaleString()}` };
  }
  const markerQuery = /^(next|previous)\s+(spike|error|event|bookmark|marker)$/i.exec(text);
  if (markerQuery) {
    const matching = markers.filter(
      (m) => markerQuery[2].toLowerCase() === 'marker' || m.kind === markerQuery[2].toLowerCase(),
    );
    const marker =
      markerQuery[1].toLowerCase() === 'next'
        ? matching.find((m) => m.index > position)
        : matching.findLast((m) => m.index < position);
    return marker
      ? { kind: 'index', index: marker.index, label: marker.label }
      : { kind: 'error', message: 'No further matching markers.' };
  }
  const date = /^(?:date\s+)?(\d{4}(?:-\d{2}){0,2})$/i.exec(text);
  if (date) {
    const parts = date[1].split('-').map(Number),
      year = parts[0],
      month = parts[1] ?? 1,
      day = parts[2] ?? 1;
    const parsed = new Date(
      `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`,
    );
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() + 1 !== month ||
      parsed.getUTCDate() !== day
    )
      return { kind: 'error', message: 'Enter a valid date, such as 2017-03.' };
    return { kind: 'provider', query: { kind: 'date', value: date[1] } };
  }
  const predicate = /^([a-zA-Z_][\w.]*)\s*(>=|<=|!=|>|<|=)\s*(-?\d+(?:\.\d+)?|"[^"\n]+")$/.exec(
    text,
  );
  if (predicate)
    return {
      kind: 'provider',
      query: {
        kind: 'predicate',
        field: predicate[1],
        operator: predicate[2] as '>',
        value: predicate[3].startsWith('"') ? predicate[3].slice(1, -1) : Number(predicate[3]),
      },
    };
  if (text && !/[<>=!]/.test(text))
    return { kind: 'provider', query: { kind: 'text', value: text } };
  return {
    kind: 'error',
    message: text
      ? 'Try a row number, a percentage, an event name, or a suggested search.'
      : 'Where would you like to go?',
  };
}

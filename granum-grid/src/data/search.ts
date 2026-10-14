import type { ProviderQuery, SearchHelp } from './types.js';

/** Shown when a text query can only match named markers. */
export const MARKERS_ONLY_SEARCH =
  'Searching named markers only. This provider does not support row text search.';

/** Early user feedback only; not a replacement for provider validation. */
export function searchIssue(query: ProviderQuery, help?: SearchHelp): string | null {
  if (query.kind === 'text') return help?.text ? null : MARKERS_ONLY_SEARCH;
  if (query.kind === 'date')
    return help?.dates === false ? 'This dataset does not support date search.' : null;
  if (!help?.fields) return null;
  const field = help.fields.find((item) => item.name === query.field);
  if (!field)
    return `Searchable fields: ${help.fields.map((item) => item.name).join(', ') || 'none'}.`;
  if (!field.operators.includes(query.operator))
    return `Use ${field.name} with ${field.operators.join(', ')}.`;
  if (typeof query.value !== (field.type === 'number' ? 'number' : 'string'))
    return `${field.name} requires ${field.type === 'number' ? 'a number' : 'text in double quotes'}.`;
  return null;
}

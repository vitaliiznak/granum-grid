import type { ProviderQuery, SearchHelp } from './types.js';

/** Early user feedback only; not a replacement for provider validation. */
export function searchIssue(query: ProviderQuery, help?: SearchHelp): string | null {
  if (query.kind === 'text')
    return help?.text ? null : 'Row text search is unavailable; searching named markers only.';
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

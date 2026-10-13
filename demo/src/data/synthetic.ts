import type {
  Chapter,
  DataProvider,
  Marker,
  ProviderQuery,
  SearchContext,
  SearchResult,
} from 'deepscroll';
import { delay } from './provider';
import { aggregate, overviewTracks } from './worker-client';
import { models } from './models';

type Predicate = Extract<ProviderQuery, { kind: 'predicate' }>;
export interface SearchField {
  kind: 'number' | 'text';
  read(index: number): number | string;
}
export interface SyntheticSearch {
  fields: Record<string, SearchField>;
  examples: string;
  /** Exact answers that need no scan, such as a named gene. */
  lookup?(query: Predicate): Marker[] | null;
  /** Row address for a date query, or null when outside the dataset. */
  date?(text: string): number | null;
  /** i-th row to check; defaults to an even stride from the current position. */
  candidate?(query: Predicate, i: number, from: number): number;
  label(index: number, field: string, value: number | string): string;
}
export function compare(
  value: number | string,
  operator: Predicate['operator'],
  target: number | string,
) {
  return operator === '>'
    ? value > target
    : operator === '>='
      ? value >= target
      : operator === '<'
        ? value < target
        : operator === '<='
          ? value <= target
          : operator === '='
            ? String(value).toLowerCase() === String(target).toLowerCase()
            : String(value).toLowerCase() !== String(target).toLowerCase();
}
async function search(
  config: SyntheticSearch,
  rowCount: number,
  query: ProviderQuery,
  context: SearchContext,
): Promise<SearchResult> {
  await delay(context.signal);
  if (query.kind === 'date') {
    if (!config.date) throw new Error(`This dataset has no dates. Try ${config.examples}.`);
    const index = config.date(query.value);
    return {
      matches:
        index === null
          ? []
          : [{ id: `date-${query.value}`, index, label: query.value, kind: 'search' }],
      complete: true,
    };
  }
  const field = config.fields[query.field];
  if (!field)
    throw new Error(
      `Search supports ${Object.keys(config.fields).join(', ')}. Try ${config.examples}.`,
    );
  if (field.kind === 'number' && typeof query.value !== 'number')
    throw new Error(`${query.field} requires a number.`);
  if (
    field.kind === 'text' &&
    (typeof query.value !== 'string' || !['=', '!='].includes(query.operator))
  )
    throw new Error(`Use ${query.field} = "…" or ${query.field} != "…".`);
  const exact = config.lookup?.(query);
  if (exact) return { matches: exact.slice(0, context.limit), complete: true };
  const budget = 20_000,
    stride = Math.max(1, Math.floor(rowCount / budget)),
    from = Math.floor(context.fromIndex) + 1;
  const matches: Marker[] = [];
  for (let i = 0; i < budget && matches.length < context.limit; i++) {
    if (i % 512 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      context.signal.throwIfAborted();
    }
    const index = config.candidate
      ? config.candidate(query, i, from)
      : (from + i * stride + (i % 7)) % rowCount;
    if (index < 0) break;
    const value = field.read(index);
    if (compare(value, query.operator, query.value))
      matches.push({
        id: `result-${index}`,
        index,
        label: config.label(index, query.field, value),
        kind: 'search',
      });
  }
  return {
    matches,
    complete: false,
    message: 'Verified rows from a bounded sample; not an exhaustive search.',
  };
}
/** Deterministic provider over a model in ./models; rows are generated on demand. */
export function syntheticProvider<Row>(options: {
  id: string;
  metric: DataProvider<Row>['metric'];
  rowAt(index: number): Row;
  markers: Marker[];
  chapters: Chapter[];
  search: SyntheticSearch;
}): DataProvider<Row> {
  const model = models[options.id];
  return {
    id: options.id,
    revision: '1',
    rowCount: model.rowCount,
    metric: options.metric,
    async fetchRows(start, count, signal) {
      await delay(signal);
      return Array.from({ length: count }, (_, i) => options.rowAt(start + i));
    },
    async fetchOverview(buckets, signal) {
      await delay(signal);
      return aggregate(options.id, { start: 0, end: model.rowCount, buckets }, signal);
    },
    async fetchAggregates(range, signal) {
      await delay(signal);
      return aggregate(options.id, range, signal);
    },
    async fetchOverviewTracks(buckets, signal) {
      await delay(signal);
      return overviewTracks(options.id, buckets, signal);
    },
    async fetchMarkers(signal) {
      await delay(signal);
      return options.markers;
    },
    async fetchChapters(signal) {
      await delay(signal);
      return options.chapters;
    },
    search: (query, context) => search(options.search, model.rowCount, query, context),
  };
}

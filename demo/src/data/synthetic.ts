import type {
  Chapter,
  DataProvider,
  Marker,
  ProviderQuery,
  SearchContext,
  SearchResult,
} from 'granum-grid';
import { delay } from './latency';
import { aggregate, overviewTracks } from './worker-client';
import { models } from './models';
import {
  NUMBER_OPERATORS,
  TEXT_OPERATORS,
  checkPredicate,
  compare,
  dateResult,
  yieldToEventLoop,
  type Predicate,
} from './search';

interface SearchField {
  kind: 'number' | 'text';
  read(index: number): number | string;
}
interface SyntheticSearch {
  fields: Record<string, SearchField>;
  examples: readonly string[];
  /** Direct lookup, with explicit coverage for representative range starts. */
  lookup?(query: Predicate): SearchResult | null;
  /** Row address for a date query, or null when outside the dataset. */
  date?(text: string): number | null;
  /** i-th row to check; defaults to an even stride from the current position. */
  candidate?(query: Predicate, i: number, from: number): number;
  label(index: number, field: string, value: number | string): string;
}
async function search(
  config: SyntheticSearch,
  rowCount: number,
  markers: Marker[],
  query: ProviderQuery,
  context: SearchContext,
): Promise<SearchResult> {
  await delay(context.signal);
  if (query.kind === 'date') {
    if (!config.date) throw new Error(`This dataset has no dates. Try ${config.examples}.`);
    return dateResult(query.value, config.date(query.value));
  }
  const text = query.kind === 'text' ? query.value.trim().toLowerCase() : null;
  if (text === '') throw new Error('Enter text to search for.');
  const textFields = Object.entries(config.fields).filter(([, field]) => field.kind === 'text');
  if (query.kind === 'predicate') {
    const field = Object.hasOwn(config.fields, query.field)
      ? config.fields[query.field]
      : undefined;
    if (!field)
      throw new Error(
        `Search supports ${Object.keys(config.fields).join(', ')}. Try ${config.examples}.`,
      );
    checkPredicate(query, field.kind);
    const exact = config.lookup?.(query);
    if (exact)
      return {
        ...exact,
        matches: exact.matches.slice(0, context.limit),
        complete: exact.complete && exact.matches.length <= context.limit,
      };
  }
  const budget = 20_000,
    stride = Math.max(1, Math.floor(rowCount / budget)),
    from = Math.floor(context.fromIndex) + 1;
  const matches: Marker[] = [];
  // Include known locations, but verify row content independently of marker labels.
  const seeds = query.kind === 'text' ? markers.map((marker) => marker.index) : [];
  const seen = new Set<number>();
  for (let i = 0; i < budget + seeds.length && matches.length < context.limit; i++) {
    if (i % 512 === 0) await yieldToEventLoop(context.signal);
    const sample = i - seeds.length;
    const index =
      i < seeds.length
        ? seeds[i]
        : config.candidate && query.kind === 'predicate'
          ? config.candidate(query, sample, from)
          : (from + sample * stride + (sample % 7)) % rowCount;
    if (index < 0) break;
    if (seen.has(index)) continue;
    seen.add(index);
    const fieldName =
      query.kind === 'text'
        ? textFields.find(([, field]) =>
            String(field.read(index)).toLowerCase().includes(text!),
          )?.[0]
        : query.field;
    if (!fieldName) continue;
    const value = config.fields[fieldName].read(index);
    if (query.kind === 'text' || compare(value, query.operator, query.value))
      matches.push({
        id: `result-${index}`,
        index,
        label: config.label(index, fieldName, value),
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
  /** Key in ./models when it differs from the provider id. */
  model?: string;
  revision?: string;
  metric: DataProvider<Row>['metric'];
  rowAt(index: number): Row;
  markers: Marker[];
  chapters: Chapter[];
  search: SyntheticSearch;
}): DataProvider<Row> {
  const key = options.model ?? options.id;
  const model = models[key];
  return {
    id: options.id,
    revision: options.revision ?? '1',
    rowCount: model.rowCount,
    metric: options.metric,
    searchHelp: {
      examples: options.search.examples,
      text: true,
      placeholder: options.search.date
        ? 'Text, row number, percentage, date, or field query…'
        : 'Text, row number, percentage, or field query…',
      dates: Boolean(options.search.date),
      fields: Object.entries(options.search.fields).map(([name, field]) => ({
        name,
        type: field.kind,
        operators: field.kind === 'number' ? NUMBER_OPERATORS : TEXT_OPERATORS,
      })),
    },
    async fetchRows(start, count, signal) {
      await delay(signal);
      return Array.from({ length: count }, (_, i) => options.rowAt(start + i));
    },
    async fetchOverview(buckets, signal) {
      await delay(signal);
      return aggregate(key, { start: 0, end: model.rowCount, buckets }, signal);
    },
    async fetchAggregates(range, signal) {
      await delay(signal);
      return aggregate(key, range, signal);
    },
    async fetchOverviewTracks(buckets, signal) {
      await delay(signal);
      return overviewTracks(key, buckets, signal);
    },
    async fetchMarkers(signal) {
      await delay(signal);
      return options.markers;
    },
    async fetchChapters(signal) {
      await delay(signal);
      return options.chapters;
    },
    search: (query, context) =>
      search(options.search, model.rowCount, options.markers, query, context),
  };
}

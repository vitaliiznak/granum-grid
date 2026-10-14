import type {
  AggregateRequest,
  Bucket,
  Chapter,
  DataProvider,
  Marker,
  ProviderQuery,
  SearchContext,
  SearchResult,
} from 'granum-grid';
import { splitRange } from './ranges';
import { checkPredicate } from './search';

/**
 * Hacker News' public Firebase API: no key, any origin, one item per request. Item IDs
 * start at 1 and are never reused, so row `i` is item `i + 1` and addresses never move.
 */
export const HN_API = 'https://hacker-news.firebaseio.com/v0';
/** Algolia's public Hacker News index: full-text search, posting times, and points. */
export const ALGOLIA_API = 'https://hn.algolia.com/api/v1';
const SECOND = 1000;
const HOUR = 3600 * SECOND;
const DAY = 24 * HOUR;
/** The latest item when this demo was calibrated: 2026-10-14 00:02:07 UTC. */
const ANCHOR_ID = 50_080_669;
const ANCHOR_TIME = 1_791_936_127 * SECOND;
/** Item 1, 2006-10-09 18:21:51 UTC. */
const FIRST_TIME = 1_160_418_111 * SECOND;
/**
 * Below the slowest two-month rate seen from 2024 to 2026 (about 9,500 items a day), so
 * the clock estimate stays behind the real latest item until `maxitem` replaces it.
 */
const ITEMS_PER_DAY = 8000;
/**
 * First item posted in each UTC year, found from item times on 2026-10-14. Items 1–62
 * are the 2006 private beta; item 63 was posted on 2007-02-19.
 */
const YEAR_STARTS: readonly (readonly [number, number])[] = [
  [2007, 63],
  [2008, 94_009],
  [2009, 416_051],
  [2010, 1_025_228],
  [2011, 2_056_830],
  [2012, 3_412_254],
  [2013, 4_991_392],
  [2014, 6_993_521],
  [2015, 8_821_662],
  [2016, 10_820_436],
  [2017, 13_293_889],
  [2018, 16_043_767],
  [2019, 18_797_959],
  [2020, 21_925_669],
  [2021, 25_598_809],
  [2022, 29_753_872],
  [2023, 34_202_065],
  [2024, 38_828_556],
  [2025, 42_562_814],
  [2026, 46_449_679],
];
/** Item requests in flight at once, shared by rows, summaries, and searches. */
const CONCURRENT_REQUESTS = 24;
/** Each summary reads at most this many item times. */
const OVERVIEW_GROUPS = 160;
const SUMMARY_GROUPS = 96;
/** Item times kept for repeated summaries; one entry per item. */
const CACHED_TIMES = 8192;
const CACHED_SEARCHES = 32;
/** A date search steps over at most this many unindexed items after Algolia's answer. */
const DATE_STEPS = 8;
const TEXT_LENGTH = 280;

export type ItemType = 'story' | 'comment' | 'job' | 'poll' | 'pollopt';
const ITEM_TYPES: readonly string[] = ['story', 'comment', 'job', 'poll', 'pollopt'];
export type HackerNewsItem =
  | {
      id: number;
      missing: false;
      type: ItemType;
      /** UTC milliseconds. */
      time: number;
      by: string;
      title: string;
      /** Plain text with markup removed, at most 280 characters. */
      text: string;
      url: string;
      score: number | null;
      /** Comments in a story's whole thread. */
      descendants: number | null;
      /** Direct replies. */
      replies: number;
      parent: number | null;
      deleted: boolean;
      dead: boolean;
    }
  /** The API returned no item: not posted yet, or not served. */
  | { id: number; missing: true };

/** Row count from the clock, never above the real latest item at the calibrated rate. */
export const estimatedRowCount = (now = Date.now()) =>
  ANCHOR_ID + Math.max(0, Math.floor(((now - ANCHOR_TIME) / DAY) * ITEMS_PER_DAY));

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
/** Text of an HN HTML fragment for display as plain text; markup is dropped, not rendered. */
export function plainText(html: string, max = TEXT_LENGTH) {
  const text = html
    .replace(/<p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? entity;
      const hex = code[1] === 'x' || code[1] === 'X';
      const point = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');
const num = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
function parseItem(id: number, value: unknown): HackerNewsItem {
  if (value === null) return { id, missing: true };
  const item = value as Record<string, unknown>;
  if (typeof item !== 'object' || item.id !== id)
    throw new Error('Hacker News returned an invalid item.');
  // An item without a posting time or a known type cannot be placed or labeled.
  if (num(item.time) === null || !ITEM_TYPES.includes(item.type as string))
    return { id, missing: true };
  return {
    id,
    missing: false,
    type: item.type as ItemType,
    time: (item.time as number) * SECOND,
    by: str(item.by),
    title: plainText(str(item.title)),
    text: plainText(str(item.text)),
    url: str(item.url),
    score: num(item.score),
    descendants: num(item.descendants),
    replies: Array.isArray(item.kids) ? item.kids.length : 0,
    parent: num(item.parent),
    deleted: item.deleted === true,
    dead: item.dead === true,
  };
}

export interface AlgoliaHit {
  objectID: string;
  created_at_i: number;
  title?: string | null;
  story_title?: string | null;
  comment_text?: string | null;
  author?: string | null;
  points?: number | null;
  num_comments?: number | null;
}
interface AlgoliaPage {
  hits: AlgoliaHit[];
  nbHits: number;
}

/** Runs tasks with bounded concurrency; priority 0 (rows) goes before 1 (summaries). */
function createLimiter(slots: number) {
  let active = 0;
  const queues: [(() => void)[], (() => void)[]] = [[], []];
  const next = () => {
    while (active < slots) {
      const run = queues[0].shift() ?? queues[1].shift();
      if (!run) return;
      active++;
      run();
    }
  };
  return async function limit<T>(
    priority: 0 | 1,
    signal: AbortSignal,
    task: () => Promise<T>,
  ): Promise<T> {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const start = () => {
        signal.removeEventListener('abort', abort);
        resolve();
      };
      const abort = () => {
        const queue = queues[priority];
        const waiting = queue.indexOf(start);
        if (waiting >= 0) queue.splice(waiting, 1);
        reject(signal.reason);
      };
      signal.addEventListener('abort', abort, { once: true });
      queues[priority].push(start);
      next();
    });
    try {
      return await task();
    } finally {
      active--;
      next();
    }
  };
}
/** Aborts with `signal`, or when the caller gives up on sibling requests. */
function linked(signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  return {
    signal: controller.signal,
    abort: (reason?: unknown) => controller.abort(reason),
    done: () => signal.removeEventListener('abort', abort),
  };
}
const remember = <K, V>(map: Map<K, V>, key: K, value: V, limit: number) => {
  map.delete(key);
  map.set(key, value);
  if (map.size > limit) map.delete(map.keys().next().value!);
};

export interface HackerNewsClientOptions {
  fetch?: (url: string, init: { signal: AbortSignal }) => Promise<Response>;
}
/** Item, latest-item, and Algolia reads with one shared concurrency limit and small caches. */
export function createHackerNewsClient(options: HackerNewsClientOptions = {}) {
  const request = options.fetch ?? ((url, init) => fetch(url, init));
  const limit = createLimiter(CONCURRENT_REQUESTS);
  const times = new Map<number, number>();
  const searches = new Map<string, AlgoliaPage>();
  async function json(url: string, signal: AbortSignal, source: string): Promise<unknown> {
    let response: Response;
    try {
      response = await request(url, { signal });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error(`Could not reach ${source}. Check the connection and retry.`);
    }
    if (response.status === 429)
      throw new Error(`${source} rate limit reached. Wait a minute and retry.`);
    if (!response.ok) throw new Error(`${source} request failed (HTTP ${response.status}).`);
    const body: unknown = await response.json();
    signal.throwIfAborted();
    return body;
  }
  async function item(id: number, signal: AbortSignal, priority: 0 | 1 = 0) {
    const body = await limit(priority, signal, () =>
      json(`${HN_API}/item/${id}.json`, signal, 'Hacker News'),
    );
    const parsed = parseItem(id, body);
    if (!parsed.missing) remember(times, id, parsed.time, CACHED_TIMES);
    return parsed;
  }
  return {
    item,
    /**
     * Posting time of one item, or null when the API has no item at that ID. Summaries
     * wait behind rows; a search the reader is waiting on passes priority 0.
     */
    async time(id: number, signal: AbortSignal, priority: 0 | 1 = 1) {
      const cached = times.get(id);
      if (cached !== undefined) return cached;
      const found = await item(id, signal, priority);
      return found.missing ? null : found.time;
    },
    async maxItem(signal: AbortSignal) {
      const body = await json(`${HN_API}/maxitem.json`, signal, 'Hacker News');
      if (!Number.isSafeInteger(body) || (body as number) < 1)
        throw new Error('Hacker News returned an invalid latest item.');
      return body as number;
    },
    async search(
      endpoint: 'search' | 'search_by_date',
      params: Record<string, string>,
      signal: AbortSignal,
    ): Promise<AlgoliaPage> {
      const url = `${ALGOLIA_API}/${endpoint}?${new URLSearchParams(params)}`;
      const cached = searches.get(url);
      if (cached) return cached;
      // Algolia is a separate host and a few requests per search; it skips the item queue.
      const body = (await json(url, signal, 'Algolia')) as AlgoliaPage;
      if (!body || !Array.isArray(body.hits) || !Number.isFinite(body.nbHits))
        throw new Error('Algolia returned an invalid response.');
      remember(searches, url, body, CACHED_SEARCHES);
      return body;
    },
  };
}
export type HackerNewsClient = ReturnType<typeof createHackerNewsClient>;

const iso = (time: number) => new Date(time).toISOString();
export const timeLabel = (time: number) => iso(time).slice(0, 19).replace('T', ' ');
/** Posting dates a group spans, to the minute within a day. */
function rangeLabel(t0: number, t1: number) {
  const [a, b] = [iso(t0), iso(t1)];
  return a.slice(0, 10) === b.slice(0, 10)
    ? `${a.slice(0, 16).replace('T', ' ')} – ${b.slice(11, 16)} UTC`
    : `${a.slice(0, 10)} – ${b.slice(0, 10)}`;
}
const formatter = new Intl.NumberFormat('en-US');
function hitLabel(hit: AlgoliaHit) {
  const day = iso(hit.created_at_i * SECOND).slice(0, 10);
  if (hit.title) {
    const points = hit.points == null ? '' : ` · ${formatter.format(hit.points)} points`;
    return `${plainText(hit.title, 90)}${points} · ${day}`;
  }
  const on = hit.story_title ? ` on “${plainText(hit.story_title, 60)}”` : '';
  return `Comment by ${hit.author ?? 'unknown'}${on} · ${day}`;
}

type Predicate = Extract<ProviderQuery, { kind: 'predicate' }>;
/** Algolia parameters for a supported predicate. */
function predicateParams(query: Predicate): Record<string, string> {
  if (query.field === 'points' || query.field === 'comments') {
    checkPredicate(query, 'number');
    if (query.operator !== '>' && query.operator !== '>=')
      throw new Error(`Search supports ${query.field} > N and ${query.field} >= N.`);
    const field = query.field === 'points' ? 'points' : 'num_comments';
    return { tags: 'story', numericFilters: `${field}${query.operator}${query.value}` };
  }
  if (query.field === 'by') {
    checkPredicate(query, 'text');
    const name = query.value as string;
    if (query.operator !== '=' || !/^[\w-]+$/.test(name))
      throw new Error('Search supports by = "username".');
    return { tags: `author_${name}` };
  }
  throw new Error('Search supports words, dates, points > N, comments > N, and by = "username".');
}

export type HackerNewsProvider = DataProvider<HackerNewsItem> & {
  /** Data-derived landmarks: the most upvoted and most discussed stories. */
  loadMarkers(signal: AbortSignal): Promise<Marker[]>;
  /** The same rows with the latest item count, or this provider when no items were added. */
  refresh(signal: AbortSignal): Promise<HackerNewsProvider>;
};
/**
 * Every Hacker News item, one row per item ID. Rows come from the Firebase API; dates,
 * search, and landmarks come from Algolia. A later visit only appends rows.
 */
export function hackerNewsProvider(
  rowCount: number,
  client: HackerNewsClient = createHackerNewsClient(),
): HackerNewsProvider {
  /**
   * Items posted per hour in each group, from the posting times of its first item and
   * the next group's first item. The last group, or one followed by an item the API does
   * not serve, uses its own last item.
   */
  async function summaries(range: AggregateRequest, groups: number, signal: AbortSignal) {
    const start = Math.max(0, range.start),
      end = Math.min(rowCount, range.end);
    if (end <= start || range.buckets < 1) return [];
    const parts = splitRange(start, end, Math.min(range.buckets, end - start, groups));
    const edges = [...parts.map((part) => part.start + 1), end < rowCount ? end + 1 : end];
    const times = await Promise.all(edges.map((id) => client.time(id, signal)));
    const ends = await Promise.all(
      parts.map(async ({ end }, i) =>
        times[i + 1] === null && edges[i + 1] !== end
          ? { id: end, time: await client.time(end, signal) }
          : { id: edges[i + 1], time: times[i + 1] },
      ),
    );
    return parts.map(({ start, end }, i): Bucket => {
      const t0 = times[i],
        t1 = ends[i].time,
        intervals = ends[i].id - edges[i];
      if (t0 === null || t1 === null || t1 <= t0 || intervals < 1)
        return {
          start,
          end,
          count: null,
          avg: null,
          min: null,
          max: null,
          accuracy: 'unavailable',
        };
      return {
        start,
        end,
        count: end - start,
        avg: intervals / ((t1 - t0) / HOUR),
        min: null,
        max: null,
        accuracy: 'exact',
        label: rangeLabel(t0, t1),
      };
    });
  }
  /** Row of the first item posted at or after `time`, or null after the known rows. */
  async function indexAt(time: number, signal: AbortSignal) {
    // Algolia's latest indexed item before `time`; unindexed (deleted or dead) items may follow it.
    const page = await client.search(
      'search_by_date',
      {
        numericFilters: `created_at_i<${Math.floor(time / SECOND)}`,
        hitsPerPage: '1',
        attributesToRetrieve: 'created_at_i',
      },
      signal,
    );
    let id = page.hits[0] ? Number(page.hits[0].objectID) + 1 : 1;
    for (let step = 0; step < DATE_STEPS && id <= rowCount; step++, id++) {
      const posted = await client.time(id, signal, 0);
      if (posted === null || posted >= time) break;
    }
    return id <= rowCount ? id - 1 : null;
  }
  /** First row of a `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` period, or null outside the data. */
  async function dateIndex(value: string, signal: AbortSignal) {
    const parts = value.split('-').map(Number);
    const [year, month = 1, day = 1] = parts;
    const start = Date.UTC(year, month - 1, day);
    const end =
      parts.length === 1
        ? Date.UTC(year + 1, 0, 1)
        : parts.length === 2
          ? Date.UTC(year, month, 1)
          : Date.UTC(year, month - 1, day + 1);
    if (!Number.isFinite(start) || end <= FIRST_TIME || start > Date.now()) return null;
    if (start <= FIRST_TIME) return 0;
    const known = parts.length === 1 && YEAR_STARTS.find(([y]) => y === year);
    const index = known ? known[1] - 1 : await indexAt(start, signal);
    return index !== null && index < rowCount ? index : null;
  }
  async function matches(
    endpoint: 'search' | 'search_by_date',
    params: Record<string, string>,
    context: SearchContext,
  ): Promise<SearchResult> {
    const from = Math.min(rowCount, Math.max(0, Math.floor(context.fromIndex)));
    const after = from > 0 ? await client.time(from + 1, context.signal, 0) : null;
    const filters = [params.numericFilters, after === null ? '' : `created_at_i>=${after / SECOND}`]
      .filter(Boolean)
      .join(',');
    const page = await client.search(
      endpoint,
      {
        ...params,
        ...(filters && { numericFilters: filters }),
        hitsPerPage: String(Math.max(1, Math.min(100, context.limit))),
        attributesToRetrieve:
          'created_at_i,title,story_title,comment_text,author,points,num_comments',
      },
      context.signal,
    );
    const found = page.hits
      .map((hit) => ({ hit, index: Number(hit.objectID) - 1 }))
      .filter(({ index }) => Number.isSafeInteger(index) && index >= from && index < rowCount)
      .sort((a, b) => a.index - b.index);
    const place = from > 0 ? ' after this position' : '';
    return {
      matches: found.map(({ hit, index }) => ({
        id: `search-${hit.objectID}`,
        index,
        label: hitLabel(hit),
        kind: 'search' as const,
      })),
      complete: from === 0 && page.nbHits <= page.hits.length,
      message:
        page.nbHits > page.hits.length
          ? `Top ${formatter.format(found.length)} of about ${formatter.format(page.nbHits)} matches${place}, ranked by Algolia.`
          : from > 0
            ? 'Every match after this position. Earlier rows were not searched.'
            : undefined,
    };
  }
  async function search(query: ProviderQuery, context: SearchContext): Promise<SearchResult> {
    context.signal.throwIfAborted();
    if (query.kind === 'date') {
      const index = await dateIndex(query.value, context.signal);
      return {
        matches:
          index === null
            ? []
            : [{ id: `date-${query.value}`, index, label: query.value, kind: 'search' }],
        complete: true,
      };
    }
    if (query.kind === 'text') return matches('search', { query: query.value }, context);
    return matches('search', predicateParams(query), context);
  }
  let markers: Promise<Marker[]> | null = null;
  async function computeMarkers(signal: AbortSignal): Promise<Marker[]> {
    const fields = { attributesToRetrieve: 'created_at_i,title,points,num_comments' };
    const [upvoted, discussed] = await Promise.all([
      // With no query Algolia ranks by points, so these are the most upvoted stories.
      client.search(
        'search',
        { ...fields, tags: 'story', numericFilters: 'points>2000', hitsPerPage: '10' },
        signal,
      ),
      client.search(
        'search',
        { ...fields, tags: 'story', numericFilters: 'num_comments>2500', hitsPerPage: '50' },
        signal,
      ),
    ]);
    const mostDiscussed = [...discussed.hits]
      .sort((a, b) => (b.num_comments ?? 0) - (a.num_comments ?? 0))
      .slice(0, 3);
    const result = new Map<string, Marker>();
    for (const [i, hit] of mostDiscussed.entries())
      result.set(hit.objectID, {
        id: `discussed-${i + 1}`,
        index: Number(hit.objectID) - 1,
        label: `${plainText(hit.title ?? '', 90)} · ${formatter.format(hit.num_comments ?? 0)} comments · ${iso(hit.created_at_i * SECOND).slice(0, 10)}`,
        kind: 'event',
      });
    for (const [i, hit] of upvoted.hits.entries())
      result.set(hit.objectID, {
        id: i === 0 ? 'top' : `upvoted-${i + 1}`,
        index: Number(hit.objectID) - 1,
        label: hitLabel(hit),
        // The most upvoted story outranks the rest, so a crowded stretch is named for it.
        kind: i === 0 ? 'spike' : 'event',
      });
    return [...result.values()]
      .filter((marker) => Number.isSafeInteger(marker.index) && marker.index < rowCount)
      .sort((a, b) => a.index - b.index);
  }
  function loadMarkers(signal: AbortSignal) {
    // Shared once complete; a canceled or failed load is retried by the next caller.
    const pending = (markers ??= computeMarkers(new AbortController().signal).catch((error) => {
      markers = null;
      throw error;
    }));
    return new Promise<Marker[]>((resolve, reject) => {
      signal.throwIfAborted();
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }
  async function fetchChapters(signal: AbortSignal): Promise<Chapter[]> {
    const lastYear = YEAR_STARTS[YEAR_STARTS.length - 1][0];
    const later: [number, number][] = [];
    for (let year = lastYear + 1; Date.UTC(year, 0, 1) <= Date.now(); year++) {
      const index = await indexAt(Date.UTC(year, 0, 1), signal);
      if (index === null) break;
      later.push([year, index + 1]);
    }
    const known: (readonly [number, number])[] = [[2006, 1], ...YEAR_STARTS, ...later];
    const starts = known.filter(([, id]) => id - 1 < rowCount);
    return starts.map(([year, id], i) => ({
      id: `year-${year}`,
      label: `${year}`,
      breadcrumb: ['Hacker News', `${year}`],
      start: id - 1,
      end: i === starts.length - 1 ? rowCount : starts[i + 1][1] - 1,
    }));
  }
  const provider: HackerNewsProvider = {
    id: 'hackernews',
    // Addresses are item IDs, so the revision survives later visits with more rows.
    revision: 'hn-items-1',
    rowCount,
    metric: {
      label: 'Activity',
      unit: 'items/h',
      kind: 'value',
      description:
        'Items posted per hour, from the posting times of each group’s first item and the next group’s first item.',
    },
    searchHelp: {
      examples: ['rust', 'points > 3000', 'by = "pg"', '2020-03-12'],
      placeholder: 'Item number, date, words, or points > N…',
      text: true,
      dates: true,
      fields: [
        { name: 'points', type: 'number', operators: ['>', '>='] },
        { name: 'comments', type: 'number', operators: ['>', '>='] },
        { name: 'by', type: 'text', operators: ['='] },
      ],
    },
    async fetchRows(start, count, signal) {
      const page = linked(signal);
      try {
        return await Promise.all(
          Array.from({ length: count }, (_, i) => client.item(start + i + 1, page.signal)),
        );
      } catch (error) {
        // One failed item fails the page; stop its siblings instead of finishing them.
        page.abort(error);
        throw error;
      } finally {
        page.done();
      }
    },
    fetchOverview: (buckets, signal) =>
      summaries({ start: 0, end: rowCount, buckets }, OVERVIEW_GROUPS, signal),
    fetchAggregates: (range, signal) => summaries(range, SUMMARY_GROUPS, signal),
    fetchMarkers: loadMarkers,
    loadMarkers,
    fetchChapters,
    search,
    async refresh(signal) {
      const latest = await client.maxItem(signal);
      return latest > rowCount ? hackerNewsProvider(latest, client) : provider;
    },
  };
  return provider;
}

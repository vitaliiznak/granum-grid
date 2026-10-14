import { PageCache } from './cache.js';
import { checkBuckets, validRange } from './bounds.js';
import type {
  Bucket,
  CacheOptions,
  Chapter,
  DataProvider,
  Marker,
  OverviewTrack,
  ProviderQuery,
  SearchContext,
  SearchResult,
} from './types.js';
/** Row-page owners in request priority order. */
const OWNERS = ['visible', 'preview', 'prefetch'] as const;
type Owner = (typeof OWNERS)[number];
type MetadataKind = 'tracks' | 'overview' | 'markers' | 'chapters';
const THROTTLED = 'Waiting for canceled requests. The provider must honor AbortSignal.';
/** Bucket resolution requested for the whole-dataset overview and each extra track. */
const OVERVIEW_BUCKETS = 320;
const TRACK_BUCKETS = 160;
const MAX_TRACKS = 4;
const MAX_MARKERS_OR_CHAPTERS = 4096;
/** Concurrent useful row requests, and the cap including canceled ones still settling. */
const MAX_ACTIVE_PAGES = 4;
const MAX_PENDING_TRANSPORTS = 8;
/** Rough in-memory sizes used to keep metadata within the cache budget. */
const BUCKET_BYTES = 96;
const ITEM_BYTES = 160;
export class DataSession<Row> {
  readonly cache: PageCache<Row>;
  overview: Bucket[] = [];
  tracks: OverviewTrack[] = [];
  markers: Marker[] = [];
  chapters: Chapter[] = [];
  metadataErrors: Partial<Record<MetadataKind, string>> = {};
  private listeners = new Set<() => void>();
  private version = 0;
  private owners = new Map<Owner, Set<number>>();
  private active = new Map<number, AbortController>();
  private pending = new Set<AbortController>();
  private deadlines = new Map<AbortController, ReturnType<typeof setTimeout>>();
  private requestTimeoutMs: number;
  private knownRowCount: number;
  private errors = new Map<number, string>();
  /** In-flight metadata requests and the metadata kind each one loads. */
  private metadata = new Map<AbortController, MetadataKind>();
  private searches = 0;
  private stopped = false;
  private started = false;
  aborted = 0;
  fetched = 0;
  constructor(
    public provider: DataProvider<Row>,
    options: CacheOptions<Row> = {},
  ) {
    this.cache = new PageCache(options);
    this.knownRowCount = provider.rowCount;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    if (!Number.isFinite(this.requestTimeoutMs) || this.requestTimeoutMs < 1)
      throw new RangeError('requestTimeoutMs must be positive');
  }
  updateAppendProvider(provider: DataProvider<Row>) {
    if (
      provider.id !== this.provider.id ||
      provider.revision !== this.provider.revision ||
      provider.rowCount < this.knownRowCount
    )
      throw new Error(
        'Append updates must preserve identity, revision, and all previous row addresses',
      );
    const oldCount = this.knownRowCount;
    this.provider = provider;
    this.knownRowCount = provider.rowCount;
    if (oldCount === provider.rowCount) return;
    if (oldCount % this.cache.pageSize) {
      const page = Math.floor(oldCount / this.cache.pageSize);
      this.cache.delete(page);
      this.active.get(page)?.abort();
      this.active.delete(page);
      this.errors.delete(page);
    }
    this.metadata.forEach((_, c) => c.abort());
    this.overview = [];
    this.tracks = [];
    // A stopped session reloads its metadata when started again.
    if (this.started) {
      this.loadMetadata();
      this.pump();
    }
    this.emit();
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
  private metadataBytes() {
    return (
      this.overview.length * BUCKET_BYTES +
      this.tracks.reduce(
        (sum, track) => sum + track.buckets.length * BUCKET_BYTES + ITEM_BYTES,
        0,
      ) +
      (this.markers.length + this.chapters.length) * ITEM_BYTES
    );
  }
  getStats() {
    const bytes = this.cache.bytes + this.metadataBytes();
    return {
      cachedRows: this.cache.rowCount,
      cachedBytes: bytes,
      budgetOverage: Math.max(0, bytes - this.cache.maxBytes),
      activeRequests: this.pending.size + this.metadata.size + this.searches,
      abortedRequests: this.aborted,
      completedFetches: this.fetched,
    };
  }
  start() {
    this.stopped = false;
    if (this.started) return;
    this.started = true;
    this.loadMetadata();
    this.pump();
  }
  /** Load every metadata kind the provider supports, or only those `only` accepts. */
  private loadMetadata(only: (key: MetadataKind) => boolean = () => true) {
    const { provider } = this;
    if (provider.fetchOverviewTracks && only('tracks'))
      this.loadMeta(
        'tracks',
        (signal) => provider.fetchOverviewTracks!(TRACK_BUCKETS, signal),
        (result) => {
          if (
            !Array.isArray(result) ||
            result.length > MAX_TRACKS ||
            new Set(result.map((t) => t.id)).size !== result.length
          )
            throw new Error('Invalid overview tracks');
          this.tracks = result.map((track) => ({
            ...track,
            buckets: checkBuckets(track.buckets, {
              start: 0,
              end: provider.rowCount,
              buckets: TRACK_BUCKETS,
            }),
          }));
        },
      );
    if (provider.fetchOverview && only('overview'))
      this.loadMeta(
        'overview',
        (signal) => provider.fetchOverview!(OVERVIEW_BUCKETS, signal),
        (result) => {
          this.overview = checkBuckets(result, {
            start: 0,
            end: provider.rowCount,
            buckets: OVERVIEW_BUCKETS,
          });
        },
      );
    if (provider.fetchMarkers && only('markers'))
      this.loadMeta('markers', provider.fetchMarkers.bind(provider), (result) => {
        if (
          result.length > MAX_MARKERS_OR_CHAPTERS ||
          result.some(
            (item) =>
              !Number.isSafeInteger(item.index) ||
              item.index < 0 ||
              item.index >= provider.rowCount,
          )
        )
          throw new Error('Invalid or excessive marker metadata');
        this.markers = result.slice().sort((a, b) => a.index - b.index);
      });
    if (provider.fetchChapters && only('chapters'))
      this.loadMeta('chapters', provider.fetchChapters.bind(provider), (result) => {
        if (result.length > MAX_MARKERS_OR_CHAPTERS) throw new Error('Too many chapters');
        const sorted = result.slice().sort((a, b) => a.start - b.start);
        if (
          sorted.some(
            (c, i) => !validRange(c, provider.rowCount) || (i > 0 && c.start < sorted[i - 1].end),
          )
        )
          throw new Error('Invalid chapter ranges');
        this.chapters = sorted;
      });
  }
  private loadMeta<T>(
    key: MetadataKind,
    fetcher: (signal: AbortSignal) => Promise<T>,
    accept: (value: T) => void,
  ) {
    const controller = new AbortController();
    this.metadata.set(controller, key);
    this.emit();
    Promise.resolve()
      .then(() => fetcher(controller.signal))
      .then((value) => {
        if (!controller.signal.aborted && !this.stopped) {
          accept(value);
          delete this.metadataErrors[key];
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && !this.stopped) this.metadataErrors[key] = String(error);
      })
      .finally(() => {
        this.metadata.delete(controller);
        this.cache.evict(this.pinned(), this.metadataBytes());
        this.emit();
      });
    return controller;
  }
  /**
   * Run provider search in this revision. It counts as an active request until it settles,
   * and results above `limit` or outside the row count are rejected. Abort with `signal`.
   */
  async search(query: ProviderQuery, context: SearchContext): Promise<SearchResult> {
    const { provider } = this;
    if (!provider.search) throw new Error('This provider does not support search');
    this.searches++;
    this.emit();
    try {
      const result = await provider.search(query, context);
      // Append updates can grow the count while a search runs; validate against the latest.
      const rowCount = this.provider.rowCount;
      if (
        result.matches.length > context.limit ||
        result.matches.some(
          (match) =>
            !Number.isSafeInteger(match.index) || match.index < 0 || match.index >= rowCount,
        )
      )
        throw new Error('Provider returned invalid search addresses');
      return result;
    } finally {
      this.searches--;
      this.emit();
    }
  }
  setRange(owner: Owner, start: number, count: number) {
    const pages = new Set<number>();
    const first = Math.max(0, Math.floor(start));
    const last = Math.min(this.provider.rowCount, Math.ceil(start + count));
    if (count > 0)
      for (
        let page = Math.floor(first / this.cache.pageSize);
        page <= Math.floor((last - 1) / this.cache.pageSize);
        page++
      )
        pages.add(page);
    this.owners.set(owner, pages);
    const wanted = this.wanted();
    for (const [page, controller] of this.active)
      if (!wanted.has(page) && !controller.signal.aborted) {
        controller.abort();
        this.active.delete(page);
        this.aborted++;
      }
    for (const page of this.errors.keys()) if (!wanted.has(page)) this.errors.delete(page);
    this.cache.evict(this.pinned(), this.metadataBytes());
    this.pump();
  }
  private wanted() {
    return new Set(OWNERS.flatMap((owner) => [...(this.owners.get(owner) ?? [])]));
  }
  private pinned() {
    return new Set([...(this.owners.get('visible') ?? []), ...(this.owners.get('preview') ?? [])]);
  }
  private pump() {
    if (this.stopped) return;
    for (const page of this.wanted()) {
      if (this.active.size >= MAX_ACTIVE_PAGES) break;
      if (this.cache.has(page) || this.active.has(page) || this.errors.has(page)) continue;
      // Never open unlimited underlying requests when a provider ignores cancellation.
      if (this.pending.size >= MAX_PENDING_TRANSPORTS) {
        this.errors.set(page, THROTTLED);
        this.emit();
        continue;
      }
      const speculative = !this.pinned().has(page);
      if (
        speculative &&
        this.cache.bytes + this.metadataBytes() + this.cache.estimatePageBytes() >
          this.cache.maxBytes
      )
        continue;
      const controller = new AbortController();
      this.active.set(page, controller);
      this.pending.add(controller);
      this.deadlines.set(
        controller,
        setTimeout(() => {
          this.deadlines.delete(controller);
          if (this.active.get(page) !== controller || this.stopped) return;
          controller.abort();
          this.aborted++;
          this.active.delete(page);
          this.errors.set(page, 'Row request timed out. Retry to load this page.');
          this.emit();
          this.pump();
        }, this.requestTimeoutMs),
      );
      const start = page * this.cache.pageSize;
      const count = Math.min(this.cache.pageSize, this.provider.rowCount - start);
      this.emit();
      Promise.resolve()
        .then(() => {
          controller.signal.throwIfAborted();
          return this.provider.fetchRows(start, count, controller.signal);
        })
        .then((rows) => {
          if (controller.signal.aborted || this.stopped) return;
          if (rows.length !== count)
            throw new Error(`Expected ${count} rows, received ${rows.length}`);
          this.cache.put(page, rows);
          this.fetched++;
          // Keep a completed prefetch page until the next change of desired range.
          this.cache.evict(this.pinned(), this.metadataBytes());
        })
        .catch((error) => {
          if (!controller.signal.aborted && !this.stopped) this.errors.set(page, String(error));
        })
        .finally(() => {
          clearTimeout(this.deadlines.get(controller));
          this.deadlines.delete(controller);
          this.pending.delete(controller);
          if (this.active.get(page) === controller) {
            this.active.delete(page);
            if (!this.pinned().has(page)) this.owners.get('prefetch')?.delete(page);
          }
          // A settled transport frees a slot, so throttled pages load without a manual retry.
          for (const [held, error] of this.errors)
            if (error === THROTTLED) this.errors.delete(held);
          this.emit();
          this.pump();
        });
    }
  }
  has(index: number) {
    return this.cache.hasRow(index);
  }
  read(index: number) {
    return this.cache.read(index);
  }
  error(index: number) {
    return this.errors.get(Math.floor(index / this.cache.pageSize));
  }
  retry() {
    this.errors.clear();
    // Reload only failed metadata kinds that are not already loading again.
    const failed = new Set(Object.keys(this.metadataErrors) as MetadataKind[]);
    for (const [controller, key] of this.metadata)
      if (!controller.signal.aborted) failed.delete(key);
    if (this.started) this.loadMetadata((key) => failed.has(key));
    this.pump();
    this.emit();
  }
  stop() {
    this.stopped = true;
    this.started = false;
    this.pending.forEach((controller) => controller.abort());
    this.active.clear();
    this.deadlines.forEach(clearTimeout);
    this.deadlines.clear();
    this.metadata.forEach((_, controller) => controller.abort());
  }
}

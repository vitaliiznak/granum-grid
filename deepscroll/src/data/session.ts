import { PageCache } from './cache.js';
import type {
  AggregateRequest,
  Bucket,
  CacheOptions,
  Chapter,
  DataProvider,
  Marker,
  OverviewTrack,
} from './types.js';
type Owner = 'visible' | 'preview' | 'prefetch';
export class DataSession<Row> {
  readonly cache: PageCache<Row>;
  overview: Bucket[] = [];
  tracks: OverviewTrack[] = [];
  aggregates: Bucket[] = [];
  markers: Marker[] = [];
  chapters: Chapter[] = [];
  metadataErrors: Record<string, string> = {};
  private listeners = new Set<() => void>();
  private version = 0;
  private owners = new Map<Owner, Set<number>>();
  private active = new Map<number, AbortController>();
  private pending = new Set<AbortController>();
  private deadlines = new Map<AbortController, ReturnType<typeof setTimeout>>();
  private requestTimeoutMs: number;
  private knownRowCount: number;
  private errors = new Map<number, string>();
  private metadata = new Set<AbortController>();
  private region?: AbortController;
  private regionKey = '';
  private requestedRange?: AggregateRequest;
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
    this.metadata.forEach((c) => c.abort());
    this.region?.abort();
    this.regionKey = '';
    this.overview = [];
    this.aggregates = [];
    this.tracks = [];
    this.started = false;
    this.start();
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
      this.overview.length * 96 +
      this.tracks.reduce((sum, track) => sum + track.buckets.length * 96 + 160, 0) +
      this.aggregates.length * 96 +
      this.markers.length * 160 +
      this.chapters.length * 160
    );
  }
  getStats() {
    const bytes = this.cache.bytes + this.metadataBytes();
    return {
      cachedRows: this.cache.rowCount,
      cachedBytes: bytes,
      budgetOverage: Math.max(0, bytes - this.cache.maxBytes),
      activeRequests: this.pending.size + this.metadata.size,
      staleRequests: this.pending.size - this.active.size,
      abortedRequests: this.aborted,
      completedFetches: this.fetched,
    };
  }
  start() {
    this.stopped = false;
    if (this.started) return;
    this.started = true;
    const { provider } = this;
    if (provider.fetchOverviewTracks)
      this.loadMeta(
        'tracks',
        (signal) => provider.fetchOverviewTracks!(160, signal),
        (result) => {
          if (
            !Array.isArray(result) ||
            result.length > 4 ||
            new Set(result.map((t) => t.id)).size !== result.length
          )
            throw new Error('Invalid overview tracks');
          this.tracks = result.map((track) => ({
            ...track,
            buckets: this.validateBuckets(track.buckets, {
              start: 0,
              end: provider.rowCount,
              buckets: 160,
            }),
          }));
        },
      );
    if (provider.fetchOverview)
      this.loadMeta(
        'overview',
        (signal) => provider.fetchOverview!(320, signal),
        (result) => {
          this.overview = this.validateBuckets(result, {
            start: 0,
            end: provider.rowCount,
            buckets: 320,
          });
        },
      );
    if (provider.fetchMarkers)
      this.loadMeta('markers', provider.fetchMarkers.bind(provider), (result) => {
        if (
          result.length > 4096 ||
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
    if (provider.fetchChapters)
      this.loadMeta('chapters', provider.fetchChapters.bind(provider), (result) => {
        if (result.length > 4096) throw new Error('Too many chapters');
        const sorted = result.slice().sort((a, b) => a.start - b.start);
        if (
          sorted.some(
            (c, i) =>
              !Number.isSafeInteger(c.start) ||
              !Number.isSafeInteger(c.end) ||
              c.start < 0 ||
              c.end > provider.rowCount ||
              c.end <= c.start ||
              (i > 0 && c.start < sorted[i - 1].end),
          )
        )
          throw new Error('Invalid chapter ranges');
        this.chapters = sorted;
      });
    this.pump();
  }
  private loadMeta<T>(
    key: string,
    fetcher: (signal: AbortSignal) => Promise<T>,
    accept: (value: T) => void,
  ) {
    const controller = new AbortController();
    this.metadata.add(controller);
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
  private validateBuckets(buckets: Bucket[], range: AggregateRequest) {
    if (!Array.isArray(buckets) || buckets.length > range.buckets)
      throw new Error('Invalid aggregate resolution');
    if (range.end === range.start && buckets.length === 0) return buckets;
    let cursor = range.start;
    for (const bucket of buckets) {
      if (
        bucket.start !== cursor ||
        !Number.isSafeInteger(bucket.end) ||
        bucket.end <= cursor ||
        bucket.end > range.end ||
        !['exact', 'estimated', 'unavailable'].includes(bucket.accuracy)
      )
        throw new Error('Invalid aggregate coverage');
      if (
        [bucket.avg, bucket.min, bucket.max, bucket.count].some(
          (value) => value !== null && !Number.isFinite(value),
        )
      )
        throw new Error('Invalid aggregate values');
      if (bucket.count !== null && (bucket.count < 0 || bucket.count > bucket.end - bucket.start))
        throw new Error('Invalid aggregate count');
      cursor = bucket.end;
    }
    if (cursor !== range.end) throw new Error('Incomplete aggregate coverage');
    return buckets;
  }
  requestAggregates(range?: AggregateRequest) {
    if (!range || !this.provider.fetchAggregates) {
      this.region?.abort();
      this.regionKey = '';
      return;
    }
    this.requestedRange = range;
    const key = `${range.start}:${range.end}:${range.buckets}`;
    if (key === this.regionKey) return;
    this.regionKey = key;
    this.region?.abort();
    this.region = this.loadMeta(
      'aggregates',
      (signal) => this.provider.fetchAggregates!(range, signal),
      (value) => {
        this.aggregates = this.validateBuckets(value, range);
      },
    );
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
    return new Set(
      [...(['visible', 'preview', 'prefetch'] as const)].flatMap((owner) => [
        ...(this.owners.get(owner) ?? []),
      ]),
    );
  }
  private pinned() {
    return new Set([...(this.owners.get('visible') ?? []), ...(this.owners.get('preview') ?? [])]);
  }
  private pump() {
    if (this.stopped) return;
    for (const page of this.wanted()) {
      if (this.active.size >= 4) break;
      if (this.cache.has(page) || this.active.has(page) || this.errors.has(page)) continue;
      // Four useful requests plus at most four canceled transports still settling.
      // Never open unlimited underlying requests when a provider ignores cancellation.
      if (this.pending.size >= 8) {
        this.errors.set(
          page,
          'Waiting for canceled requests. The provider must honor AbortSignal. Retry after they settle.',
        );
        this.emit();
        continue;
      }
      const speculative = !this.pinned().has(page);
      if (
        speculative &&
        this.cache.bytes + this.metadataBytes() + this.cache.pageSize * 256 > this.cache.maxBytes
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
    if (!this.metadata.size && Object.keys(this.metadataErrors).length) {
      this.started = false;
      this.start();
      if (this.metadataErrors.aggregates && this.requestedRange) {
        this.regionKey = '';
        this.requestAggregates(this.requestedRange);
      }
    }
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
    this.metadata.forEach((controller) => controller.abort());
    this.region?.abort();
    this.regionKey = '';
  }
}

export interface AggregateRequest {
  start: number;
  end: number;
  buckets: number;
}
export interface Bucket {
  start: number;
  end: number;
  count: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  accuracy: 'exact' | 'estimated' | 'unavailable';
  label?: string;
}
/** Kinds the explorer ranks and names. `bookmark` marks a place the reader saved. */
export type KnownMarkerKind = 'spike' | 'error' | 'search' | 'selection' | 'event' | 'bookmark';
export interface Marker {
  id: string;
  index: number;
  label: string;
  /**
   * A known kind, or the host's own (such as `deploy`), which ranks like `event`. The map
   * exposes it as `data-kind` for styling.
   */
  kind: KnownMarkerKind | (string & {});
  color?: string;
}
export interface Chapter {
  id: string;
  start: number;
  end: number;
  label: string;
  breadcrumb?: readonly string[];
}
export type ProviderQuery =
  | { kind: 'date'; value: string }
  | { kind: 'text'; value: string }
  | {
      kind: 'predicate';
      field: string;
      operator: '>' | '>=' | '<' | '<=' | '=' | '!=';
      value: number | string;
    };
export interface SearchContext {
  fromIndex: number;
  limit: number;
  signal: AbortSignal;
}
export interface SearchResult {
  matches: Marker[];
  complete: boolean;
  message?: string;
}
/** Optional discovery hints. Providers still validate every query themselves. */
export interface SearchHelp {
  examples: readonly string[];
  placeholder?: string;
  /** Opt in to plain-text row queries. Otherwise the jump dialog searches named markers only. */
  text?: boolean;
  /** False explicitly disables date queries; omitted preserves provider-defined support. */
  dates?: boolean;
  fields?: readonly {
    name: string;
    type: 'number' | 'text';
    operators: readonly Extract<ProviderQuery, { kind: 'predicate' }>['operator'][];
  }[];
}
/**
 * A column the server is willing to sort, filter, or edit. The library does not read
 * these fields from row values. `sortable`, `filterable`, and `editable` are opt-in.
 */
export interface ServerColumn {
  id: string;
  label: string;
  type: 'text' | 'number' | 'time' | 'boolean';
  sortable?: boolean;
  filterable?: boolean;
  editable?: boolean;
}
export interface SortKey {
  columnId: string;
  direction: 'asc' | 'desc';
}
export type FilterOperator = '>' | '>=' | '<' | '<=' | '=' | '!=' | 'contains';
/** A constraint the server applies by publishing a new ordered revision. */
export interface ColumnFilter {
  columnId: string;
  operator: FilterOperator;
  value: string | number | boolean;
}
/** Replace the opaque row at one address. The server decides whether addresses move. */
export interface RowEdit<Row> {
  index: number;
  row: Row;
}
/** Change one server-declared editable column at one address. */
export interface ColumnEdit {
  index: number;
  columnId: string;
  value: string | number | boolean;
}
export type ServerAction<Row> =
  | { kind: 'sort'; keys: readonly SortKey[] }
  | { kind: 'filter'; filters: readonly ColumnFilter[] }
  | { kind: 'edit'; edit: RowEdit<Row> | ColumnEdit };

/**
 * One server page. `cursor` is an opaque position in the current revision; null asks
 * for the first row. `windowSize` is the maximum number of rows, not a request to
 * read the dataset.
 */
export interface CursorWindowQuery {
  cursor: string | null;
  windowSize: number;
}
/** Rows the server placed in one window, and the cursor that resumes after them. */
export interface CursorWindow<Row> {
  rows: readonly Row[];
  /** Zero-based address of `rows[0]` in this revision. */
  start: number;
  /** Null when this window reaches the revision's row count. */
  nextCursor: string | null;
}

/**
 * Server-owned operations for a large ordered dataset. The explorer does not call
 * these methods and does not reorder or scan rows. Reads return one cursor window.
 * Sort, filter, and edit return the next ordered revision: the same `id` and a new
 * `revision`.
 */
export interface ServerDataset<Row> {
  columns(signal: AbortSignal): Promise<readonly ServerColumn[]> | readonly ServerColumn[];
  /** Opaque cursor that opens a window at this address. Null is valid only at address 0. */
  cursorAt(index: number, signal: AbortSignal): Promise<string | null>;
  fetchWindow(query: CursorWindowQuery, signal: AbortSignal): Promise<CursorWindow<Row>>;
  sort?(keys: readonly SortKey[], signal: AbortSignal): Promise<DataProvider<Row>>;
  filter?(filters: readonly ColumnFilter[], signal: AbortSignal): Promise<DataProvider<Row>>;
  edit?(edit: RowEdit<Row> | ColumnEdit, signal: AbortSignal): Promise<DataProvider<Row>>;
}

/**
 * An ordered, index-addressable dataset. Row is opaque to the library: no required
 * fields, numeric values, timestamps, or JSON representation. The host renders it.
 * Only identity, revision, a known row count, and ordered slice fetching are required.
 * Sorting, filtering, and editing are `ServerDataset` operations: the server publishes
 * the next revision, and this provider only fetches slices of that order. A server
 * that pages with a cursor and a window size can satisfy `fetchRows` through
 * `createCursorProvider`.
 */
export interface DataProvider<Row> {
  id: string;
  revision: string;
  rowCount: number;
  searchHelp?: SearchHelp;
  metric?: {
    label: string;
    /** Plain-language source or calculation notes, shown in map help and previews. */
    description?: string;
    unit?: string;
    kind: 'value' | 'density';
    domain?: readonly [number, number];
  };
  fetchRows(start: number, count: number, signal: AbortSignal): Promise<Row[]>;
  fetchOverview?(buckets: number, signal: AbortSignal): Promise<Bucket[]>;
  /** Up to four additional, bounded profiles sharing this provider's row addresses. */
  fetchOverviewTracks?(buckets: number, signal: AbortSignal): Promise<OverviewTrack[]>;
  fetchAggregates?(range: AggregateRequest, signal: AbortSignal): Promise<Bucket[]>;
  fetchMarkers?(signal: AbortSignal): Promise<Marker[]>;
  fetchChapters?(signal: AbortSignal): Promise<Chapter[]>;
  search?(query: ProviderQuery, context: SearchContext): Promise<SearchResult>;
}
export interface OverviewTrack {
  id: string;
  label: string;
  buckets: Bucket[];
  metric?: DataProvider<unknown>['metric'];
}
export interface CacheOptions<Row> {
  maxBytes?: number;
  pageSize?: number;
  estimateRowBytes?(row: Row): number;
  /** Deadline for row requests. Default 15 seconds. Providers must honor AbortSignal. */
  requestTimeoutMs?: number;
}

/** Half-open, zero-based range within one ordered dataset revision. */
export interface RowRange {
  start: number;
  end: number;
}
export interface PendingRowSlot {
  index: number;
  y: number;
  height: number;
  status: 'loading' | 'error';
  estimate?: Bucket;
  error?: string;
}
export type RowSlot<Row> =
  PendingRowSlot | { index: number; y: number; height: number; status: 'ready'; row: Row };

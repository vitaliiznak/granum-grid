export interface AggregateRequest { start: number; end: number; buckets: number }
export interface Bucket {
  start: number; end: number; count: number | null;
  avg: number | null; min: number | null; max: number | null;
  accuracy: 'exact' | 'estimated' | 'unavailable'; label?: string;
}
export interface Marker { id: string; index: number; label: string; kind: 'spike' | 'error' | 'search' | 'selection' | 'event'; color?: string }
export interface Chapter { id: string; start: number; end: number; label: string; breadcrumb?: readonly string[] }
export type ProviderQuery = { kind: 'date'; value: string } | { kind: 'predicate'; field: string; operator: '>' | '>=' | '<' | '<=' | '=' | '!='; value: number | string };
export interface SearchContext { fromIndex: number; limit: number; signal: AbortSignal }
export interface SearchResult { matches: Marker[]; complete: boolean; message?: string }
export interface DataProvider<Row> {
  id: string; revision: string; rowCount: number;
  metric?: { label: string; unit?: string; kind: 'value' | 'density'; domain?: readonly [number, number] };
  fetchRows(start: number, count: number, signal: AbortSignal): Promise<Row[]>;
  fetchOverview?(buckets: number, signal: AbortSignal): Promise<Bucket[]>;
  fetchAggregates?(range: AggregateRequest, signal: AbortSignal): Promise<Bucket[]>;
  fetchMarkers?(signal: AbortSignal): Promise<Marker[]>;
  fetchChapters?(signal: AbortSignal): Promise<Chapter[]>;
  search?(query: ProviderQuery, context: SearchContext): Promise<SearchResult>;
}
export interface CacheOptions<Row> { maxBytes?: number; pageSize?: number; estimateRowBytes?(row: Row): number }
export interface PendingRowSlot { index: number; y: number; height: number; status: 'loading' | 'error'; estimate?: Bucket; error?: string }
export type RowSlot<Row> = PendingRowSlot | { index: number; y: number; height: number; status: 'ready'; row: Row };

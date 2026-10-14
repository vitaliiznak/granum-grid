import {
  AtlasRail,
  GranumGrid,
  JumpBar,
  ViewCanvas,
  createArrayProvider,
  createCursorProvider,
  encodeView,
  decodeView,
  type SavedView,
  useGranumGrid,
  type DataProvider,
  type GranumGridAppearance,
  type AtlasRailOptions,
  type GranumGridApi,
  type Features,
} from 'granum-grid';
import { useGranumGrid as useHeadlessGrid, type Marker } from 'granum-grid/headless';
import { createEngine, type NavigationController } from 'granum-grid/core';
import { PageCache, acceptServerRevision, rangeProvider } from 'granum-grid/data';
import { createRef, useMemo, useState } from 'react';
// @ts-expect-error The engine and its adapters live in granum-grid/core, not the root entry.
import type { GranumGridEngine } from 'granum-grid';
// @ts-expect-error Server validation helpers live in granum-grid/data.
import { serverActionIssue } from 'granum-grid';
export const unusedRootImports: unknown[] = [serverActionIssue];
export type UnusedEngine = GranumGridEngine;
// @ts-expect-error Map layers are AtlasRailOptions, not hook features.
export const mapFeature: Partial<Features> = { overview: false };
const api = createRef<GranumGridApi<{ value: number }>>();
const appearance: GranumGridAppearance = {
  classNames: { row: 'px-4 border-b', toolbar: 'flex gap-2' },
  styles: { footer: { padding: 12 } },
};
const atlas: AtlasRailOptions = {
  variant: 'profile',
  axis: 'rows',
  showRange: true,
  showTracks: true,
  snapToPeaks: true,
  precision: false,
  markerLabels: 'label',
  layout: 'auto',
  formatValue: (value) => value.toFixed(1),
  actions: <button>Map settings</button>,
};
const provider: DataProvider<{ value: number }> = {
  id: 'consumer',
  revision: '1',
  rowCount: 100_000_000,
  metric: {
    label: 'Value',
    kind: 'value',
    description: 'Provider-supplied averages across each group of rows.',
  },
  searchHelp: { examples: ['row'], text: true },
  async search(query) {
    if (query.kind === 'text')
      return { matches: [], complete: false, message: `Text query: ${query.value}` };
    return { matches: [], complete: true };
  },
  async fetchRows(start, count, signal) {
    signal.throwIfAborted();
    return Array.from({ length: count }, (_, i) => ({ value: start + i }));
  },
};
export const example = (
  <GranumGrid
    provider={provider}
    ariaLabel="Consumer fixture"
    {...appearance}
    rail={atlas}
    unstyled
    layout="embedded"
    initialView={{
      version: 1,
      dataset: 'consumer',
      revision: '1',
      location: { position: 100 },
      selection: { start: 100, end: 200 },
    }}
    onSelectionChange={(range) => range?.start}
    onRowActivate={({ row, index, rowNumber }) => row.value + index + rowNumber}
    tools={{
      storageKey: 'consumer-bookmarks',
      formatRange: ({ start, end }) => `${start + 1}–${end}`,
    }}
    hints={{ storageKey: 'consumer-hints' }}
    stickyChapters
    dataMode="follow"
    cache={{ requestTimeoutMs: 5000 }}
    toolbar={({ api, chapter }) => (
      <nav>
        <button onClick={() => api.scrollToIndex(0)}>First</button>
        <button onClick={() => api.openSearch()}>Search</button>
        <span>{chapter?.label}</span>
      </nav>
    )}
    footer={({ snapshot }) => <output>{snapshot.rowCount}</output>}
    apiRef={api}
    dynamicRowHeight
    overscan={3}
    getRowKey={(row) => row.value}
    renderPlaceholder={(slot, retry) => (
      <button role="gridcell" onClick={retry}>
        {slot.status}
      </button>
    )}
    renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
  />
);
export function HeadlessConsumer() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlights, setHighlights] = useState<Marker[]>([]);
  const [selecting, setSelecting] = useState(false);
  const notes = useMemo<Marker[]>(
    () => [{ id: 'note', index: 42, label: 'Note', kind: 'event' }],
    [],
  );
  const scroll = useGranumGrid({
    provider,
    dynamicRowHeight: true,
    markers: notes,
    onOpenSearch: () => setSearchOpen(true),
    onRowActivate: ({ row }) => row.value,
  });
  // @ts-expect-error Explorer UI state belongs to the host, not the hook.
  scroll.setJumpOpen(true);
  // @ts-expect-error The data session is internal; providers and `api` cover host needs.
  scroll.session.retry();
  const integration: GranumGridApi<{ value: number }> = scroll.api;
  // The handle navigates like the framework-independent controller, minus raw locations.
  const navigation: Omit<NavigationController, 'getLocation' | 'restore'> = integration;
  // @ts-expect-error Input and measurement adapters are not part of the host API.
  integration.pan(10);
  // @ts-expect-error There is one handle; no separate controller.
  integration.controller.goTo(0);
  return (
    <>
      <button onClick={() => navigation.goTo(0)}>First</button>
      <button onClick={() => setSelecting(true)}>Select on map</button>
      <JumpBar
        grid={scroll}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onHighlightsChange={setHighlights}
        className="my-search"
      />
      <AtlasRail
        grid={scroll}
        highlights={highlights}
        selecting={selecting}
        onSelectingChange={setSelecting}
        variant="markers"
        actions={<span>{scroll.traveling ? 'Travelling' : scroll.chapter?.label}</span>}
      />
      <div {...scroll.getViewportProps({ style: { height: 320 }, 'aria-label': 'Headless rows' })}>
        <ViewCanvas grid={scroll} />
        {scroll.rows.map((slot) => (
          <div
            key={slot.index}
            {...scroll.getRowProps(slot, {
              className: 'my-row',
              style: { padding: 12 },
              onClick: () => undefined,
            })}
          >
            <span role="gridcell">{slot.status === 'ready' ? slot.row.value : 'Loading'}</span>
          </div>
        ))}
        <div {...scroll.getAnnouncementProps()} />
      </div>
    </>
  );
}
export function RowsOnly() {
  const grid = useHeadlessGrid({ provider, onRowActivate: ({ row }) => row.value });
  return <div {...grid.getViewportProps({ 'aria-label': 'Rows only' })} />;
}
export const engine = createEngine({ rowCount: provider.rowCount });
export const getMountedTable = (): GranumGridApi<{ value: number }> | null => api.current;
api.current?.openSearch('value > 10');
api.current?.setSelection({ start: 0, end: 10 });
api.current?.scrollToIndex(9, { align: 'center' });
const savedView = api.current?.getView();
if (savedView) api.current?.restoreView(savedView);
export const arrayProvider = createArrayProvider([{ value: 1 }], { id: 'small', revision: '1' });
// Published declarations must infer arbitrary payloads through the renderer and API.
type CatalogRow =
  | { kind: 'document'; content: { title: string; tags: readonly string[] } }
  | { kind: 'image'; source: URL }
  | null
  | undefined;
const catalog = createArrayProvider<CatalogRow>(
  [{ kind: 'document', content: { title: 'Notes', tags: ['work'] } }, null, undefined],
  { id: 'catalog', revision: '1' },
);
const catalogApi = createRef<GranumGridApi<CatalogRow>>();
export const catalogExample = (
  <GranumGrid
    provider={catalog}
    apiRef={catalogApi}
    ariaLabel="Mixed catalog"
    onRowActivate={({ row }) => {
      if (row == null) return;
      // @ts-expect-error Activation must retain the provider's payload type.
      row.value;
      return row.kind === 'document' ? row.content.title : row.source.href;
    }}
    renderRow={({ row }) => {
      if (row == null) return 'Missing';
      // @ts-expect-error The generic must retain the host schema, not widen to any.
      row.value;
      return row.kind === 'document' ? row.content.title : row.source.href;
    }}
  />
);
export const textExample = (
  <GranumGrid
    provider={createArrayProvider(['alpha', 'beta'], { id: 'text', revision: '1' })}
    ariaLabel="Plain text"
    renderRow={({ row }) => row.toUpperCase()}
    toolbar={{
      actions: <button>Export</button>,
      fullPageUrl: (view) => `/explore#view=${encodeView(view)}`,
    }}
    footer={false}
    rail={(_, rail) => (
      <div className="my-rail">
        <AtlasRail {...rail} layout="expanded" />
      </div>
    )}
  />
);
export const cache = new PageCache<{ value: number }>();
api.current?.goTo(73_500_000);
api.current?.retry();
export const selected = api.current?.getSelection()?.start;

const view: SavedView = {
  version: 1,
  dataset: provider.id,
  revision: provider.revision,
  location: engine.getLocation(),
  selection: null,
};
export const restored = decodeView(encodeView(view), provider);
export const range = rangeProvider(provider, { start: 100, end: 200 });
engine.appendRows(provider.rowCount + 10, true);
export const accepted = acceptServerRevision;
export const cursor = createCursorProvider;

import {
  GranumGrid,
  JumpBar,
  ViewCanvas,
  createArrayProvider,
  encodeView,
  decodeView,
  type SavedView,
  useGranumGrid,
  type DataProvider,
  type GranumGridAppearance,
  type AtlasRailOptions,
  type GranumGridApi,
  type AggregateRenderContext,
  type NavigationController,
} from 'granum-grid';
import { createEngine } from 'granum-grid/core';
import { PageCache, rangeProvider } from 'granum-grid/data';
import { createRef } from 'react';
import type { GranumGridEngine } from 'granum-grid';
const controller = createRef<GranumGridEngine>();
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
  markerLabels: 'label',
  layout: 'auto',
  formatValue: (value) => value.toFixed(1),
};
const provider: DataProvider<{ value: number }> = {
  id: 'consumer',
  revision: '1',
  rowCount: 100_000_000,
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
    atlas={atlas}
    unstyled
    layout="embedded"
    initialSelection={{ start: 100, end: 200 }}
    onSelectionChange={(range) => range?.start}
    bookmarkStorageKey="consumer-bookmarks"
    fullPageUrl={(view) => `/explore#view=${encodeView(view)}`}
    stickyChapters
    showStats
    followOutput={false}
    dataMode="append"
    cache={{ requestTimeoutMs: 5000 }}
    renderToolbar={({ controller, setJumpOpen }) => (
      <nav>
        <button onClick={() => controller.scrollToIndex(0)}>First</button>
        <button onClick={() => setJumpOpen(true)}>Search</button>
      </nav>
    )}
    renderFooter={({ snapshot }) => <output>{snapshot.rowCount}</output>}
    renderRail={() => null}
    controllerRef={controller}
    apiRef={api}
    dynamicRowHeight
    overscan={3}
    aggregateRowHeight={140}
    formatRange={({ start, end }) => `${start + 1}–${end}`}
    renderAggregate={({ bucket }: AggregateRenderContext) => <p>{bucket.max ?? 'Unavailable'}</p>}
    getRowKey={(row) => row.value}
    renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
  />
);
export function HeadlessConsumer() {
  const scroll = useGranumGrid({ provider, dynamicRowHeight: true });
  const integration: GranumGridApi<{ value: number }> = scroll.api;
  const navigation: NavigationController = integration.controller;
  // @ts-expect-error Input and measurement adapters are not part of the host API.
  integration.controller.pan(10);
  return (
    <>
      <button onClick={() => navigation.goTo(0)}>First</button>
      <JumpBar scroll={scroll} className="my-search" />
      <div {...scroll.getViewportProps({ style: { height: 320 }, 'aria-label': 'Headless rows' })}>
        <ViewCanvas scroll={scroll} />
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
  />
);
export const cache = new PageCache<{ value: number }>();
controller.current?.scrollToIndex(73_500_000, { align: 'center' });
controller.current?.zoomToRange({ start: 100, end: 200 });
const location = controller.current?.getLocation();
if (location) controller.current?.restore(location);

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

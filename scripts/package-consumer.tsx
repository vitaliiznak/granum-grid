import {
  DeepScroll,
  encodeView,
  decodeView,
  type SavedView,
  useDeepScroll,
  type DataProvider,
  type DeepScrollAppearance,
  type AtlasRailOptions,
} from 'deepscroll';
import { createEngine } from 'deepscroll/core';
import { PageCache, rangeProvider } from 'deepscroll/data';
import { createTableTools, type TableToolDefinition } from 'deepscroll/tools';
import { createRef } from 'react';
import type { DeepScrollEngine } from 'deepscroll';
const controller = createRef<DeepScrollEngine>();
const appearance: DeepScrollAppearance = {
  classNames: { row: 'px-4 border-b', toolbar: 'flex gap-2' },
  styles: { footer: { padding: 12 } },
};
const atlas: AtlasRailOptions = {
  variant: 'profile',
  axis: 'rows',
  showRange: true,
  showTracks: true,
  markerLabels: 'label',
  layout: 'auto',
  formatValue: (value) => value.toFixed(1),
};
const provider: DataProvider<{ value: number }> = {
  id: 'consumer',
  revision: '1',
  rowCount: 100_000_000,
  async fetchRows(start, count, signal) {
    signal.throwIfAborted();
    return Array.from({ length: count }, (_, i) => ({ value: start + i }));
  },
};
export const example = (
  <DeepScroll
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
    dynamicRowHeight
    overscan={3}
    getRowKey={(row) => row.value}
    renderRow={({ row }) => <span role="gridcell">{row.value}</span>}
  />
);
export function HeadlessConsumer() {
  const scroll = useDeepScroll({ provider, dynamicRowHeight: true });
  return (
    <div {...scroll.getViewportProps({ style: { height: 320 }, 'aria-label': 'Headless rows' })}>
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
  );
}
export const engine = createEngine({ rowCount: provider.rowCount });
export const tools = createTableTools({
  provider,
  columns: [{ name: 'value', type: 'number' }],
  getController: () => controller.current,
});
export const toolDefinitions: TableToolDefinition[] = tools.definitions;
export const cache = new PageCache<{ value: number }>();
controller.current?.scrollToIndex(73_500_000, { align: 'center' });
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

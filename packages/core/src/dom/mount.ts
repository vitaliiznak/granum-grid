import { createGranumGridApi, type GranumGridApi } from '../core/api.js';
import { createEngine } from '../core/engine.js';
import { validRange } from '../data/bounds.js';
import { DataSession } from '../data/session.js';
import type { CacheOptions, DataProvider, PendingRowSlot, RowRange } from '../data/types.js';
import { jumpAnnouncement } from './announce.js';
import { handleViewportKey } from './keyboard.js';
import { createRowMeasurements } from './measure.js';
import { createRowRequests } from './requests.js';
import { rowMapping, rowWindow } from './rows.js';
import { bindScroll } from './scroll.js';
import { ownsKeys } from './targets.js';
import { observeViewport } from './viewport.js';

export interface MountOptions<Row> {
  provider: DataProvider<Row>;
  /** Accessible name of the rows grid. */
  ariaLabel: string;
  /**
   * Fill a loaded row's element, which arrives empty. Give each cell `role="gridcell"`.
   * Called when the row arrives, not on every scroll frame.
   */
  renderRow(row: Row, index: number, element: HTMLElement): void;
  /** Fill a loading or failed row's element. Default: its row number and status. */
  renderPlaceholder?(slot: PendingRowSlot, element: HTMLElement, retry: () => void): void;
  /** Row height in CSS pixels, or the estimate for unmeasured rows. Default 32. */
  rowHeight?: number;
  /** Measure each loaded row; `rowHeight` becomes the estimate. */
  dynamicRowHeight?: boolean;
  /** Extra rows mounted on each side. Default 2. */
  overscan?: number;
  cache?: CacheOptions<Row>;
  /** Request the page the reader is heading toward once scrolling pauses. Default true. */
  prefetch?: boolean;
  initialIndex?: number;
  /** CSS height of the explorer, such as `480` or `'70vh'`. Default: the stylesheet's. */
  height?: number | string;
}

export interface MountedGrid<Row> {
  /** The same handle as `@granum/react`'s `apiRef`: navigation, selection, and views. */
  readonly api: GranumGridApi<Row>;
  /** The scroll container; focus it for keyboard navigation. */
  readonly viewport: HTMLElement;
  /** Remove the explorer and stop its requests and listeners. */
  destroy(): void;
}

const HIDDEN =
  'position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0';

function defaultPlaceholder(slot: PendingRowSlot, element: HTMLElement, retry: () => void) {
  const cell = element.ownerDocument.createElement('span');
  cell.setAttribute('role', 'gridcell');
  cell.textContent =
    slot.status === 'error'
      ? `Row ${(slot.index + 1).toLocaleString()} could not load. `
      : `Loading row ${(slot.index + 1).toLocaleString()}…`;
  element.append(cell);
  if (slot.status === 'error') {
    const button = element.ownerDocument.createElement('button');
    button.className = 'gr-button';
    button.textContent = 'Retry';
    button.addEventListener('click', retry);
    cell.append(button);
  }
}

/**
 * Granum Grid without a framework: rows of any provider in a native scroller, with typed
 * jumps, history, keys, and measured heights, inside `element`. The same pieces drive
 * `@granum/react`; style it with `@granum/core/styles.css` or `base.css`. Add the dataset
 * map beside it with `mountMap(element, { target: gridTarget(grid.api) })` from
 * `@granum/core/map`.
 */
export function mount<Row>(element: HTMLElement, options: MountOptions<Row>): MountedGrid<Row> {
  const {
    provider,
    ariaLabel,
    renderRow,
    renderPlaceholder = defaultPlaceholder,
    rowHeight = 32,
    dynamicRowHeight = false,
    overscan = 2,
    cache,
    prefetch = true,
    initialIndex = 0,
  } = options;
  const document = element.ownerDocument;
  const create = (className: string, part?: string) => {
    const node = document.createElement('div');
    node.className = className;
    if (part) node.dataset.grPart = part;
    return node;
  };
  const root = create('gr-root');
  root.dataset.grRoot = '';
  root.dataset.layout = 'embedded';
  root.dataset.theme = 'system';
  root.dataset.motion = 'on';
  if (options.height !== undefined)
    root.style.height = typeof options.height === 'number' ? `${options.height}px` : options.height;
  const body = create('gr-body', 'body');
  const viewport = create('gr-viewport', 'viewport');
  viewport.setAttribute('role', 'grid');
  viewport.setAttribute('aria-label', ariaLabel);
  viewport.setAttribute('aria-rowcount', String(provider.rowCount));
  viewport.tabIndex = 0;
  viewport.style.cssText =
    'position:relative;overflow-x:hidden;overflow-y:auto;overflow-anchor:none;min-width:0;flex:1';
  const layer = create('gr-view-layer', 'layer');
  layer.setAttribute('role', 'rowgroup');
  layer.style.cssText = 'position:absolute;inset:0;overflow:hidden';
  const live = document.createElement('div');
  live.className = 'gr-sr';
  live.setAttribute('aria-live', 'polite');
  live.style.cssText = HIDDEN;
  viewport.append(layer);
  body.append(viewport);
  root.append(body, live);
  element.append(root);

  const engine = createEngine({
    rowCount: provider.rowCount,
    rowHeight,
    dynamicRowHeight,
    initialIndex,
  });
  const session = new DataSession(provider, cache);
  let selection: RowRange | null = null;
  let visibleRange: RowRange = { start: 0, end: 0 };
  let velocity = 0;
  const announce = (message: string) => {
    live.textContent = message;
  };
  const api = createGranumGridApi(provider, engine, {
    getSelection: () => selection,
    setSelection: (range) => {
      selection = range && validRange(range, provider.rowCount) ? range : null;
      schedule();
    },
    getVisibleRange: () => visibleRange,
    openSearch: () => {},
    retry: () => session.retry(),
  });
  const measurements = dynamicRowHeight ? createRowMeasurements(engine) : undefined;
  const requests = createRowRequests(engine, session, () => velocity);
  const layout = { rowHeight, dynamic: dynamicRowHeight };

  /** Row elements by address, and the status each was last filled for. */
  const mounted = new Map<number, { element: HTMLElement; filled: string }>();
  let markers = session.markers,
    chapters = session.chapters;
  function render() {
    if (session.markers !== markers || session.chapters !== chapters) {
      markers = session.markers;
      chapters = session.chapters;
      engine.setMetadata(markers, chapters);
    }
    const mapping = rowMapping(engine, layout);
    const view = rowWindow(engine, session, mapping, {
      ...layout,
      rowCount: provider.rowCount,
      overscan,
    });
    visibleRange = view.visibleRange;
    const keep = new Set<number>();
    for (const slot of view.rows) {
      keep.add(slot.index);
      let entry = mounted.get(slot.index);
      if (!entry) {
        const row = create('gr-row', 'row');
        row.setAttribute('role', 'row');
        row.setAttribute('aria-rowindex', String(slot.index + 1));
        row.style.cssText = 'position:absolute;box-sizing:border-box;top:0;left:0;right:0';
        if (dynamicRowHeight) row.classList.add('gr-row-dynamic');
        layer.append(row);
        entry = { element: row, filled: '' };
        mounted.set(slot.index, entry);
      }
      const row = entry.element;
      if (entry.filled !== slot.status) {
        row.replaceChildren();
        row.dataset.status = slot.status;
        if (slot.status === 'ready') renderRow(slot.row, slot.index, row);
        else renderPlaceholder(slot, row, () => session.retry());
        entry.filled = slot.status;
        if (measurements && slot.status === 'ready') measurements.ref(slot.index)(row);
      }
      const selected = !!selection && slot.index >= selection.start && slot.index < selection.end;
      row.toggleAttribute('data-selected', selected);
      if (selection) row.setAttribute('aria-selected', String(selected));
      else row.removeAttribute('aria-selected');
      row.style.height = dynamicRowHeight && slot.status === 'ready' ? 'auto' : `${slot.height}px`;
      row.style.transform = `translateY(${slot.y}px)`;
    }
    for (const [index, entry] of mounted) {
      if (keep.has(index)) continue;
      measurements?.ref(index)(null);
      entry.element.remove();
      mounted.delete(index);
    }
    requests.update({ start: view.start, count: view.count, prefetch });
    // New rows are measured before paint, so none shows at an estimated position.
    measurements?.flush();
  }
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      render();
    });
  }

  const offs = [
    engine.subscribe(schedule),
    session.subscribe(schedule),
    engine.onNavigate((event) => announce(jumpAnnouncement(engine, session.chapters, event))),
    observeViewport(viewport, engine, measurements),
    bindScroll(viewport, engine, {
      layer,
      onVelocity: (value) => {
        velocity = value;
      },
    }),
  ];
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || ownsKeys(event.target)) return;
    handleViewportKey(event, { engine, announce });
  };
  viewport.addEventListener('keydown', keydown);
  measurements?.start();
  session.start();
  engine.setViewport(viewport.clientHeight || 480);
  render();

  return {
    api,
    viewport,
    destroy() {
      viewport.removeEventListener('keydown', keydown);
      offs.forEach((off) => off());
      measurements?.stop();
      requests.destroy();
      session.stop();
      engine.destroy();
      root.remove();
    },
  };
}

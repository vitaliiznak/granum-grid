import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
} from '@tanstack/virtual-core';
import type { Bucket, DataProvider, Marker } from '@granum-grid/core/data';
import { mount } from '@granum-grid/core/dom';
import { gridTarget, mountMap, scrollerTarget, type MapTarget } from '@granum-grid/core/map';
import '@granum-grid/core/styles.css';
import './example-page.css';

/** A smooth signal with three bursts, computed from a row's share of its dataset. */
const signal = (share: number) =>
  50 +
  25 * Math.sin(share * Math.PI * 6) +
  [0.21, 0.55, 0.83].reduce((sum, at) => sum + 60 * Math.exp(-(((share - at) / 0.01) ** 2)), 0);

/** A sampled profile for the map: each group's value at its middle row. */
function profile(rowCount: number, groups = 240): Bucket[] {
  return Array.from({ length: Math.min(groups, rowCount) }, (_, i) => {
    const start = Math.floor((i * rowCount) / Math.min(groups, rowCount));
    const end = Math.floor(((i + 1) * rowCount) / Math.min(groups, rowCount));
    const value = signal((start + end) / 2 / rowCount);
    return {
      start,
      end,
      count: end - start,
      avg: value,
      min: value,
      max: value,
      accuracy: 'estimated',
    };
  });
}
const bursts = (rowCount: number): Marker[] =>
  [0.21, 0.55, 0.83].map((at, i) => ({
    id: `burst-${i + 1}`,
    index: Math.round(at * (rowCount - 1)),
    label: `Burst ${i + 1}`,
    kind: 'spike',
  }));
const metric = { label: 'Signal', kind: 'value' as const, domain: [0, 140] as const };
const text = (index: number, rowCount: number) =>
  `${(index + 1).toLocaleString('en-US')} · ${signal(index / rowCount).toFixed(1)}`;

// 1. Granum Grid's own explorer, without React, over four billion addresses.
const GRANUM = 4_000_000_000;
const provider: DataProvider<number> = {
  id: 'scrollers-granum',
  revision: '1',
  rowCount: GRANUM,
  async fetchRows(start, count) {
    return Array.from({ length: count }, (_, offset) => start + offset);
  },
};
const grid = mount(document.getElementById('granum-rows')!, {
  provider,
  ariaLabel: 'Granum rows',
  height: 360,
  rowHeight: 28,
  renderRow(index, _, element) {
    const cell = document.createElement('span');
    cell.setAttribute('role', 'gridcell');
    cell.textContent = text(index, GRANUM);
    element.append(cell);
  },
});
mountMap(document.getElementById('granum-map')!, {
  target: gridTarget(grid.api),
  overview: profile(GRANUM),
  markers: bursts(GRANUM),
  metric,
  ariaLabel: 'Granum position',
});

// 2. TanStack Virtual's framework-free core, with its own scroller and spacer.
const TANSTACK = 500_000;
const ROW = 28;
const tanstack = document.getElementById('tanstack')!;
const spacer = tanstack.querySelector<HTMLElement>('.spacer')!;
const listeners = new Set<() => void>();
const virtualizer = new Virtualizer<HTMLElement, HTMLElement>({
  count: TANSTACK,
  getScrollElement: () => tanstack,
  estimateSize: () => ROW,
  scrollToFn: elementScroll,
  observeElementRect,
  observeElementOffset,
  overscan: 6,
  onChange: () => {
    renderTanstack();
    listeners.forEach((listener) => listener());
  },
});
function renderTanstack() {
  spacer.style.height = `${virtualizer.getTotalSize()}px`;
  spacer.replaceChildren(
    ...virtualizer.getVirtualItems().map((item) => {
      const row = document.createElement('div');
      row.setAttribute('role', 'listitem');
      row.className = 'plain-row';
      row.style.transform = `translateY(${item.start}px)`;
      row.textContent = text(item.index, TANSTACK);
      return row;
    }),
  );
}
virtualizer._didMount();
virtualizer._willUpdate();
renderTanstack();
const tanstackTarget: MapTarget = {
  rowCount: () => TANSTACK,
  visibleRange: () => {
    const top = virtualizer.scrollOffset ?? 0;
    return {
      start: Math.min(TANSTACK - 1, Math.floor(top / ROW)),
      end: Math.min(TANSTACK, Math.ceil((top + tanstack.clientHeight) / ROW)),
    };
  },
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  scrollToIndex: (index) => virtualizer.scrollToIndex(index, { align: 'start' }),
};
mountMap(document.getElementById('tanstack-map')!, {
  target: tanstackTarget,
  overview: profile(TANSTACK),
  markers: bursts(TANSTACK),
  metric,
  ariaLabel: 'TanStack position',
});

// 3. A plain overflow list: every row is a real element.
const PLAIN = 10_000;
const plain = document.getElementById('plain')!;
plain.append(
  ...Array.from({ length: PLAIN }, (_, index) => {
    const row = document.createElement('div');
    row.setAttribute('role', 'listitem');
    row.className = 'plain-row plain-static';
    row.textContent = text(index, PLAIN);
    return row;
  }),
);
mountMap(document.getElementById('plain-map')!, {
  target: scrollerTarget(plain, { rowCount: PLAIN, rowHeight: ROW }),
  overview: profile(PLAIN),
  markers: bursts(PLAIN),
  metric,
  ariaLabel: 'Plain list position',
});

import { mount } from '@granum/core/dom';
import type { DataProvider } from '@granum/core/data';
import '@granum/core/styles.css';
import './example-page.css';

type Reading = { time: string; value: number };

/** A billion readings, one per second from 2000, computed from the row's address. */
const ROWS = 1_000_000_000;
const START = Date.UTC(2000, 0, 1);
const readingAt = (index: number): Reading => ({
  time: new Date(START + index * 1000).toISOString().slice(0, 19).replace('T', ' '),
  value: 50 + 30 * Math.sin(index / 9_000_000) + 8 * Math.sin(index / 1_300),
});

const provider: DataProvider<Reading> = {
  id: 'plain-readings',
  revision: '1',
  rowCount: ROWS,
  async fetchRows(start, count, signal) {
    signal.throwIfAborted();
    return Array.from({ length: count }, (_, offset) => readingAt(start + offset));
  },
};

const cell = (text: string) => {
  const span = document.createElement('span');
  span.setAttribute('role', 'gridcell');
  span.textContent = text;
  return span;
};

const grid = mount(document.getElementById('grid')!, {
  provider,
  ariaLabel: 'Readings without a framework',
  height: '70vh',
  renderRow(row, index, element) {
    element.append(
      cell((index + 1).toLocaleString('en-US')),
      cell(row.time),
      cell(row.value.toFixed(2)),
    );
  },
});

const position = document.getElementById('position')!;
grid.api.subscribe(() => {
  const { activeIndex, rowCount } = grid.api.getSnapshot();
  position.textContent = `Row ${((activeIndex ?? 0) + 1).toLocaleString('en-US')} of ${rowCount.toLocaleString('en-US')}`;
});
document.getElementById('jump')!.addEventListener('submit', (event) => {
  event.preventDefault();
  const typed = Number(
    (document.getElementById('row') as HTMLInputElement).value.replace(/[,_\s]/g, ''),
  );
  if (Number.isSafeInteger(typed) && typed >= 1) grid.api.goTo(Math.min(typed, ROWS) - 1);
});
document.getElementById('back')!.addEventListener('click', () => grid.api.back());

import { expect, it } from 'vitest';
import { createActiveCell } from '../src/dom/cells';

/** Just enough of an element: an id, attributes, and its `[role="gridcell"]` children. */
class Fake {
  id = '';
  readonly attributes = new Map<string, string>();
  constructor(readonly cells: Fake[] = []) {}
  querySelectorAll() {
    return this.cells;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
}
const element = (fake: Fake) => fake as unknown as Element;
const row = (id: string, cells: number) => {
  const fake = new Fake(Array.from({ length: cells }, () => new Fake()));
  fake.id = id;
  return fake;
};
const key = (name: string, modifiers: { alt?: boolean; shift?: boolean } = {}) => {
  const event = {
    key: name,
    altKey: !!modifiers.alt,
    ctrlKey: false,
    metaKey: false,
    shiftKey: !!modifiers.shift,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
  };
  return event;
};

it('names a cell of the focused row, keeps its column across rows, and stops at the ends', () => {
  const grid = new Fake();
  const active = createActiveCell();
  const activeId = () => grid.attributes.get('aria-activedescendant');
  const first = row('g-row-0', 3);
  active.sync(element(grid), element(first));
  expect(activeId()).toBe('g-row-0-cell-0');
  expect(first.cells[0]!.attributes.has('data-gr-active-cell')).toBe(true);

  const right = key('ArrowRight');
  expect(active.handleKey(right, element(grid), element(first))).toBe(true);
  expect(right.prevented).toBe(true);
  active.handleKey(key('ArrowRight'), element(grid), element(first));
  active.handleKey(key('ArrowRight'), element(grid), element(first));
  expect(activeId()).toBe('g-row-0-cell-2');
  expect(first.cells[0]!.attributes.has('data-gr-active-cell')).toBe(false);

  // A shorter row shows its last cell and keeps the column for the next full row.
  const placeholder = row('g-row-1', 2);
  active.sync(element(grid), element(placeholder));
  expect(activeId()).toBe('g-row-1-cell-1');
  const loaded = row('g-row-1', 3);
  active.sync(element(grid), element(loaded));
  expect(activeId()).toBe('g-row-1-cell-2');

  for (let i = 0; i < 5; i++) active.handleKey(key('ArrowLeft'), element(grid), element(loaded));
  expect(activeId()).toBe('g-row-1-cell-0');
});

it('leaves other keys, modified arrows, and rows without cells to the caller', () => {
  const grid = new Fake();
  const active = createActiveCell();
  const cells = row('g-row-2', 3);
  for (const event of [
    key('ArrowDown'),
    key('ArrowLeft', { alt: true }),
    key('ArrowRight', { shift: true }),
  ]) {
    expect(active.handleKey(event, element(grid), element(cells))).toBe(false);
    expect(event.prevented).toBe(false);
  }
  expect(active.handleKey(key('ArrowRight'), element(grid), element(row('g-row-3', 0)))).toBe(
    false,
  );
  expect(active.handleKey(key('ArrowRight'), element(grid), null)).toBe(false);
});

it('keeps a cell id the host set, names a row without cells, and clears without a row', () => {
  const grid = new Fake();
  const active = createActiveCell();
  const named = row('g-row-4', 2);
  named.cells[0]!.id = 'reading-4-time';
  active.sync(element(grid), element(named));
  expect(grid.attributes.get('aria-activedescendant')).toBe('reading-4-time');

  active.sync(element(grid), element(row('g-row-5', 0)));
  expect(grid.attributes.get('aria-activedescendant')).toBe('g-row-5');
  expect(named.cells[0]!.attributes.has('data-gr-active-cell')).toBe(false);

  active.sync(element(grid), null);
  expect(grid.attributes.has('aria-activedescendant')).toBe(false);
});

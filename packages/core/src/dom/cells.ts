/**
 * The grid's active cell. The viewport keeps focus and `aria-activedescendant` names one
 * cell of the focused row, so arrows move a screen reader through cells, as `role="grid"`
 * promises: Up and Down change the row and keep the column, Left and Right change the cell.
 * A shorter row shows its last cell and keeps the column for the next.
 *
 * Cells are the row's `[role="gridcell"]` elements, rendered by the host. One without an id
 * gets `<row id>-cell-<n>`. A row without cells is named itself. The active cell carries
 * `data-gr-active-cell` for styling.
 */
export interface ActiveCell {
  /** Point `grid`'s `aria-activedescendant` at the active cell of `row`, or clear it. */
  sync(grid: Element, row: Element | null): void;
  /** Plain Left or Right: move one cell within `row`. Returns whether it handled the key. */
  handleKey(
    event: Pick<
      KeyboardEvent,
      'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'preventDefault'
    >,
    grid: Element,
    row: Element | null,
  ): boolean;
}

const cellsOf = (row: Element | null) =>
  row ? Array.from(row.querySelectorAll('[role="gridcell"]')) : [];

export function createActiveCell(): ActiveCell {
  let column = 0;
  let marked: Element | null = null;
  const sync = (grid: Element, row: Element | null) => {
    const cells = cellsOf(row);
    const index = Math.min(column, cells.length - 1);
    const cell = cells[index] ?? null;
    if (marked !== cell) {
      marked?.removeAttribute('data-gr-active-cell');
      cell?.setAttribute('data-gr-active-cell', '');
      marked = cell;
    }
    if (cell && !cell.id && row?.id) cell.id = `${row.id}-cell-${index}`;
    const id = cell?.id || row?.id;
    if (id) grid.setAttribute('aria-activedescendant', id);
    else grid.removeAttribute('aria-activedescendant');
  };
  return {
    sync,
    handleKey(event, grid, row) {
      const step =
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
          ? 0
          : event.key === 'ArrowRight'
            ? 1
            : event.key === 'ArrowLeft'
              ? -1
              : 0;
      const last = cellsOf(row).length - 1;
      if (!step || last < 0) return false;
      event.preventDefault();
      column = Math.max(0, Math.min(last, Math.min(column, last) + step));
      sync(grid, row);
      return true;
    },
  };
}

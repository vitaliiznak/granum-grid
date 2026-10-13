import { checkRowRequest } from './bounds.js';
import type {
  ColumnEdit,
  ColumnFilter,
  CursorWindow,
  CursorWindowQuery,
  DataProvider,
  FilterOperator,
  RowEdit,
  ServerAction,
  ServerColumn,
  ServerDataset,
} from './types.js';

const COMPARE: readonly FilterOperator[] = ['>', '>=', '<', '<=', '=', '!='];
const EQUALITY: readonly FilterOperator[] = ['=', '!='];

function columnOf(columns: readonly ServerColumn[], id: string): ServerColumn | undefined {
  return columns.find((column) => column.id === id);
}

function valueFits(column: ServerColumn, value: string | number | boolean): boolean {
  if (column.type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (column.type === 'boolean') return typeof value === 'boolean';
  return typeof value === 'string';
}

function operatorFits(column: ServerColumn, operator: FilterOperator): boolean {
  if (operator === 'contains') return column.type === 'text';
  if (column.type === 'boolean' || column.type === 'text') return EQUALITY.includes(operator);
  return COMPARE.includes(operator);
}

function indexIssue(index: number, rowCount?: number): string | null {
  if (!Number.isSafeInteger(index) || index < 0) return 'Row address must be a nonnegative integer';
  if (rowCount !== undefined && index >= rowCount)
    return `Row address ${index} is outside ${rowCount} rows`;
  return null;
}

function isColumnEdit<Row>(edit: RowEdit<Row> | ColumnEdit): edit is ColumnEdit {
  return 'columnId' in edit;
}

/**
 * Refuse a sort, filter, or edit the server's column model does not allow.
 * This checks the published model only. It does not reorder, scan, or mutate rows.
 * An empty sort or filter list asks the server to clear that operation.
 */
export function serverActionIssue<Row>(
  action: ServerAction<Row>,
  columns: readonly ServerColumn[],
  rowCount?: number,
): string | null {
  if (action.kind === 'sort') {
    const seen = new Set<string>();
    for (const key of action.keys) {
      if (key.direction !== 'asc' && key.direction !== 'desc')
        return 'Sort direction must be asc or desc';
      if (seen.has(key.columnId)) return `Sort already includes ${key.columnId}`;
      seen.add(key.columnId);
      const column = columnOf(columns, key.columnId);
      if (!column) return `This server has no column ${key.columnId}`;
      if (column.sortable !== true) return `${column.label} is not sortable on the server`;
    }
    return null;
  }
  if (action.kind === 'filter') {
    for (const filter of action.filters) {
      const issue = filterIssue(filter, columns);
      if (issue) return issue;
    }
    return null;
  }
  const address = indexIssue(action.edit.index, rowCount);
  if (address) return address;
  if (!isColumnEdit(action.edit)) return null;
  const column = columnOf(columns, action.edit.columnId);
  if (!column) return `This server has no column ${action.edit.columnId}`;
  if (column.editable !== true) return `${column.label} is not editable on the server`;
  if (!valueFits(column, action.edit.value))
    return `${column.label} requires a ${column.type} value`;
  return null;
}

function filterIssue(filter: ColumnFilter, columns: readonly ServerColumn[]): string | null {
  const column = columnOf(columns, filter.columnId);
  if (!column) return `This server has no column ${filter.columnId}`;
  if (column.filterable !== true) return `${column.label} is not filterable on the server`;
  if (!operatorFits(column, filter.operator))
    return `${column.label} does not support ${filter.operator} on the server`;
  if (!valueFits(column, filter.value)) return `${column.label} requires a ${column.type} value`;
  return null;
}

/** Refuse a cursor window the server cannot answer: a bad size, or a cursor that is not opaque. */
export function cursorWindowIssue(query: CursorWindowQuery): string | null {
  if (!Number.isSafeInteger(query.windowSize) || query.windowSize < 1)
    return 'Window size must be a positive integer';
  if (query.cursor !== null && (typeof query.cursor !== 'string' || query.cursor === ''))
    return 'A cursor must be an opaque string, or null to start at the first row';
  return null;
}

/**
 * Accept one server page. The window may be shorter than requested only when its
 * next cursor explains how to resume, or when it reaches `rowCount`. It must not
 * extend past the revision or invent rows beyond `windowSize`.
 */
export function acceptCursorWindow<Row>(
  window: CursorWindow<Row>,
  request: { windowSize: number; rowCount: number },
): CursorWindow<Row> {
  const issue = cursorWindowIssue({ cursor: null, windowSize: request.windowSize });
  if (issue) throw new RangeError(issue);
  if (!Number.isSafeInteger(request.rowCount) || request.rowCount < 0)
    throw new RangeError('Server revision has an invalid row count');
  if (!Number.isSafeInteger(window.start) || window.start < 0 || window.start > request.rowCount)
    throw new RangeError('Server window starts outside this revision');
  if (!Array.isArray(window.rows) || window.rows.length > request.windowSize)
    throw new Error('Server window is larger than the requested window');
  if (window.start + window.rows.length > request.rowCount)
    throw new RangeError('Server window extends outside this revision');
  const finished = window.start + window.rows.length === request.rowCount;
  if (finished && window.nextCursor !== null)
    throw new Error('Server window reported another page at the end of the revision');
  if (!finished && (typeof window.nextCursor !== 'string' || window.nextCursor === ''))
    throw new Error('Server window omitted the cursor for the following rows');
  return window;
}

/**
 * Navigate a server that returns rows as a cursor plus a window size.
 * `fetchRows` seeks with `cursorAt` and follows `nextCursor` only until the requested
 * slice is full. It does not walk the rest of the revision.
 */
export function createCursorProvider<Row>(
  dataset: Pick<ServerDataset<Row>, 'cursorAt' | 'fetchWindow'>,
  identity: { id: string; revision: string; rowCount: number },
): DataProvider<Row> {
  return {
    ...identity,
    async fetchRows(start, count, signal) {
      checkRowRequest(start, count, identity.rowCount);
      signal.throwIfAborted();
      if (count === 0) return [];
      const rows: Row[] = [];
      let cursor = start === 0 ? null : await dataset.cursorAt(start, signal);
      if (start > 0 && (typeof cursor !== 'string' || cursor === ''))
        throw new Error('The server did not provide a cursor for this address');
      let expected = start;
      while (rows.length < count) {
        signal.throwIfAborted();
        const windowSize = count - rows.length;
        const query = { cursor, windowSize };
        const issue = cursorWindowIssue(query);
        if (issue) throw new RangeError(issue);
        const window = acceptCursorWindow(await dataset.fetchWindow(query, signal), {
          windowSize,
          rowCount: identity.rowCount,
        });
        if (window.start !== expected || window.rows.length === 0)
          throw new Error('The server window does not continue at the requested address');
        const take = window.rows.slice(0, count - rows.length);
        rows.push(...take);
        expected += take.length;
        if (rows.length === count) break;
        if (window.nextCursor === null)
          throw new Error('The server window ended before the requested rows');
        cursor = window.nextCursor;
      }
      return rows;
    },
  };
}

/**
 * Install a provider returned by a server sort, filter, or edit.
 * The dataset id stays. The revision must change, because the previous order's
 * addresses, cache, and saved views belong to the previous snapshot.
 */
export function acceptServerRevision<Row>(
  current: { id: string; revision: string },
  next: DataProvider<Row>,
): DataProvider<Row> {
  if (next.id !== current.id)
    throw new Error('A server action must keep the dataset id and publish a new revision');
  if (next.revision === '' || next.revision === current.revision)
    throw new Error('A server action must publish a new revision');
  if (!Number.isSafeInteger(next.rowCount) || next.rowCount < 0)
    throw new RangeError('Server revision has an invalid row count');
  return next;
}

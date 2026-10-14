import type { GranumGridEngine } from '../core/engine.js';
import { pixelToRow, rowToPixel, type CoordinateMapping } from '../core/mappings.js';
import { bucketAt } from '../core/navigation.js';
import type { DataSession } from '../data/session.js';
import type { RowRange, RowSlot } from '../data/types.js';

export interface RowLayout {
  /** Row height in CSS pixels, or the estimate for unmeasured rows when `dynamic`. */
  rowHeight: number;
  /** Rows are measured; their heights come from the engine's measurements. */
  dynamic: boolean;
}

/** Viewport pixels for row addresses at the engine's current position. */
export function rowMapping(
  engine: Pick<GranumGridEngine, 'getSnapshot' | 'rowSizes'>,
  { rowHeight, dynamic }: RowLayout,
): CoordinateMapping {
  const origin = engine.getSnapshot().position;
  const sizes = engine.rowSizes;
  return dynamic
    ? {
        toPixel: (row) => sizes.distance(origin, row),
        toRow: (pixel) => sizes.advance(origin, pixel),
      }
    : {
        toPixel: (row) => rowToPixel(row, origin, rowHeight),
        toRow: (pixel) => pixelToRow(pixel, origin, rowHeight),
      };
}

export interface RowWindow<Row> {
  /** First mounted row and how many: the visible rows plus `overscan` on each side. */
  start: number;
  count: number;
  /** Rows in view, half-open. */
  visibleRange: RowRange;
  /** The mounted rows, ready or pending, at viewport pixels. */
  rows: RowSlot<Row>[];
}

/**
 * The bounded rows to mount for a viewport: the visible ones and `overscan` on each side,
 * each ready from the session's cache or pending with the overview's estimate.
 */
export function rowWindow<Row>(
  engine: Pick<GranumGridEngine, 'getSnapshot' | 'rowSizes'>,
  session: Pick<DataSession<Row>, 'read' | 'has' | 'error' | 'overview'>,
  mapping: CoordinateMapping,
  { rowHeight, dynamic, rowCount, overscan }: RowLayout & { rowCount: number; overscan: number },
): RowWindow<Row> {
  const { height } = engine.getSnapshot();
  const start = Math.max(0, Math.floor(mapping.toRow(0)) - overscan);
  const count = Math.max(
    0,
    Math.min(rowCount - start, Math.ceil(mapping.toRow(height)) - start + overscan),
  );
  const visibleRange = {
    start: Math.max(0, Math.floor(mapping.toRow(0))),
    end: Math.min(rowCount, Math.ceil(mapping.toRow(height))),
  };
  const sizes = engine.rowSizes;
  const rows = Array.from({ length: count }, (_, offset): RowSlot<Row> => {
    const index = start + offset;
    const common = {
      index,
      y: mapping.toPixel(index),
      height: dynamic ? sizes.size(index) : rowHeight,
    };
    if (session.has(index)) return { ...common, status: 'ready', row: session.read(index) as Row };
    const error = session.error(index);
    return {
      ...common,
      status: error ? 'error' : 'loading',
      error,
      estimate: bucketAt(session.overview, index),
    };
  });
  return { start, count, visibleRange, rows };
}

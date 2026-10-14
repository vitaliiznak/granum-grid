export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export const rowToPixel = (row: number, position: number, rowHeight: number) =>
  (row - position) * rowHeight;
export const pixelToRow = (pixel: number, position: number, rowHeight: number) =>
  position + pixel / rowHeight;
export const rowToProgress = (row: number, count: number) =>
  count > 1 ? clamp(row / (count - 1), 0, 1) : 0;
export const progressToRow = (progress: number, count: number) =>
  clamp(progress, 0, 1) * Math.max(0, count - 1);
export const wheelPixels = (delta: number, mode: number, height: number, rowHeight: number) =>
  delta * (mode === 1 ? rowHeight : mode === 2 ? height : 1);
export interface CoordinateMapping {
  toPixel(row: number): number;
  toRow(pixel: number): number;
}
export function createZoomMapping(
  position: number,
  height: number,
  rowsPerPixel: number,
): CoordinateMapping {
  return {
    toPixel: (row) => height / 2 + (row - position) / rowsPerPixel,
    toRow: (pixel) => position + (pixel - height / 2) * rowsPerPixel,
  };
}

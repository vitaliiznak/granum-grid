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
export interface CoordinateMapping {
  toPixel(row: number): number;
  toRow(pixel: number): number;
}

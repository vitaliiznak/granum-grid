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
export function createLensMapping(
  position: number,
  count: number,
  height: number,
  rowHeight: number,
): CoordinateMapping {
  const focus = Math.min(3, height / rowHeight / 4),
    center = height / 2;
  function tail(extent: number) {
    if (extent * rowHeight <= center)
      return { to: (d: number) => d * rowHeight, from: (y: number) => y / rowHeight };
    const target = center / rowHeight - focus;
    let lo = 1e-12,
      hi = Math.max(1, extent);
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (mid * Math.log1p((extent - focus) / mid) > target) hi = mid;
      else lo = mid;
    }
    const scale = (lo + hi) / 2;
    return {
      to: (d: number) =>
        rowHeight * (d <= focus ? d : focus + scale * Math.log1p((d - focus) / scale)),
      from: (y: number) =>
        y / rowHeight <= focus
          ? y / rowHeight
          : focus + scale * Math.expm1((y / rowHeight - focus) / scale),
    };
  }
  const left = tail(position),
    right = tail(Math.max(0, count - 1 - position));
  return {
    toPixel: (row) =>
      center + (row < position ? -left.to(position - row) : right.to(row - position)),
    toRow: (pixel) =>
      position + (pixel < center ? -left.from(center - pixel) : right.from(pixel - center)),
  };
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

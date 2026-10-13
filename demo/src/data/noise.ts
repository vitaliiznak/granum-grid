/** Deterministic, worker-safe noise helpers shared by the synthetic datasets. */
function mix(x: number) {
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}
/** Uniform [0, 1) value for a row and a salt. Stable for any safe-integer index. */
export function noise(index: number, salt = 0) {
  const low = index >>> 0,
    high = Math.floor(index / 4294967296);
  return mix(mix(low ^ Math.imul(salt + 1, 0x9e3779b9)) ^ (high + salt * 0x632be5ab)) / 4294967296;
}
/** Approximately normal value with mean 0 and standard deviation 1. */
export function gaussian(index: number, salt = 0) {
  return (noise(index, salt) + noise(index, salt + 101) + noise(index, salt + 202) - 1.5) * 2;
}
export function pick<T>(items: readonly T[], value: number): T {
  return items[Math.min(items.length - 1, Math.floor(value * items.length))];
}
export const bump = (x: number, center: number, width: number) =>
  Math.exp(-(((x - center) / width) ** 2));
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

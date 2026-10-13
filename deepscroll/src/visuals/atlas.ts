import type { Bucket } from '../data/types.js';
export function prepareCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, rect.width, rect.height);
  return { context, width: rect.width, height: rect.height };
}
export function drawAtlas(canvas: HTMLCanvasElement, buckets: Bucket[], total: number, domain: readonly [number, number], kind: 'value' | 'density' = 'value') {
  const target = prepareCanvas(canvas); if (!target || total < 1) return;
  const { context: ctx, width, height } = target;
  const accent = getComputedStyle(canvas).getPropertyValue('--ds-accent').trim() || '#abe6b9';
  const scale = (value: number) => Math.max(0, Math.min(1, (value - domain[0]) / Math.max(1e-9, domain[1] - domain[0]))) * (width - 16);
  for (const bucket of buckets) {
    if (bucket.accuracy === 'unavailable') continue;
    const y = bucket.start / total * height;
    const h = Math.max(.6, (bucket.end - bucket.start) / total * height);
    const avg = kind === 'density' ? (bucket.count ?? 0) / (bucket.end - bucket.start) : bucket.avg ?? 0;
    ctx.fillStyle = accent; ctx.globalAlpha = .10;
    ctx.fillRect(0, y, scale(kind === 'density' ? avg : bucket.max ?? avg), h);
    ctx.globalAlpha = .3; ctx.fillRect(0, y, scale(avg), h);
    ctx.globalAlpha = .8; ctx.fillRect(scale(avg), y, 1.2, h);
  }
  ctx.globalAlpha = 1;
}

import type { Bucket, Chapter } from '../data/types.js';

export function atlasDomain(
  buckets: Bucket[],
  domain?: readonly [number, number],
  kind = 'value',
): readonly [number, number] {
  if (domain && Number.isFinite(domain[0]) && Number.isFinite(domain[1]) && domain[1] > domain[0])
    return domain;
  if (kind === 'density') return [0, 1];
  const values = buckets
    .filter((b) => b.accuracy !== 'unavailable')
    .flatMap((b) => [b.min, b.avg, b.max])
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values);
  return [min, max > min ? max : min + 1];
}

export function atlasTicks(
  total: number,
  chapters: Chapter[],
  axis: 'chapters' | 'rows',
  limit = 5,
) {
  if (!total) return [];
  const count = Math.max(2, Math.floor(limit));
  if (axis === 'chapters' && chapters.length) {
    const n = Math.min(count, chapters.length);
    return Array.from(
      { length: n },
      (_, i) => chapters[n === 1 ? 0 : Math.round((i * (chapters.length - 1)) / (n - 1))],
    ).map((c) => ({ index: c.start, label: c.label }));
  }
  const positions = [
    ...new Set(
      Array.from({ length: count }, (_, i) => Math.round((i * (total - 1)) / (count - 1))),
    ),
  ];
  return positions.map((index) => ({
    index,
    label: Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
      index + 1,
    ),
  }));
}

export function profileValue(bucket: Bucket, kind: 'value' | 'density') {
  if (bucket.accuracy === 'unavailable') return null;
  const value =
    kind === 'density'
      ? bucket.count === null || bucket.end <= bucket.start
        ? null
        : bucket.count / (bucket.end - bucket.start)
      : bucket.avg;
  return value !== null && Number.isFinite(value) ? value : null;
}

export function prepareCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(rect.width * ratio),
    height = Math.round(rect.height * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  return { context, width: rect.width, height: rect.height };
}

export function drawAtlas(
  canvas: HTMLCanvasElement,
  buckets: Bucket[],
  total: number,
  domain: readonly [number, number],
  kind: 'value' | 'density' = 'value',
  showRange = false,
) {
  const target = prepareCanvas(canvas);
  if (!target || total < 1) return;
  const { context: ctx, width, height } = target;
  const styles = getComputedStyle(canvas);
  const accent = styles.getPropertyValue('--ds-accent').trim() || styles.color;
  const scale = (value: number) =>
    Math.max(0, Math.min(1, (value - domain[0]) / (domain[1] - domain[0]))) * width;
  const baseline = scale(0);
  ctx.fillStyle = accent;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.25;
  let previous: { x: number; end: number } | null = null;
  for (const bucket of buckets) {
    const value = profileValue(bucket, kind);
    if (value === null) {
      previous = null;
      continue;
    }
    const y = (bucket.start / total) * height,
      bottom = (bucket.end / total) * height;
    const x = scale(value);
    if (showRange && kind === 'value' && bucket.min !== null && bucket.max !== null) {
      ctx.globalAlpha = 0.18;
      ctx.fillRect(
        scale(bucket.min),
        y,
        Math.max(1, scale(bucket.max) - scale(bucket.min)),
        bottom - y,
      );
    }
    ctx.globalAlpha = 0.1;
    ctx.fillRect(Math.min(baseline, x), y, Math.abs(x - baseline), bottom - y);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    if (previous && previous.end === bucket.start) {
      ctx.moveTo(previous.x, y);
      ctx.lineTo(x, y);
    } else ctx.moveTo(x, y);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    previous = { x, end: bucket.end };
  }
  ctx.globalAlpha = 1;
}

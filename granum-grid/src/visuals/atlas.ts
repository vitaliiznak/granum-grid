import { clamp } from '../core/mappings.js';
import type { Bucket, Chapter } from '../data/types.js';
import { formatCompactTick } from './format.js';

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
    label: formatCompactTick(index + 1),
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

type OverviewAccuracy = 'unavailable' | 'loading' | 'sampled' | 'exact';
/** One overview status for every surface that labels it. */
export function overviewAccuracy(
  buckets: readonly Bucket[],
  kind: 'value' | 'density',
  { supported, failed }: { supported: boolean; failed: boolean },
): OverviewAccuracy {
  if (
    !supported ||
    failed ||
    (buckets.length > 0 && buckets.every((bucket) => profileValue(bucket, kind) === null))
  )
    return 'unavailable';
  if (!buckets.length) return 'loading';
  return buckets.some((bucket) => bucket.accuracy === 'estimated') ? 'sampled' : 'exact';
}

interface CanvasChange {
  /** Content-box size reported by a resize, when known. */
  size?: { width: number; height: number };
  /** The explorer theme or system color scheme may have changed. */
  theme?: boolean;
}
/** Redraw on resize and on explorer theme or color-scheme changes. Returns a cleanup. */
export function observeCanvas(element: Element, redraw: (change: CanvasChange) => void) {
  const resize = new ResizeObserver((entries) => {
    const box = entries[entries.length - 1]?.contentRect;
    redraw({ size: box && { width: box.width, height: box.height } });
  });
  resize.observe(element);
  const onTheme = () => redraw({ theme: true });
  const theme = new MutationObserver(onTheme);
  theme.observe(element.closest('.ds-root') ?? element, { attributes: true });
  const media = matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onTheme);
  return () => {
    resize.disconnect();
    theme.disconnect();
    media.removeEventListener('change', onTheme);
  };
}

/** Pass a known CSS size to avoid reading layout on every frame. */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  rect: { width: number; height: number } = canvas.getBoundingClientRect(),
) {
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
  ink: 'overview' | 'lens' = 'overview',
) {
  const target = prepareCanvas(canvas);
  if (!target || total < 1) return;
  const { context: ctx, width, height } = target;
  const styles = getComputedStyle(canvas);
  const accent = styles.getPropertyValue('--ds-accent').trim() || styles.color;
  const scale = (value: number) =>
    clamp((value - domain[0]) / (domain[1] - domain[0]), 0, 1) * width;
  const baseline = scale(0);
  const lens = ink === 'lens';
  ctx.fillStyle = accent;
  ctx.strokeStyle = accent;
  ctx.lineWidth = lens ? 1.75 : 1.25;
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
      ctx.globalAlpha = lens ? 0.28 : 0.18;
      ctx.fillRect(
        scale(bucket.min),
        y,
        Math.max(1, scale(bucket.max) - scale(bucket.min)),
        bottom - y,
      );
    }
    ctx.globalAlpha = lens ? 0.42 : 0.1;
    ctx.fillRect(Math.min(baseline, x), y, Math.abs(x - baseline), bottom - y);
    ctx.globalAlpha = lens ? 1 : 0.9;
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

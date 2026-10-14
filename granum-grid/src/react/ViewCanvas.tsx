import { useMemo, useRef } from 'react';
import { clamp } from '../core/mappings.js';
import { useClientLayoutEffect } from './useClientLayoutEffect.js';
import { bucketAt } from '../core/navigation.js';
import { atlasDomain, observeCanvas, prepareCanvas, profileValue } from '../visuals/atlas.js';
import type { GranumGridState } from './useGranumGrid.js';
import { INTERNAL } from './internal.js';
/** Size and theme change rarely; reading them every frame forces layout and style work. */
interface Surface {
  size?: { width: number; height: number };
  colors?: { accent: string; muted: string; font: string };
}
/** The overview drawn behind the rows while a long jump or fast fling travels. */
export function ViewCanvas<Row>({ grid }: { grid: GranumGridState<Row> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { snapshot, traveling: visible } = grid;
  const { mapping, session } = grid[INTERNAL];
  const surface = useRef<Surface>({});
  const metricDomain = grid.provider.metric?.domain;
  const kind = grid.provider.metric?.kind ?? 'value';
  // The same scale and values as the dataset map, so both describe a group alike.
  const domain = useMemo(
    () => atlasDomain(session.overview, metricDomain, kind),
    [session.overview, metricDomain, kind],
  );
  const drawRef = useRef<() => void>(() => {});
  // Declared before the drawing effect so a newly shown canvas starts from fresh measurements.
  useClientLayoutEffect(() => {
    const element = canvas.current;
    surface.current = {};
    if (!visible || !element) return;
    return observeCanvas(element, ({ size, theme }) => {
      if (size) surface.current.size = size;
      if (theme) surface.current.colors = undefined;
      drawRef.current();
    });
  }, [visible]);
  useClientLayoutEffect(() => {
    drawRef.current = () => {
      const element = canvas.current;
      if (!element) return;
      const state = surface.current;
      const target = prepareCanvas(element, state.size);
      if (!target) return;
      const { context: ctx, width, height } = target;
      state.size ??= { width, height };
      if (!state.colors) {
        const styles = getComputedStyle(element);
        state.colors = {
          accent: styles.getPropertyValue('--ds-accent').trim() || styles.color,
          muted: styles.getPropertyValue('--ds-muted').trim() || styles.color,
          font: `11px ${styles.fontFamily}`,
        };
      }
      const { accent, muted, font } = state.colors;
      const buckets = session.overview;
      ctx.font = font;
      for (let y = 0; y < height; y += 5) {
        const row = mapping.toRow(y);
        if (row < 0 || row >= snapshot.rowCount) continue;
        const bucket = bucketAt(buckets, row);
        const value = bucket ? profileValue(bucket, kind) : null;
        ctx.fillStyle = accent;
        const ratio =
          value === null ? 0.05 : clamp((value - domain[0]) / (domain[1] - domain[0]), 0.02, 1);
        ctx.globalAlpha = value === null ? 0.05 : 0.08 + ratio * 0.22;
        ctx.fillRect(0, y, width, 4);
        ctx.globalAlpha = 0.65;
        ctx.fillRect(width * 0.25, y, Math.max(2, width * 0.67 * ratio), 3);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = muted;
      for (let y = 24; y < height; y += 56) {
        const row = Math.round(mapping.toRow(y));
        if (row >= 0 && row < snapshot.rowCount)
          ctx.fillText(`#${(row + 1).toLocaleString()}`, 18, y);
      }
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, mapping.toPixel(snapshot.position));
      ctx.lineTo(width, mapping.toPixel(snapshot.position));
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    // Draw before paint so the canvas stays aligned with the visible range.
    if (visible) drawRef.current();
  });
  if (!visible) return null;
  return <canvas ref={canvas} className="ds-view-canvas" aria-hidden="true" />;
}

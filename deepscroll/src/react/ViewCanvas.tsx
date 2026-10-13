import { useMemo, useRef } from 'react';
import { useClientLayoutEffect } from './useClientLayoutEffect.js';
import { observeCanvas, prepareCanvas } from '../visuals/atlas.js';
import { formatCompact } from '../visuals/format.js';
import type { DeepScrollState } from './useDeepScroll.js';
/** Size and theme change rarely; reading them every frame forces layout and style work. */
interface Surface {
  size?: { width: number; height: number };
  colors?: { accent: string; muted: string; font: string };
}
export function ViewCanvas<Row>({ scroll }: { scroll: DeepScrollState<Row> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { mapping, snapshot, session, aggregateMode } = scroll;
  const visible = aggregateMode || snapshot.view === 'lens';
  const surface = useRef<Surface>({});
  const metricDomain = scroll.provider.metric?.domain;
  const domain = useMemo(
    () =>
      metricDomain ?? [
        Math.min(0, ...session.overview.map((b) => b.min ?? 0)),
        Math.max(1, ...session.overview.map((b) => b.max ?? 1)),
      ],
    [metricDomain, session.overview],
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
      const buckets = session.aggregates.length ? session.aggregates : session.overview;
      ctx.font = font;
      for (let y = 0; y < height; y += 5) {
        const row = mapping.toRow(y);
        if (row < 0 || row >= snapshot.rowCount) continue;
        if (!aggregateMode && scroll.rows.some((slot) => y >= slot.y && y < slot.y + slot.height))
          continue;
        const bucket =
          buckets.find((b) => row >= b.start && row < b.end) ??
          session.overview.find((b) => row >= b.start && row < b.end);
        const value = bucket?.avg;
        ctx.fillStyle = accent;
        const ratio =
          value == null
            ? 0.05
            : Math.max(0.02, Math.min(1, (value - domain[0]) / Math.max(1, domain[1] - domain[0])));
        ctx.globalAlpha = value == null ? 0.05 : 0.08 + ratio * 0.22;
        ctx.fillRect(0, y, width, 4);
        ctx.globalAlpha = 0.65;
        ctx.fillRect(width * 0.25, y, Math.max(2, width * 0.67 * ratio), 3);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = muted;
      if (snapshot.view === 'lens' && !aggregateMode) {
        for (const offset of [10, 100, 1_000, 1_000_000, 10_000_000])
          for (const sign of [-1, 1]) {
            const row = snapshot.position + offset * sign;
            if (row >= 0 && row < snapshot.rowCount) {
              const y = mapping.toPixel(row);
              ctx.fillText(`${sign > 0 ? '+' : '−'}${formatCompact(offset)}`, 18, y - 3);
            }
          }
      } else {
        for (let y = 24; y < height; y += 56) {
          const row = Math.round(mapping.toRow(y));
          if (row >= 0 && row < snapshot.rowCount)
            ctx.fillText(`#${(row + 1).toLocaleString()}`, 18, y);
        }
      }
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, mapping.toPixel(snapshot.position));
      ctx.lineTo(width, mapping.toPixel(snapshot.position));
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    // Draw before paint so the context stays aligned with the rows it surrounds.
    if (visible) drawRef.current();
  });
  if (!visible) return null;
  return <canvas ref={canvas} className="ds-view-canvas" aria-hidden="true" />;
}

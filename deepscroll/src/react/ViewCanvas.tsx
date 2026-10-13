import { useEffect, useRef } from 'react';
import { prepareCanvas } from '../visuals/atlas.js';
import type { DeepScrollState } from './useDeepScroll.js';
export function ViewCanvas<Row>({ scroll }: { scroll: DeepScrollState<Row> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { mapping, snapshot, session, aggregateMode } = scroll;
  useEffect(() => {
    if (!canvas.current || (!aggregateMode && snapshot.view !== 'lens')) return;
    const draw = () => {
      const target = prepareCanvas(canvas.current!); if (!target) return;
      const { context: ctx, width, height } = target;
      const styles = getComputedStyle(canvas.current!), accent = styles.getPropertyValue('--ds-accent').trim(), muted = styles.getPropertyValue('--ds-muted').trim();
      const domain = scroll.provider.metric?.domain ?? [Math.min(0, ...session.overview.map(b => b.min ?? 0)), Math.max(1, ...session.overview.map(b => b.max ?? 1))];
      const buckets = session.aggregates.length ? session.aggregates : session.overview;
      ctx.font = '10px ui-monospace, monospace';
      for (let y = 0; y < height; y += 5) {
        const row = mapping.toRow(y);
        if (row < 0 || row >= snapshot.rowCount) continue;
        if (!aggregateMode && Math.abs(row - snapshot.position) < 3.5) continue;
        const bucket = buckets.find(b => row >= b.start && row < b.end) ?? session.overview.find(b => row >= b.start && row < b.end);
        const value = bucket?.avg;
        ctx.fillStyle = accent;
        const ratio = value == null ? .05 : Math.max(.02, Math.min(1, (value - domain[0]) / Math.max(1, domain[1] - domain[0])));
        ctx.globalAlpha = value == null ? .05 : .08 + ratio * .22;
        ctx.fillRect(0, y, width, 4);
        ctx.globalAlpha = .65; ctx.fillRect(width * .25, y, Math.max(2, (width * .67) * ratio), 3);
      }
      ctx.globalAlpha = 1; ctx.fillStyle = muted;
      if (snapshot.view === 'lens' && !aggregateMode) {
        for (const offset of [10, 100, 1_000, 1_000_000, 10_000_000]) for (const sign of [-1, 1]) {
          const row = snapshot.position + offset * sign;
          if (row >= 0 && row < snapshot.rowCount) { const y = mapping.toPixel(row); ctx.fillText(`${sign > 0 ? '+' : '−'}${Intl.NumberFormat('en', { notation: 'compact' }).format(offset)}`, 18, y - 3); }
        }
      } else {
        for (let y = 24; y < height; y += 56) {
          const row = Math.round(mapping.toRow(y));
          if (row >= 0 && row < snapshot.rowCount) ctx.fillText(`#${(row + 1).toLocaleString()}`, 18, y);
        }
      }
      ctx.strokeStyle = accent; ctx.globalAlpha = .7; ctx.beginPath(); ctx.moveTo(0, mapping.toPixel(snapshot.position)); ctx.lineTo(width, mapping.toPixel(snapshot.position)); ctx.stroke(); ctx.globalAlpha = 1;
    };
    draw(); const observer = new ResizeObserver(draw); observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [mapping, snapshot, session.overview, session.aggregates, aggregateMode, scroll.provider]);
  if (!aggregateMode && snapshot.view !== 'lens') return null;
  return <canvas ref={canvas} className="ds-view-canvas" aria-hidden="true"/>;
}

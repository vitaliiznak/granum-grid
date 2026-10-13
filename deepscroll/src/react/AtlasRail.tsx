import { useRef } from 'react';
import type { DeepScrollState } from './useDeepScroll.js';
export function AtlasRail<Row>({ scroll, ariaLabel = 'Dataset position' }: { scroll: DeepScrollState<Row>; ariaLabel?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const update = (y: number) => {
    const rect = track.current!.getBoundingClientRect();
    scroll.controller.scrub((y - rect.top) / rect.height * Math.max(0, scroll.snapshot.rowCount - 1));
  };
  return <aside className="ds-rail"><div className="ds-rail-title">OVERVIEW</div><div ref={track} className="ds-track" role="slider" tabIndex={0} aria-label={ariaLabel} aria-valuemin={1} aria-valuemax={Math.max(1, scroll.snapshot.rowCount)} aria-valuenow={(scroll.snapshot.activeIndex ?? 0) + 1}
    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); update(event.clientY); }}
    onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) update(event.clientY); }}
    onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); scroll.controller.pan(event.key === 'ArrowDown' ? 32 : -32); } }}>
    <span className="ds-thumb" style={{ top: `clamp(0px, ${scroll.snapshot.progress * 100}%, calc(100% - 24px))` }} />
    <span className="ds-track-line" style={{ top: `${scroll.snapshot.progress * 100}%` }} />
  </div><span className="ds-rail-end">100M</span></aside>;
}

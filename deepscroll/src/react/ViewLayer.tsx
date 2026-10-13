import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { View } from '../core/engine.js';
export function ViewLayer({ view, height, motion, children }: { view: View; height: number; motion: boolean; children: ReactNode }) {
  const layer = useRef<HTMLDivElement>(null);
  const previous = useRef({ view, height });
  useLayoutEffect(() => {
    const old = previous.current; previous.current = { view, height };
    if (!motion || old.view === view || !layer.current) return;
    const oldAnchor = old.view === 'rows' ? 0 : old.height / 2;
    const anchor = view === 'rows' ? 0 : height / 2;
    const animation = layer.current.animate([{ transform: `translateY(${oldAnchor - anchor}px)`, opacity: .6 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 180, easing: 'ease-out' });
    return () => animation.cancel();
  }, [view, height, motion]);
  return <div ref={layer} className="ds-view-layer" role="rowgroup">{children}</div>;
}

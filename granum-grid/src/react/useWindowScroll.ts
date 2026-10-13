import { useEffect } from 'react';
import type { GranumGridEngine } from '../core/engine.js';
import { isWithin, ownsKeys } from './dom.js';
import { handleMovementKey } from './keyboard.js';

/** A bounded document scroll range representing the same global position as Atlas. */
export function useWindowScroll(engine: GranumGridEngine, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const spacer = document.createElement('div');
    spacer.dataset.dsWindowSpacer = '';
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.cssText = 'width:1px;pointer-events:none;overflow-anchor:none;';
    document.body.append(spacer);
    const oldRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const oldY = window.scrollY;
    let handling = false,
      expected: number | null = null;
    // Engine updates arrive on every input frame. Track the document offset, viewport
    // height, and spacer height here so each update avoids layout-forcing reads.
    let limit = 0,
      current = oldY,
      viewportHeight = window.innerHeight,
      spacerHeight = -1;
    const setScroll = (y: number) => {
      const top = Math.round(y);
      if (Math.abs(current - top) < 0.5) return;
      window.scrollTo({ top, behavior: 'instant' });
      // Use the browser's actual offset, including its pixel rounding/clamping.
      current = expected = window.scrollY;
    };
    const sync = () => {
      const s = engine.getSnapshot();
      limit = Math.min(1_000_000, Math.max(0, s.rowCount - 1) * s.rowHeight);
      if (limit + viewportHeight !== spacerHeight) {
        spacerHeight = limit + viewportHeight;
        spacer.style.height = `${spacerHeight}px`;
      }
      setScroll(s.progress * limit);
    };
    const resize = () => {
      viewportHeight = window.innerHeight;
      sync();
    };
    const scroll = () => {
      const y = window.scrollY;
      current = y;
      if (expected !== null && Math.abs(y - expected) < 0.5) {
        expected = null;
        return;
      }
      expected = null;
      handling = true;
      try {
        // Native scrollbar drags address the entire dataset. Wheel/touch input
        // pans the engine directly so compressed scroll pixels never skip rows.
        engine.scrub(limit ? (y / limit) * Math.max(0, engine.getSnapshot().rowCount - 1) : 0);
      } finally {
        handling = false;
      }
    };
    const unsubscribe = engine.subscribe(() => {
      if (!handling) sync();
    });
    const key = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        ownsKeys(event.target) ||
        isWithin(event.target, 'dialog,[data-ds-native-scroll]')
      )
        return;
      handleMovementKey(event, engine, { space: true });
    };
    window.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', resize);
    sync();
    return () => {
      unsubscribe();
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', key);
      spacer.remove();
      history.scrollRestoration = oldRestoration;
      window.scrollTo({ top: oldY, behavior: 'instant' });
    };
  }, [engine, enabled]);
}

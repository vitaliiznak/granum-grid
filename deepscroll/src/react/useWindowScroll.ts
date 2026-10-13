import { useEffect } from 'react';
import type { DeepScrollEngine } from '../core/engine.js';

/** A bounded document scroll range representing the same global position as Atlas. */
export function useWindowScroll(engine: DeepScrollEngine, enabled: boolean) {
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
    let limit = 0;
    const setScroll = (y: number) => {
      const top = Math.round(y);
      if (Math.abs(window.scrollY - top) < 0.5) return;
      window.scrollTo({ top, behavior: 'instant' });
      // Use the browser's actual offset, including its pixel rounding/clamping.
      expected = window.scrollY;
    };
    const sync = () => {
      const s = engine.getSnapshot();
      limit = Math.min(1_000_000, Math.max(0, s.rowCount - 1) * s.rowHeight);
      spacer.style.height = `${limit + window.innerHeight}px`;
      setScroll(s.progress * limit);
    };
    const scroll = () => {
      const y = window.scrollY;
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
        (event.target as HTMLElement).closest(
          'input,textarea,select,button,a,[contenteditable=true],dialog,[data-ds-native-scroll]',
        )
      )
        return;
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        engine.goTo(event.key === 'Home' ? 0 : Math.max(0, engine.getSnapshot().rowCount - 1));
      } else if (!event.altKey && !event.metaKey && !event.ctrlKey) {
        const s = engine.getSnapshot();
        const page = Math.max(s.rowHeight, s.height - s.rowHeight);
        const movement: Record<string, number> = {
          ArrowDown: s.rowHeight,
          ArrowUp: -s.rowHeight,
          PageDown: page,
          PageUp: -page,
          ' ': event.shiftKey ? -page : page,
        };
        if (event.key in movement) {
          event.preventDefault();
          engine.pan(movement[event.key]);
        }
      }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', sync);
    sync();
    return () => {
      unsubscribe();
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', sync);
      window.removeEventListener('keydown', key);
      spacer.remove();
      history.scrollRestoration = oldRestoration;
      window.scrollTo({ top: oldY, behavior: 'instant' });
    };
  }, [engine, enabled]);
}

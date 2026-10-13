import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { View } from '../core/engine.js';
/** Receives only what selects a hint, so scrolling does not re-render it. */
export const ContextHints = memo(function ContextHints({
  hints,
  canGoBack,
  view,
  className,
  style,
}: {
  hints: boolean;
  canGoBack: boolean;
  view: View;
  className?: string;
  style?: CSSProperties;
}) {
  const [hint, setHint] = useState<number | null>(null);
  const seen = useRef(new Set<number>());
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    try {
      setEnabled(localStorage.getItem('deepscroll-hints-v1') !== 'done');
    } catch {
      setEnabled(true);
    }
  }, []);
  useEffect(() => {
    if (!enabled || !hints) {
      setHint(null);
      return;
    }
    const next = canGoBack ? 2 : view !== 'rows' ? 3 : !seen.current.has(0) ? 0 : 1;
    if (seen.current.has(next)) return;
    seen.current.add(next);
    setHint(next);
    const timer = setTimeout(() => setHint(null), 5000);
    return () => clearTimeout(timer);
  }, [enabled, hints, canGoBack, view]);
  if (hint === null) return null;
  const messages = [
    'Drag the dataset map to move through the dataset. Markers highlight events.',
    'Press / in the explorer to jump to a row, date, or event.',
    'Back returns to your previous location. Explore freely.',
    'Your row address stays the same when you switch views.',
  ];
  return (
    <div className={`ds-hint ds-hint-${hint} ${className ?? ''}`} style={style} data-ds-part="hint">
      <span>{messages[hint]}</span>
      <button
        className="ds-button"
        aria-label="Dismiss hints"
        onClick={() => {
          setEnabled(false);
          setHint(null);
          try {
            localStorage.setItem('deepscroll-hints-v1', 'done');
          } catch {
            /* Storage can be disabled. */
          }
        }}
      >
        ×
      </button>
    </div>
  );
});

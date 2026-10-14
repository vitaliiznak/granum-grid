import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
/** Receives only what selects a hint, so scrolling does not re-render it. */
export const ContextHints = memo(function ContextHints({
  hints,
  canGoBack,
  storageKey,
  className,
  style,
}: {
  hints: boolean;
  canGoBack: boolean;
  /** Remember dismissal in localStorage under this key; otherwise only for this mount. */
  storageKey?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [hint, setHint] = useState<number | null>(null);
  const seen = useRef(new Set<number>());
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!storageKey) {
      setEnabled(true);
      return;
    }
    try {
      setEnabled(localStorage.getItem(storageKey) !== 'done');
    } catch {
      setEnabled(true);
    }
  }, [storageKey]);
  useEffect(() => {
    if (!enabled || !hints) {
      setHint(null);
      return;
    }
    const next = canGoBack ? 2 : !seen.current.has(0) ? 0 : 1;
    if (seen.current.has(next)) return;
    seen.current.add(next);
    setHint(next);
    const timer = setTimeout(() => setHint(null), 5000);
    return () => clearTimeout(timer);
  }, [enabled, hints, canGoBack]);
  if (hint === null) return null;
  const messages = [
    'Drag the dataset map to move through the dataset. Markers highlight events.',
    'Press / in the explorer to jump to a row, date, or event.',
    'Back returns to your previous location. Explore freely.',
  ];
  return (
    <div className={`gr-hint gr-hint-${hint} ${className ?? ''}`} style={style} data-gr-part="hint">
      <span>{messages[hint]}</span>
      <button
        className="gr-button"
        aria-label="Dismiss hints"
        onClick={() => {
          setEnabled(false);
          setHint(null);
          if (storageKey)
            try {
              localStorage.setItem(storageKey, 'done');
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

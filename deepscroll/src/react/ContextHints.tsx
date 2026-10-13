import { useEffect, useRef, useState } from 'react';
import type { DeepScrollState } from './useDeepScroll.js';
export function ContextHints<Row>({ scroll }: { scroll: DeepScrollState<Row> }) {
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
    if (!enabled || !scroll.features.hints) {
      setHint(null);
      return;
    }
    const next = scroll.snapshot.canGoBack
      ? 2
      : scroll.snapshot.view !== 'rows'
        ? 3
        : !seen.current.has(0)
          ? 0
          : 1;
    if (seen.current.has(next)) return;
    seen.current.add(next);
    setHint(next);
    const timer = setTimeout(() => setHint(null), 5000);
    return () => clearTimeout(timer);
  }, [enabled, scroll.features.hints, scroll.snapshot.canGoBack, scroll.snapshot.view]);
  if (hint === null) return null;
  const messages = [
    'The shape of all 100M rows lives here. The diamonds mark spikes.',
    'Press / in the explorer to jump to a row, date, or event.',
    'Back returns to your previous location. Explore freely.',
    'Your row address stays the same when you switch views.',
  ];
  return (
    <div className={`ds-hint ds-hint-${hint}`}>
      <span>{messages[hint]}</span>
      <button
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
}

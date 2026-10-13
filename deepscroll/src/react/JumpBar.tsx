import { useEffect, useRef, useState } from 'react';
import { parseJump } from '../core/navigation.js';
import type { Marker } from '../data/types.js';
import type { DeepScrollState } from './useDeepScroll.js';
export function JumpBar<Row>({ scroll }: { scroll: DeepScrollState<Row> }) {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''),
    [matches, setMatches] = useState<Marker[]>([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(0);
  useEffect(() => {
    scroll.setSearchBusy(busy && scroll.jumpOpen);
    return () => scroll.setSearchBusy(false);
  }, [busy, scroll.jumpOpen]);
  useEffect(() => {
    if (!scroll.jumpOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    setQuery('');
    setSelected(0);
    dialog.current?.showModal();
    input.current?.focus();
    return () => {
      dialog.current?.close();
      previous?.focus();
      scroll.setSearchMarkers([]);
    };
  }, [scroll.jumpOpen]);
  useEffect(() => {
    if (!scroll.jumpOpen) return;
    const controller = new AbortController();
    setSelected(0);
    setMatches([]);
    scroll.setSearchMarkers([]);
    setBusy(false);
    if (!query.trim()) {
      setMatches(scroll.session.markers);
      setMessage('Jump to a row, a date, or an event.');
      return;
    }
    const parsed = parseJump(
      query,
      scroll.snapshot.rowCount,
      scroll.snapshot.position,
      scroll.session.markers,
    );
    if (parsed.kind === 'error') {
      setMessage(parsed.message);
      return;
    }
    if (parsed.kind === 'index') {
      const result: Marker[] = [
        { id: 'jump-target', index: parsed.index, label: parsed.label, kind: 'search' },
      ];
      setMatches(result);
      scroll.setSearchMarkers(result);
      setMessage('Press Enter to travel here.');
      return;
    }
    if (!scroll.provider.search) {
      setMessage(
        'This provider does not support date or predicate search. Try a row or percentage.',
      );
      return;
    }
    setBusy(true);
    setMessage('Searching…');
    const timer = setTimeout(() => {
      scroll.provider.search!(parsed.query, {
        fromIndex: scroll.snapshot.position,
        limit: 100,
        signal: controller.signal,
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          if (
            result.matches.length > 100 ||
            result.matches.some(
              (m) =>
                !Number.isSafeInteger(m.index) ||
                m.index < 0 ||
                m.index >= scroll.snapshot.rowCount,
            )
          )
            throw new Error('Provider returned invalid search addresses');
          setMatches(result.matches);
          scroll.setSearchMarkers(result.matches);
          setMessage(
            result.complete
              ? result.matches.length
                ? `${result.matches.length} matching locations`
                : 'No matches.'
              : `Partial results · ${result.matches.length} matching locations${result.message ? ` · ${result.message}` : ''}`,
          );
        })
        .catch((error) => {
          if (!controller.signal.aborted) setMessage(String(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, scroll.jumpOpen, scroll.provider, scroll.session.markers]);
  const choose = (marker: Marker) => {
    scroll.controller.goTo(marker.index);
    scroll.setJumpOpen(false);
  };
  return (
    <dialog
      ref={dialog}
      className="ds-jump"
      aria-label="Jump to a location"
      onCancel={() => scroll.setJumpOpen(false)}
      onClick={(event) => {
        if (event.target === event.currentTarget) scroll.setJumpOpen(false);
      }}
    >
      <div className="ds-jump-inner">
        <div className="ds-jump-heading">
          <span>GO SOMEWHERE</span>
          <button aria-label="Close jump bar" onClick={() => scroll.setJumpOpen(false)}>
            Esc
          </button>
        </div>
        <input
          ref={input}
          aria-label="Row, date, or expression"
          placeholder="73,500,000 · 50% · 2017-03"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setMatches([]);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches[selected] && !busy) {
              event.preventDefault();
              choose(matches[selected]);
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setSelected((value) =>
                Math.max(
                  0,
                  Math.min(matches.length - 1, value + (event.key === 'ArrowDown' ? 1 : -1)),
                ),
              );
            }
          }}
        />
        <p role="status">{message}</p>
        <div className="ds-jump-results">
          {matches.map((marker, i) => (
            <button
              key={`${marker.id}-${i}`}
              className={selected === i ? 'selected' : ''}
              onClick={() => choose(marker)}
              onMouseEnter={() => setSelected(i)}
            >
              <span>{marker.label}</span>
              <small>Row {(marker.index + 1).toLocaleString()} ↵</small>
            </button>
          ))}
        </div>
        <div className="ds-jump-examples">
          {['50%', '2017-03', 'next spike', 'value > 120'].map((example) => (
            <button
              key={example}
              onClick={() => {
                setQuery(example);
                input.current?.focus();
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </dialog>
  );
}

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { parseJump } from '../core/navigation.js';
import type { Marker } from '../data/types.js';
import type { DeepScrollState } from './useDeepScroll.js';
/** The dialog's inputs. Position is read from the controller when needed, not per frame. */
type JumpScroll<Row> = Pick<
  DeepScrollState<Row>,
  'jumpOpen' | 'setJumpOpen' | 'setSearchBusy' | 'setSearchMarkers' | 'provider' | 'controller'
> & { markers: Marker[] };
export function JumpBar<Row>({
  scroll,
  className,
  style,
}: {
  scroll: DeepScrollState<Row>;
  className?: string;
  style?: CSSProperties;
}) {
  const { jumpOpen, setJumpOpen, setSearchBusy, setSearchMarkers, provider, controller } = scroll;
  const markers = scroll.session.markers;
  const jump = useMemo(
    () => ({ jumpOpen, setJumpOpen, setSearchBusy, setSearchMarkers, provider, controller, markers }),
    [jumpOpen, setJumpOpen, setSearchBusy, setSearchMarkers, provider, controller, markers],
  );
  return <JumpDialog scroll={jump} className={className} style={style} />;
}
const JumpDialog = memo(function JumpDialog<Row>({
  scroll,
  className,
  style,
}: {
  scroll: JumpScroll<Row>;
  className?: string;
  style?: CSSProperties;
}) {
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
      setMatches(scroll.markers.slice(0, 40));
      setMessage('Jump to a row, a date, or an event.');
      return;
    }
    const parsed = parseJump(
      query,
      scroll.controller.getSnapshot().rowCount,
      scroll.controller.getSnapshot().position,
      scroll.markers,
    );
    if (parsed.kind === 'error') {
      const found = scroll.markers.filter((m) =>
        m.label.toLowerCase().includes(query.toLowerCase()),
      );
      setMatches(found.slice(0, 40));
      setMessage(
        found.length
          ? `${found.length} events${found.length > 40 ? ' · showing first 40; narrow your search' : ''}`
          : parsed.message,
      );
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
        fromIndex: scroll.controller.getSnapshot().position,
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
                m.index >= scroll.controller.getSnapshot().rowCount,
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
  }, [query, scroll.jumpOpen, scroll.provider, scroll.markers]);
  const choose = (marker: Marker) => {
    scroll.controller.goTo(marker.index);
    scroll.setJumpOpen(false);
  };
  return (
    <dialog
      ref={dialog}
      className={`ds-jump ${className ?? ''}`}
      style={style}
      data-ds-part="jump"
      aria-label="Jump to a location"
      onCancel={() => scroll.setJumpOpen(false)}
      onClick={(event) => {
        if (event.target === event.currentTarget) scroll.setJumpOpen(false);
      }}
    >
      <div className="ds-jump-inner">
        <div className="ds-jump-heading">
          <span>Jump to a location</span>
          <button
            className="ds-button"
            aria-label="Close jump bar"
            onClick={() => scroll.setJumpOpen(false)}
          >
            Esc
          </button>
        </div>
        <input
          className="ds-input"
          ref={input}
          aria-label="Go to row, date, or event"
          placeholder="Row number, date, or event name…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setMatches([]);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              // Direct addresses need not wait for the results effect to render.
              const parsed = parseJump(
                event.currentTarget.value,
                scroll.controller.getSnapshot().rowCount,
                scroll.controller.getSnapshot().position,
                scroll.markers,
              );
              if (parsed.kind === 'index') {
                choose({
                  id: 'jump-target',
                  index: parsed.index,
                  label: parsed.label,
                  kind: 'search',
                });
              } else if (matches[selected] && !busy) {
                choose(matches[selected]);
              }
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
              className={`ds-button ${selected === i ? 'selected' : ''}`}
              onClick={() => choose(marker)}
              onMouseEnter={() => setSelected(i)}
            >
              <span>{marker.label}</span>
              <small>Row {(marker.index + 1).toLocaleString()} ↵</small>
            </button>
          ))}
        </div>
        <div className="ds-jump-examples">
          {[
            '50%',
            ...(scroll.provider.search ? ['2017-03'] : []),
            ...(scroll.markers.length ? [scroll.markers[0].label] : []),
          ].map((example) => (
            <button
              className="ds-button"
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
});

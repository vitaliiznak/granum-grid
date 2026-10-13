import { Fragment, memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GranumGridEngine } from '../core/engine.js';
import { parseJump, type JumpTarget } from '../core/navigation.js';
import { searchIssue } from '../data/search.js';
import type { DataProvider, Marker } from '../data/types.js';
import type { GranumGridState } from './useGranumGrid.js';
import { useModalDialog } from './useModalDialog.js';

/** Named markers listed at once; the status line reports the full count. */
const NAMED_LIMIT = 40;
/** Provider matches requested per search. */
const SEARCH_LIMIT = 100;

const jumpMarker = ({ index, label }: Extract<JumpTarget, { kind: 'index' }>): Marker => ({
  id: 'jump-target',
  index,
  label,
  kind: 'search',
});

export function JumpBar<Row>({
  scroll,
  className,
  style,
}: {
  scroll: GranumGridState<Row>;
  className?: string;
  style?: CSSProperties;
}) {
  // Pass only what the dialog uses, so the memoized dialog skips per-frame scroll renders.
  return (
    <JumpDialog
      open={scroll.jumpOpen}
      setOpen={scroll.setJumpOpen}
      query={scroll.searchQuery}
      setQuery={scroll.setSearchQuery}
      setSearchBusy={scroll.setSearchBusy}
      setSearchMarkers={scroll.setSearchMarkers}
      provider={scroll.provider}
      engine={scroll.controller}
      markers={scroll.markers}
      className={className}
      style={style}
    />
  );
}
const JumpDialog = memo(function JumpDialog<Row>({
  open: jumpOpen,
  setOpen: setJumpOpen,
  query,
  setQuery,
  setSearchBusy,
  setSearchMarkers,
  provider,
  engine,
  markers,
  className,
  style,
}: {
  open: boolean;
  setOpen(open: boolean): void;
  query: string;
  setQuery(query: string): void;
  setSearchBusy(busy: boolean): void;
  setSearchMarkers(markers: Marker[]): void;
  provider: DataProvider<Row>;
  /** Position is read from the engine when needed, not per frame. */
  engine: GranumGridEngine;
  markers: Marker[];
  className?: string;
  style?: CSSProperties;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    results = useRef<HTMLDivElement>(null);
  const [matches, setMatches] = useState<Marker[]>([]),
    [namedMatches, setNamedMatches] = useState<Marker[]>([]),
    [namedCount, setNamedCount] = useState(0),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(0);
  const choices = [...matches, ...namedMatches];
  useEffect(() => {
    results.current?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selected, matches, namedMatches]);
  useEffect(() => {
    setSearchBusy(busy && jumpOpen);
    return () => setSearchBusy(false);
  }, [busy, jumpOpen, setSearchBusy]);
  useModalDialog(dialog, jumpOpen);
  useEffect(() => {
    if (!jumpOpen) return;
    setSelected(0);
    input.current?.focus();
    return () => setSearchMarkers([]);
  }, [jumpOpen, setSearchMarkers]);
  useEffect(() => {
    if (!jumpOpen) return;
    const controller = new AbortController();
    setSelected(0);
    setMatches([]);
    setNamedMatches([]);
    setNamedCount(0);
    setSearchMarkers([]);
    setBusy(false);
    if (!query.trim()) {
      setNamedMatches(markers.slice(0, NAMED_LIMIT));
      setNamedCount(markers.length);
      setMessage('Enter a row number, a percentage, or choose an example.');
      return;
    }
    const parsed = parseJump(
      query,
      engine.getSnapshot().rowCount,
      engine.getSnapshot().position,
      markers,
    );
    if (parsed.kind === 'error') {
      setMessage(parsed.message);
      return;
    }
    if (parsed.kind === 'index') {
      const result = [jumpMarker(parsed)];
      setMatches(result);
      setSearchMarkers(result);
      setMessage('Press Enter to travel here.');
      return;
    }
    const named =
      parsed.query.kind === 'text'
        ? markers.filter((m) => m.label.toLowerCase().includes(query.trim().toLowerCase()))
        : [];
    const shownNamed = named.slice(0, NAMED_LIMIT);
    setNamedMatches(shownNamed);
    setNamedCount(named.length);
    setSearchMarkers(shownNamed);
    if (parsed.query.kind === 'text' && (!provider.search || !provider.searchHelp?.text)) {
      setMessage('Searching named markers only. This provider does not support row text search.');
      return;
    }
    if (!provider.search) {
      setMessage(
        'This provider does not support date or predicate search. Try a row or percentage.',
      );
      return;
    }
    const issue = searchIssue(parsed.query, provider.searchHelp);
    if (issue) {
      setMessage(issue);
      return;
    }
    setBusy(true);
    setMessage('Searching…');
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() =>
          provider.search!(parsed.query, {
            fromIndex: engine.getSnapshot().position,
            limit: SEARCH_LIMIT,
            signal: controller.signal,
          }),
        )
        .then((result) => {
          if (controller.signal.aborted) return;
          if (
            result.matches.length > SEARCH_LIMIT ||
            result.matches.some(
              (m) =>
                !Number.isSafeInteger(m.index) ||
                m.index < 0 ||
                m.index >= engine.getSnapshot().rowCount,
            )
          )
            throw new Error('Provider returned invalid search addresses');
          setMatches(result.matches);
          setSearchMarkers([...result.matches, ...shownNamed]);
          const status = result.complete
            ? result.matches.length
              ? `${result.matches.length} matching row${result.matches.length === 1 ? '' : 's'}`
              : 'No matching rows.'
            : `Partial results · ${result.matches.length} matching rows`;
          setMessage(
            `${status}${named.length ? ` · ${named.length} named markers` : ''}${result.message ? ` · ${result.message}` : ''}`,
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
  }, [query, jumpOpen, provider, markers, engine, setSearchMarkers]);
  const choose = (marker: Marker) => {
    engine.goTo(marker.index);
    setJumpOpen(false);
  };
  return (
    <dialog
      ref={dialog}
      className={`ds-jump ${className ?? ''}`}
      style={style}
      data-ds-part="jump"
      aria-label="Jump to a location"
      onCancel={() => setJumpOpen(false)}
      onClick={(event) => {
        if (event.target === event.currentTarget) setJumpOpen(false);
      }}
    >
      <div className="ds-jump-inner">
        <div className="ds-jump-heading">
          <span>Jump to a location</span>
          <button
            className="ds-button"
            aria-label="Close jump bar"
            onClick={() => setJumpOpen(false)}
          >
            Esc
          </button>
        </div>
        <input
          className="ds-input"
          ref={input}
          aria-label="Go to row, date, or event"
          placeholder={provider.searchHelp?.placeholder ?? 'Row number, percentage, or event name…'}
          maxLength={512}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setMatches([]);
            setNamedMatches([]);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              // Direct addresses need not wait for the results effect to render.
              const parsed = parseJump(
                event.currentTarget.value,
                engine.getSnapshot().rowCount,
                engine.getSnapshot().position,
                markers,
              );
              if (parsed.kind === 'index') {
                choose(jumpMarker(parsed));
              } else if (choices[selected] && !busy) {
                choose(choices[selected]);
              }
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setSelected((value) =>
                Math.max(
                  0,
                  Math.min(choices.length - 1, value + (event.key === 'ArrowDown' ? 1 : -1)),
                ),
              );
            }
          }}
        />
        <p role="status">{message}</p>
        <div className="ds-jump-results" ref={results}>
          {choices.map((marker, i) => (
            <Fragment key={`${marker.id}-${i}`}>
              {i === matches.length && namedMatches.length > 0 && (
                <p>
                  Named markers · {namedCount}
                  {namedCount > NAMED_LIMIT
                    ? ` · showing first ${NAMED_LIMIT}; narrow your search`
                    : ''}
                </p>
              )}
              <button
                className={`ds-button ${selected === i ? 'selected' : ''}`}
                onClick={() => choose(marker)}
                onPointerMove={(event) => {
                  // Scrolling the keyboard selection under a stationary pointer must not select another row.
                  if (event.movementX || event.movementY) setSelected(i);
                }}
              >
                <span>{marker.label}</span>
                <small>Row {(marker.index + 1).toLocaleString()} ↵</small>
              </button>
            </Fragment>
          ))}
        </div>
        <div className="ds-jump-examples">
          {[
            ...new Set([
              '50%',
              ...(provider.search ? (provider.searchHelp?.examples.slice(0, 4) ?? []) : []),
              ...(markers.length ? [markers[0].label] : []),
            ]),
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
        {provider.search && provider.searchHelp?.fields && (
          <details className="ds-search-help">
            <summary>Searchable fields</summary>
            <ul>
              {provider.searchHelp.fields.map((field) => (
                <li key={field.name}>
                  <code>{field.name}</code> · {field.type} · {field.operators.join(' ')}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </dialog>
  );
});

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { GranumGridEngine } from '@granum/core/internal';
import { clamp } from '@granum/core/internal';
import { parseJump, type JumpTarget } from '@granum/core/internal';
import { MARKERS_ONLY_SEARCH, searchIssue } from '@granum/core/internal';
import type { DataSession } from '@granum/core/internal';
import type { DataProvider, Marker } from '@granum/core/data';
import type { GranumGridState } from './useGranumGrid.js';
import { INTERNAL } from './internal.js';
import { useLatest } from './useLatest.js';
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

export interface JumpBarProps<Row> {
  /** The `useGranumGrid` result. Position is read from the engine when a jump runs. */
  grid: GranumGridState<Row>;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Controlled query. Without it, the dialog keeps its own and starts empty on each open. */
  query?: string;
  onQueryChange?(query: string): void;
  /** Places the current query found, for the map to highlight. Empty while closed. */
  onHighlightsChange?(markers: Marker[]): void;
  className?: string;
  style?: CSSProperties;
}

export function JumpBar<Row>({
  grid,
  open,
  onOpenChange,
  query: controlledQuery,
  onQueryChange,
  onHighlightsChange,
  className,
  style,
}: JumpBarProps<Row>) {
  const [own, setOwn] = useState({ open, query: '' });
  if (own.open !== open) setOwn({ open, query: '' });
  const controlled = controlledQuery !== undefined;
  // Host callbacks are read at call time, so inline functions do not restart a search.
  const latest = useLatest({ onOpenChange, onQueryChange, onHighlightsChange, controlled });
  const setOpen = useCallback((value: boolean) => latest.current.onOpenChange(value), [latest]);
  const setQuery = useCallback(
    (value: string) => {
      if (!latest.current.controlled) setOwn((current) => ({ ...current, query: value }));
      latest.current.onQueryChange?.(value);
    },
    [latest],
  );
  const setHighlights = useCallback(
    (markers: Marker[]) => latest.current.onHighlightsChange?.(markers),
    [latest],
  );
  // Pass only what the dialog uses, so the memoized dialog skips per-frame scroll renders.
  return (
    <JumpDialog
      open={open}
      setOpen={setOpen}
      query={controlled ? controlledQuery : own.query}
      setQuery={setQuery}
      setHighlights={setHighlights}
      provider={grid.provider}
      session={grid[INTERNAL].session}
      engine={grid[INTERNAL].engine}
      markers={grid.markers}
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
  setHighlights,
  provider,
  session,
  engine,
  markers,
  className,
  style,
}: {
  open: boolean;
  setOpen(open: boolean): void;
  query: string;
  setQuery(query: string): void;
  setHighlights(markers: Marker[]): void;
  provider: DataProvider<Row>;
  session: Pick<DataSession<Row>, 'search'>;
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
  useModalDialog(dialog, jumpOpen);
  useEffect(() => {
    if (!jumpOpen) return;
    setSelected(0);
    input.current?.focus();
    return () => setHighlights([]);
  }, [jumpOpen, setHighlights]);
  useEffect(() => {
    if (!jumpOpen) return;
    const controller = new AbortController();
    setSelected(0);
    setMatches([]);
    setNamedMatches([]);
    setNamedCount(0);
    setHighlights([]);
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
      setHighlights(result);
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
    setHighlights(shownNamed);
    const issue = !provider.search
      ? parsed.query.kind === 'text'
        ? MARKERS_ONLY_SEARCH
        : 'This provider does not support date or predicate search. Try a row or percentage.'
      : searchIssue(parsed.query, provider.searchHelp);
    if (issue) {
      setMessage(issue);
      return;
    }
    setBusy(true);
    setMessage('Searching…');
    const timer = setTimeout(() => {
      // The session validates addresses and counts the search as an active request.
      session
        .search(parsed.query, {
          fromIndex: engine.getSnapshot().position,
          limit: SEARCH_LIMIT,
          signal: controller.signal,
        })
        .then((result) => {
          if (controller.signal.aborted) return;
          setMatches(result.matches);
          setHighlights([...result.matches, ...shownNamed]);
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
  }, [query, jumpOpen, provider, session, markers, engine, setHighlights]);
  const choose = (marker: Marker) => {
    engine.goTo(marker.index);
    setJumpOpen(false);
  };
  return (
    <dialog
      ref={dialog}
      className={`gr-jump ${className ?? ''}`}
      style={style}
      data-gr-part="jump"
      aria-label="Jump to a location"
      onCancel={() => setJumpOpen(false)}
      onClick={(event) => {
        if (event.target === event.currentTarget) setJumpOpen(false);
      }}
    >
      <div className="gr-jump-inner">
        <div className="gr-jump-heading">
          <span>Jump to a location</span>
          <button
            className="gr-button"
            aria-label="Close jump bar"
            onClick={() => setJumpOpen(false)}
          >
            Esc
          </button>
        </div>
        <input
          className="gr-input"
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
                clamp(
                  value + (event.key === 'ArrowDown' ? 1 : -1),
                  0,
                  Math.max(0, choices.length - 1),
                ),
              );
            }
          }}
        />
        <p role="status">{message}</p>
        <div className="gr-jump-results" ref={results}>
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
                className={`gr-button ${selected === i ? 'selected' : ''}`}
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
        <div className="gr-jump-examples">
          {[
            ...new Set([
              '50%',
              ...(provider.search ? (provider.searchHelp?.examples.slice(0, 4) ?? []) : []),
              ...(markers.length ? [markers[0].label] : []),
            ]),
          ].map((example) => (
            <button
              className="gr-button"
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
          <details className="gr-search-help">
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

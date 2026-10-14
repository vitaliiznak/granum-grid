import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DataProvider, GranumGridApi, Marker, RowRange } from '@granum/react';
import {
  MAX_BOOKMARKS,
  bookmarkMarkers,
  readBookmarks,
  writeBookmarks,
  type Bookmark,
} from './bookmarks';
import { RangePicker } from './RangePicker';
import { RangeSummary } from './RangeSummary';
import { useOwnedState } from './hooks';
import { rangeAddress, rangeCount } from './format';

/** Dataset markers listed per page in the Bookmarks panel. */
const MARKER_PAGE = 40;
const NO_BOOKMARKS: Bookmark[] = [];
/** Places are keyed by id and row, as the scrollbar keys its markers. */
const placeKey = (marker: Marker) => `${marker.id}:${marker.index}`;

function SelectionDetails<Row>({
  provider,
  range,
}: {
  provider: DataProvider<Row>;
  range: RowRange;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      className="ds-selection-details"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>{expanded ? 'Hide summary' : 'Show summary'}</summary>
      {expanded && <RangeSummary provider={provider} range={range} showRange={false} />}
    </details>
  );
}

function ExplorerToolsView<Row>({
  api,
  provider,
  selection,
  markers,
  selecting,
  onSelectingChange,
  onBookmarkMarkersChange,
  storageKey,
  formatRange,
  renderComparison,
}: {
  /** Hook state without per-frame position, so scrolling skips these tools. */
  api: GranumGridApi<Row>;
  provider: DataProvider<Row>;
  selection: RowRange | null;
  markers: readonly Marker[];
  /** Whether the map is drawing a selection; the host passes the same value to `AtlasRail`. */
  selecting: boolean;
  onSelectingChange(selecting: boolean): void;
  /** Saved bookmarks as `bookmark` markers, for the hook's `markers` option. */
  onBookmarkMarkersChange(markers: Marker[]): void;
  storageKey?: string;
  formatRange?(range: RowRange): string;
  renderComparison(a: RowRange, b: RowRange, close: () => void): ReactNode;
}) {
  const [panel, setPanel] = useState<'select' | 'bookmark' | 'saved' | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [pinned, setPinned] = useState<RowRange | null>(null);
  const [compare, setCompare] = useState(false);
  const identity = `${provider.id}:${provider.revision}`;
  // Keyed by dataset so the first render after a provider switch has no stale bookmarks.
  const [bookmarks, setBookmarks] = useOwnedState(identity, NO_BOOKMARKS);
  const [markerCount, setMarkerCount] = useState(MARKER_PAGE);
  const savedMarkers = useMemo(() => bookmarkMarkers(bookmarks), [bookmarks]);
  const datasetMarkers = useMemo(() => {
    const own = new Set(savedMarkers.map((marker) => marker.id));
    return markers.filter((marker) => !own.has(marker.id));
  }, [markers, savedMarkers]);
  // Same row order as the scrollbar, so a compact number matches this list.
  const placeNumber = useMemo(() => {
    const ordered = [...datasetMarkers, ...savedMarkers].sort((a, b) => a.index - b.index);
    return new Map(ordered.map((marker, index) => [placeKey(marker), index + 1]));
  }, [datasetMarkers, savedMarkers]);
  const previousIdentity = useRef(identity);
  const bookmarkInput = useRef<HTMLInputElement>(null);
  const selectionButton = useRef<HTMLButtonElement>(null);
  const selectionAction = useRef<HTMLButtonElement>(null);
  const comparisonSetup = useRef<HTMLElement>(null);
  const comparisonButton = useRef<HTMLButtonElement>(null);
  const cancelMapButton = useRef<HTMLButtonElement>(null);
  const secondRange =
    selection && pinned && (selection.start !== pinned.start || selection.end !== pinned.end)
      ? selection
      : null;
  const describeRange = (range: RowRange) =>
    range.end - range.start === 1
      ? rangeAddress(range)
      : (formatRange?.(range) ?? rangeAddress(range));
  const rangeDetails = (range: RowRange) =>
    `${formatRange ? `${rangeAddress(range)} · ` : ''}${rangeCount(range)}`;
  const returnFocus = () =>
    requestAnimationFrame(() => {
      if (pinned) comparisonSetup.current?.focus();
      else selectionButton.current?.focus();
    });
  const closePanel = () => {
    setPanel(null);
    returnFocus();
  };
  /** Close the chooser once a range is the selection. */
  const settleRange = () => {
    onSelectingChange(false);
    setPanel(null);
    setMessage('');
    requestAnimationFrame(() => {
      if (pinned) comparisonButton.current?.focus();
      else selectionAction.current?.focus();
    });
  };
  const chooseRange = (range: RowRange) => {
    api.setSelection(range);
    settleRange();
  };
  const startComparison = () => {
    if (!selection) return;
    setPinned({ ...selection });
    setMessage('');
    setPanel(null);
    onSelectingChange(false);
    requestAnimationFrame(() => comparisonSetup.current?.focus());
  };
  const addBookmark = () => {
    setPanel('bookmark');
    setName('');
    setMessage('');
    requestAnimationFrame(() => bookmarkInput.current?.focus());
  };
  useEffect(() => {
    if (previousIdentity.current !== identity) {
      setPinned(null);
      setCompare(false);
      setPanel(null);
      setMessage('');
      setName('');
      previousIdentity.current = identity;
    }
    setBookmarks(NO_BOOKMARKS);
    if (!storageKey) return;
    try {
      setBookmarks(readBookmarks(localStorage.getItem(storageKey), provider));
    } catch {
      setMessage('Browser storage is unavailable. Bookmarks will last for this session.');
    }
    // Re-read when an append changes the row count that bookmarks are validated against.
  }, [identity, storageKey, provider, setBookmarks]);
  // The map, N/P, and search show saved bookmarks beside the provider's markers.
  useEffect(() => {
    onBookmarkMarkersChange(savedMarkers);
    return () => onBookmarkMarkersChange([]);
  }, [savedMarkers, onBookmarkMarkersChange]);
  const saveBookmarks = (next: Bookmark[]) => {
    setBookmarks(next);
    if (storageKey)
      try {
        localStorage.setItem(
          storageKey,
          writeBookmarks(localStorage.getItem(storageKey), next, provider),
        );
      } catch {
        setMessage('Saved for this session; browser storage is unavailable.');
      }
  };
  const picker = (
    <RangePicker
      rowCount={provider.rowCount}
      initialRange={selection}
      excludedRange={pinned}
      getVisibleRange={api.getVisibleRange}
      title={
        pinned
          ? 'Choose the second range'
          : selection
            ? 'Change your selection'
            : 'Choose rows to explore'
      }
      onSelect={chooseRange}
      onMap={() => {
        setPanel(null);
        onSelectingChange(true);
        requestAnimationFrame(() => {
          cancelMapButton.current?.focus();
          cancelMapButton.current
            ?.closest('[data-ds-root]')
            ?.querySelector('.ds-track')
            ?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        });
      }}
      onCancel={closePanel}
    />
  );
  return (
    <>
      {!pinned && !selecting && (
        <div className="ds-explore-toggle">
          <button
            ref={selectionButton}
            className="ds-button"
            aria-expanded={panel === 'select'}
            disabled={!provider.rowCount}
            onClick={() => {
              setPanel(panel === 'select' ? null : 'select');
              setMessage('');
            }}
          >
            {selection ? 'Change selection' : 'Select rows'}
          </button>
          {selection && (
            <button
              className="ds-button"
              aria-label="Clear selection"
              onClick={() => {
                api.setSelection(null);
                setPanel(null);
                setMessage('');
                requestAnimationFrame(() => selectionButton.current?.focus());
              }}
            >
              Clear
            </button>
          )}
          {!selection && <span>Choose a part of the dataset to explore.</span>}
          <button
            className="ds-button ds-saved-views-trigger"
            aria-expanded={panel === 'saved'}
            onClick={() => {
              setPanel(panel === 'saved' ? null : 'saved');
              setMarkerCount(MARKER_PAGE);
              setMessage('');
            }}
          >
            Bookmarks{bookmarks.length ? ` (${bookmarks.length})` : ''}
          </button>
        </div>
      )}
      {selecting ? (
        <div
          className="ds-map-prompt"
          role="region"
          aria-label="Select on map"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onSelectingChange(false);
              returnFocus();
            }
          }}
        >
          <div>
            <strong>{pinned ? 'Draw your second range' : 'Draw a selection'}</strong>
            <p>Drag from start to end on the dataset map. Escape cancels.</p>
          </div>
          <button
            ref={cancelMapButton}
            className="ds-button"
            onClick={() => {
              onSelectingChange(false);
              returnFocus();
            }}
          >
            Cancel map selection
          </button>
        </div>
      ) : pinned ? (
        <section
          ref={comparisonSetup}
          className="ds-comparison-setup"
          data-ds-native-scroll
          aria-label="Range comparison"
          tabIndex={-1}
        >
          <div className="ds-flow-heading">
            <div>
              <strong>Compare two ranges</strong>
              <p role="status">
                {secondRange
                  ? 'Both ranges are ready. Open them side by side.'
                  : 'Your first range is saved. Now choose another part of the dataset.'}
              </p>
            </div>
            <button
              className="ds-button"
              onClick={() => {
                setPinned(null);
                setPanel(null);
                onSelectingChange(false);
                requestAnimationFrame(() => selectionButton.current?.focus());
              }}
            >
              Cancel comparison
            </button>
          </div>
          <div className="ds-comparison-ranges">
            <div className="ds-comparison-range" role="group" aria-label="First range">
              <span className="ds-comparison-step">1 · First range</span>
              <strong>{describeRange(pinned)}</strong>
              <span>{rangeDetails(pinned)}</span>
            </div>
            <div
              className="ds-comparison-range"
              data-empty={!secondRange || undefined}
              role="group"
              aria-label="Second range"
            >
              <span className="ds-comparison-step">2 · Second range</span>
              <strong>
                {secondRange ? describeRange(secondRange) : 'Choose what to compare it with'}
              </strong>
              {secondRange && <span>{rangeDetails(secondRange)}</span>}
              {panel !== 'select' && (
                <button className="ds-button" onClick={() => setPanel('select')}>
                  {secondRange ? 'Change second range' : 'Choose second range'}
                </button>
              )}
            </div>
          </div>
          {panel === 'select' ? (
            picker
          ) : (
            <div className="ds-comparison-actions">
              <button
                ref={comparisonButton}
                className="ds-button ds-flow-primary ds-comparison-primary"
                disabled={!secondRange}
                onClick={(event) => {
                  event.currentTarget.focus();
                  setCompare(true);
                }}
              >
                Show comparison
              </button>
            </div>
          )}
        </section>
      ) : panel === 'select' ? (
        <div className="ds-explorer-panel" data-ds-native-scroll>
          {picker}
        </div>
      ) : panel === 'bookmark' ? (
        <section className="ds-explorer-panel" data-ds-native-scroll aria-label="Save a bookmark">
          <div className="ds-flow-heading">
            <div>
              <strong>Add bookmark</strong>
              <p>
                {selection
                  ? `${rangeAddress(selection)} and your current view`
                  : 'Your current position'}
              </p>
            </div>
          </div>
          <form
            className="ds-bookmark-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) {
                setMessage('Give this bookmark a name.');
                return;
              }
              const item = {
                ...api.getView(),
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: name.trim(),
              };
              setMessage(`Saved “${item.name}”. Find it in Bookmarks.`);
              saveBookmarks([item, ...bookmarks].slice(0, MAX_BOOKMARKS));
              setPanel(null);
              requestAnimationFrame(() => selectionButton.current?.focus());
            }}
          >
            <label>
              Bookmark name
              <input
                ref={bookmarkInput}
                className="ds-input"
                maxLength={80}
                placeholder="e.g. Unusual spike"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button className="ds-button ds-flow-primary" disabled={!provider.rowCount}>
              Save bookmark
            </button>
            <button className="ds-button" type="button" onClick={closePanel}>
              Cancel
            </button>
          </form>
        </section>
      ) : panel === 'saved' ? (
        <section className="ds-explorer-panel" data-ds-native-scroll aria-label="Bookmarks">
          <div className="ds-flow-heading">
            <div>
              <strong>Bookmarks</strong>
              <p>
                {bookmarks.length || datasetMarkers.length
                  ? 'Return to a place you saved or one this dataset marks.'
                  : 'Save a place to return to it later.'}
              </p>
            </div>
            <button className="ds-button" onClick={closePanel}>
              Close bookmarks
            </button>
          </div>
          {!!bookmarks.length && (
            <p className="ds-bookmarks-heading">Saved by you · {bookmarks.length}</p>
          )}
          {!!bookmarks.length && (
            <ul className="ds-bookmarks" aria-label="Saved bookmarks">
              {bookmarks.map((bookmark, i) => (
                // `savedMarkers` follows `bookmarks` one to one.
                <li key={bookmark.id}>
                  <button
                    className="ds-button ds-saved-view"
                    onClick={() => {
                      api.restoreView(bookmark);
                      if (bookmark.selection) settleRange();
                      else {
                        setPanel(null);
                        returnFocus();
                      }
                    }}
                  >
                    <span className="ds-place-index" aria-hidden="true">
                      {placeNumber.get(placeKey(savedMarkers[i]))}
                    </span>
                    <strong>{bookmark.name}</strong>
                    <span>
                      {bookmark.selection
                        ? rangeAddress(bookmark.selection)
                        : `Row ${Math.floor(bookmark.location.position + 1).toLocaleString()}`}
                    </span>
                  </button>
                  <button
                    className="ds-button"
                    aria-label={`Remove bookmark ${bookmark.name}`}
                    onClick={() =>
                      saveBookmarks(bookmarks.filter((item) => item.id !== bookmark.id))
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="ds-button" disabled={!provider.rowCount} onClick={addBookmark}>
            Bookmark current position
          </button>
          {!!datasetMarkers.length && (
            <>
              <p className="ds-bookmarks-heading">
                From this dataset · {datasetMarkers.length.toLocaleString()}
              </p>
              <ul className="ds-bookmarks" aria-label="Dataset markers">
                {datasetMarkers.slice(0, markerCount).map((marker) => (
                  <li key={placeKey(marker)}>
                    <button
                      className="ds-button ds-saved-view"
                      onClick={() => {
                        api.goTo(marker.index, { reason: 'marker' });
                        setPanel(null);
                        returnFocus();
                      }}
                    >
                      <span className="ds-place-index" aria-hidden="true">
                        {placeNumber.get(placeKey(marker))}
                      </span>
                      <strong>{marker.label}</strong>
                      <span>Row {(marker.index + 1).toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {datasetMarkers.length > markerCount && (
                <button
                  className="ds-button"
                  onClick={() => setMarkerCount(markerCount + MARKER_PAGE)}
                >
                  More markers
                </button>
              )}
            </>
          )}
        </section>
      ) : selection ? (
        <section className="ds-selection-card" data-ds-native-scroll aria-label="Your selection">
          <div className="ds-selection-overview">
            <div className="ds-selection-description">
              <span className="ds-selection-kicker">{rangeCount(selection)} selected</span>
              <strong>{describeRange(selection)}</strong>
              {formatRange && selection.end - selection.start > 1 && (
                <span>{rangeAddress(selection)}</span>
              )}
            </div>
            <div className="ds-panel-actions">
              <button
                ref={selectionAction}
                className="ds-button ds-flow-primary"
                onClick={() => {
                  api.scrollToIndex(selection.start, { align: 'start' });
                }}
              >
                {selection.end - selection.start === 1 ? 'Open row' : 'View selection'}
              </button>
              <button className="ds-button" onClick={startComparison}>
                Compare ranges
              </button>
              <button className="ds-button" onClick={addBookmark}>
                Save bookmark
              </button>
            </div>
          </div>
          <SelectionDetails
            key={`${identity}:${selection.start}:${selection.end}`}
            provider={provider}
            range={selection}
          />
        </section>
      ) : null}
      {message && (
        <p className="ds-tool-message ds-flow-message" role="status">
          {message}
        </p>
      )}
      {compare &&
        pinned &&
        secondRange &&
        renderComparison(pinned, secondRange, () => setCompare(false))}
    </>
  );
}
export const ExplorerTools = memo(ExplorerToolsView) as typeof ExplorerToolsView;

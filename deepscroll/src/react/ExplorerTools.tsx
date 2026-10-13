import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  readBookmarks,
  writeBookmarks,
  type Bookmark,
  type SavedView,
} from '../core/exploration.js';
import type { Bucket, DataProvider, RowRange } from '../data/types.js';
import type { DeepScrollState } from './useDeepScroll.js';
import { formatDecimal } from '../visuals/format.js';
import { RangePicker, rangeAddress, rangeCount } from './RangePicker.js';

/** The explorer state these tools use. Per-frame position is excluded so scrolling skips them. */
export type ExplorerScroll<Row> = Pick<
  DeepScrollState<Row>,
  | 'provider'
  | 'controller'
  | 'selection'
  | 'setSelection'
  | 'selectionMode'
  | 'setSelectionMode'
  | 'getVisibleRange'
>;

export function savedView<Row>(
  scroll: Pick<DeepScrollState<Row>, 'provider' | 'controller' | 'selection'>,
): SavedView {
  return {
    version: 1,
    dataset: scroll.provider.id,
    revision: scroll.provider.revision,
    location: scroll.controller.getLocation(),
    selection: scroll.selection,
  };
}

function useSummary<Row>(provider: DataProvider<Row>, range: RowRange | null) {
  const [state, setState] = useState<{ bucket?: Bucket; message: string }>({
    message: 'Select a range',
  });
  useEffect(() => {
    if (!range) {
      setState({ message: 'Select a range' });
      return;
    }
    if (!provider.fetchAggregates) {
      setState({ message: 'This provider does not supply range summaries.' });
      return;
    }
    const controller = new AbortController();
    setState({ message: 'Loading summary…' });
    const deadline = setTimeout(() => {
      controller.abort();
      setState({ message: 'Summary timed out. Change the range to retry.' });
    }, 15_000);
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() => provider.fetchAggregates!({ ...range, buckets: 1 }, controller.signal))
        .then((buckets) => {
          if (controller.signal.aborted) return;
          const b = buckets[0];
          if (
            buckets.length !== 1 ||
            b.start !== range.start ||
            b.end !== range.end ||
            !['exact', 'estimated', 'unavailable'].includes(b.accuracy) ||
            [b.avg, b.min, b.max, b.count].some((v) => v !== null && !Number.isFinite(v)) ||
            (b.count !== null && (b.count < 0 || b.count > range.end - range.start))
          )
            throw new Error('Invalid range summary');
          setState({
            bucket: b,
            message:
              b.accuracy === 'exact'
                ? 'Exact summary'
                : b.accuracy === 'estimated'
                  ? 'Estimated summary'
                  : 'Summary unavailable',
          });
        })
        .catch((error) => {
          if (!controller.signal.aborted) setState({ message: String(error) });
        })
        .finally(() => clearTimeout(deadline));
    }, 150);
    return () => {
      clearTimeout(timer);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [provider, range?.start, range?.end]);
  return state;
}
export function RangeSummary<Row>({
  provider,
  range,
  showRange = true,
}: {
  provider: DataProvider<Row>;
  range: RowRange;
  showRange?: boolean;
}) {
  const { bucket, message } = useSummary(provider, range);
  const single = range.end - range.start === 1;
  const format = (value: number | null | undefined) =>
    value == null
      ? 'Unavailable'
      : `${formatDecimal(value, 2)}${provider.metric?.unit ? ` ${provider.metric.unit}` : ''}`;
  return (
    <div className="ds-range-summary">
      {showRange && (
        <p>
          {rangeAddress(range)} · {rangeCount(range)}
        </p>
      )}
      <div className="ds-summary-heading">
        <strong>{provider.metric?.label ?? 'Range statistics'}</strong>
        <span className="ds-summary-quality" role="status">
          {message}
        </span>
      </div>
      {bucket && bucket.accuracy !== 'unavailable' && (
        <dl>
          <div>
            <dt>{single ? 'Value' : 'Average'}</dt>
            <dd>{format(bucket.avg)}</dd>
          </div>
          {!single && (
            <>
              <div>
                <dt>Lowest</dt>
                <dd>{format(bucket.min)}</dd>
              </div>
              <div>
                <dt>Highest</dt>
                <dd>{format(bucket.max)}</dd>
              </div>
            </>
          )}
        </dl>
      )}
      {bucket?.accuracy === 'estimated' && (
        <p className="ds-summary-note">Based on a sample of the selected rows.</p>
      )}
    </div>
  );
}

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
      <summary>Show summary</summary>
      {expanded && <RangeSummary provider={provider} range={range} showRange={false} />}
    </details>
  );
}

function ExplorerToolsView<Row>({
  scroll,
  storageKey,
  formatRange,
  renderComparison,
}: {
  scroll: ExplorerScroll<Row>;
  storageKey?: string;
  formatRange?(range: RowRange): string;
  renderComparison(a: RowRange, b: RowRange, close: () => void): ReactNode;
}) {
  const [panel, setPanel] = useState<'select' | 'bookmark' | 'saved' | null>(null);
  const [name, setName] = useState('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [message, setMessage] = useState('');
  const [pinned, setPinned] = useState<RowRange | null>(null);
  const [compare, setCompare] = useState(false);
  const { provider, selection } = scroll;
  const identity = `${provider.id}:${provider.revision}`;
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
  const describeRange = (range: RowRange) => formatRange?.(range) ?? rangeAddress(range);
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
  const chooseRange = (range: RowRange) => {
    scroll.setSelection(range);
    scroll.setSelectionMode(false);
    setPanel(null);
    setMessage('');
    requestAnimationFrame(() => {
      if (pinned) comparisonButton.current?.focus();
      else selectionAction.current?.focus();
    });
  };
  const startComparison = () => {
    if (!selection) return;
    setPinned({ ...selection });
    setMessage('');
    setPanel(null);
    scroll.setSelectionMode(false);
    requestAnimationFrame(() => comparisonSetup.current?.focus());
  };
  const saveView = () => {
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
    setBookmarks([]);
    if (!storageKey) return;
    try {
      setBookmarks(readBookmarks(localStorage.getItem(storageKey), provider));
    } catch {
      setMessage('Browser storage is unavailable. Saved views will last for this session.');
    }
  }, [identity, storageKey]);
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
      getVisibleRange={scroll.getVisibleRange}
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
        scroll.setSelectionMode(true);
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
      {!pinned && !scroll.selectionMode && (
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
          {!selection && <span>Choose a part of the dataset to explore.</span>}
          <button
            className="ds-button ds-saved-views-trigger"
            aria-expanded={panel === 'saved'}
            onClick={() => {
              setPanel(panel === 'saved' ? null : 'saved');
              setMessage('');
            }}
          >
            Saved views{bookmarks.length ? ` (${bookmarks.length})` : ''}
          </button>
        </div>
      )}
      {scroll.selectionMode ? (
        <div
          className="ds-map-prompt"
          role="region"
          aria-label="Select on map"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              scroll.setSelectionMode(false);
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
              scroll.setSelectionMode(false);
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
                scroll.setSelectionMode(false);
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
        <section className="ds-explorer-panel" data-ds-native-scroll aria-label="Save a view">
          <div className="ds-flow-heading">
            <div>
              <strong>Save this place</strong>
              <p>
                {selection
                  ? `${rangeAddress(selection)} and your current view`
                  : 'Your current position, view, and zoom'}
              </p>
            </div>
          </div>
          <form
            className="ds-bookmark-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) {
                setMessage('Give this view a name.');
                return;
              }
              const item = {
                ...savedView(scroll),
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: name.trim(),
              };
              setMessage(`Saved “${item.name}”. Find it in Saved views.`);
              saveBookmarks([item, ...bookmarks].slice(0, 40));
              setPanel(null);
              requestAnimationFrame(() => selectionButton.current?.focus());
            }}
          >
            <label>
              View name
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
              Save view
            </button>
            <button className="ds-button" type="button" onClick={closePanel}>
              Cancel
            </button>
          </form>
        </section>
      ) : panel === 'saved' ? (
        <section className="ds-explorer-panel" data-ds-native-scroll aria-label="Saved views">
          <div className="ds-flow-heading">
            <div>
              <strong>Saved views</strong>
              <p>
                {bookmarks.length
                  ? 'Return to a selection or a place you saved.'
                  : 'Save a place to return to it later.'}
              </p>
            </div>
            <button className="ds-button" onClick={closePanel}>
              Close saved views
            </button>
          </div>
          {!!bookmarks.length && (
            <ul className="ds-bookmarks" aria-label="Saved places">
              {bookmarks.map((bookmark) => (
                <li key={bookmark.id}>
                  <button
                    className="ds-button ds-saved-view"
                    onClick={() => {
                      scroll.controller.restore(bookmark.location);
                      chooseRangeOrView(bookmark);
                    }}
                  >
                    <strong>{bookmark.name}</strong>
                    <span>
                      {bookmark.selection
                        ? rangeAddress(bookmark.selection)
                        : `Row ${Math.floor(bookmark.location.position + 1).toLocaleString()}`}
                    </span>
                  </button>
                  <button
                    className="ds-button"
                    aria-label={`Remove saved view ${bookmark.name}`}
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
          <button className="ds-button" disabled={!provider.rowCount} onClick={saveView}>
            Save current view
          </button>
        </section>
      ) : selection ? (
        <section className="ds-selection-card" data-ds-native-scroll aria-label="Your selection">
          <div className="ds-selection-overview">
            <div className="ds-selection-description">
              <span className="ds-selection-kicker">{rangeCount(selection)} selected</span>
              <strong>{describeRange(selection)}</strong>
              {formatRange && <span>{rangeAddress(selection)}</span>}
            </div>
            <div className="ds-panel-actions">
              <button
                ref={selectionAction}
                className="ds-button ds-flow-primary"
                onClick={() => {
                  if (selection.end - selection.start === 1)
                    scroll.controller.scrollToIndex(selection.start, { align: 'start' });
                  else scroll.controller.zoomToRange(selection);
                }}
              >
                {selection.end - selection.start === 1 ? 'Open row' : 'View selection'}
              </button>
              <button className="ds-button" onClick={startComparison}>
                Compare ranges
              </button>
              <button className="ds-button" onClick={saveView}>
                Save view
              </button>
              <button
                className="ds-button ds-clear-selection"
                aria-label="Clear selection"
                title="Clear selection"
                onClick={() => {
                  scroll.setSelection(null);
                  setMessage('');
                  requestAnimationFrame(() => selectionButton.current?.focus());
                }}
              >
                ×
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
  function chooseRangeOrView(bookmark: Bookmark) {
    if (bookmark.selection) chooseRange(bookmark.selection);
    else {
      scroll.setSelection(null);
      setPanel(null);
      returnFocus();
    }
  }
}
export const ExplorerTools = memo(ExplorerToolsView) as typeof ExplorerToolsView;

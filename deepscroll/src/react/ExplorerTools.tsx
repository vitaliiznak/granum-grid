import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  readBookmarks,
  validRange,
  writeBookmarks,
  type Bookmark,
  type SavedView,
} from '../core/exploration.js';
import type { Bucket, DataProvider, RowRange } from '../data/types.js';
import type { DeepScrollState } from './useDeepScroll.js';

export function savedView<Row>(scroll: DeepScrollState<Row>): SavedView {
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
}: {
  provider: DataProvider<Row>;
  range: RowRange;
}) {
  const { bucket, message } = useSummary(provider, range);
  const format = (v: number | null | undefined) =>
    v == null ? 'Unavailable' : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return (
    <div className="ds-range-summary">
      <p>
        {(range.end - range.start).toLocaleString()} selected rows ·{' '}
        {(range.start + 1).toLocaleString()}–{range.end.toLocaleString()}
      </p>
      <p role="status">{message}</p>
      {bucket && bucket.accuracy !== 'unavailable' && (
        <dl>
          <div>
            <dt>Mean {provider.metric?.unit}</dt>
            <dd>{format(bucket.avg)}</dd>
          </div>
          <div>
            <dt>Minimum</dt>
            <dd>{format(bucket.min)}</dd>
          </div>
          <div>
            <dt>Maximum</dt>
            <dd>{format(bucket.max)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

export function ExplorerTools<Row>({
  scroll,
  storageKey,
  renderComparison,
}: {
  scroll: DeepScrollState<Row>;
  storageKey?: string;
  renderComparison(a: RowRange, b: RowRange, close: () => void): ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('1'),
    [end, setEnd] = useState('1');
  const [name, setName] = useState('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [message, setMessage] = useState('');
  const [pinned, setPinned] = useState<RowRange | null>(null);
  const [compare, setCompare] = useState(false);
  const { provider, selection } = scroll;
  const identity = `${provider.id}:${provider.revision}`;
  const previousIdentity = useRef(identity);
  const wasSelecting = useRef(false);
  useEffect(() => {
    if (wasSelecting.current && !scroll.selectionMode && selection) setOpen(true);
    wasSelecting.current = scroll.selectionMode;
  }, [scroll.selectionMode, selection]);
  useEffect(() => {
    if (previousIdentity.current !== identity) {
      setPinned(null);
      setCompare(false);
      setOpen(false);
      previousIdentity.current = identity;
    }
    setBookmarks([]);
    if (!storageKey) return;
    try {
      setBookmarks(readBookmarks(localStorage.getItem(storageKey), provider));
    } catch {
      setMessage('Browser storage is unavailable. Bookmarks will last for this session.');
    }
  }, [identity, storageKey]);
  useEffect(() => {
    if (selection) {
      setStart(String(selection.start + 1));
      setEnd(String(selection.end));
    }
  }, [selection?.start, selection?.end]);
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
  const selectVisible = () => {
    if (!provider.rowCount) return;
    const first = Math.max(0, Math.floor(scroll.mapping.toRow(0)));
    scroll.setSelection({
      start: Math.min(first, provider.rowCount - 1),
      end: Math.min(
        provider.rowCount,
        Math.max(first + 1, Math.ceil(scroll.mapping.toRow(scroll.snapshot.height))),
      ),
    });
  };
  return (
    <>
      <div className="ds-explore-toggle">
        <button className="ds-button" aria-expanded={open} onClick={() => setOpen(!open)}>
          Explore{selection ? ' · range selected' : ''}{' '}
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
        {pinned && <span>Comparison A saved</span>}
      </div>
      {open && (
        <div className="ds-explorer-panel" data-ds-native-scroll>
          <div className="ds-panel-actions">
            <button className="ds-button" disabled={!provider.rowCount} onClick={selectVisible}>
              Select visible rows
            </button>
            <button
              className="ds-button"
              disabled={!provider.rowCount}
              aria-pressed={scroll.selectionMode}
              onClick={() => {
                scroll.setSelectionMode(!scroll.selectionMode);
                if (!scroll.selectionMode) setOpen(false);
              }}
            >
              {scroll.selectionMode ? 'Cancel map selection' : 'Select on map'}
            </button>
            <button
              className="ds-button"
              disabled={!selection}
              onClick={() => {
                scroll.setSelection(null);
                scroll.setSelectionMode(false);
              }}
            >
              Clear selection
            </button>
          </div>
          <form
            className="ds-range-form"
            onSubmit={(event) => {
              event.preventDefault();
              const range = {
                start: Number(start.replaceAll(',', '')) - 1,
                end: Number(end.replaceAll(',', '')),
              };
              if (!validRange(range, provider.rowCount)) {
                setMessage('Enter a valid first and last row within this dataset.');
                return;
              }
              setMessage('');
              scroll.setSelection(range);
            }}
          >
            <label>
              First row
              <input
                className="ds-input"
                inputMode="numeric"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              Last row
              <input
                className="ds-input"
                inputMode="numeric"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
            <button className="ds-button" type="submit" disabled={!provider.rowCount}>
              Select range
            </button>
          </form>
          {selection && (
            <>
              <RangeSummary provider={provider} range={selection} />
              <div className="ds-panel-actions">
                <button
                  className="ds-button"
                  onClick={() =>
                    scroll.controller.scrollToIndex(selection.start, { align: 'start' })
                  }
                >
                  Inspect first row
                </button>
                <button
                  className="ds-button"
                  onClick={() => {
                    scroll.controller.setZoom(
                      (selection.end - selection.start) / scroll.snapshot.height,
                    );
                    scroll.controller.goTo(Math.floor((selection.start + selection.end - 1) / 2), {
                      motion: 'instant',
                    });
                  }}
                >
                  Fit selected range
                </button>
                <button className="ds-button" onClick={() => setPinned({ ...selection })}>
                  Use as comparison A
                </button>
                {pinned && (
                  <button
                    className="ds-button"
                    onClick={(event) => {
                      event.currentTarget.focus();
                      setCompare(true);
                    }}
                  >
                    Compare A with selection
                  </button>
                )}
              </div>
            </>
          )}
          <form
            className="ds-bookmark-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) {
                setMessage('Give this bookmark a name.');
                return;
              }
              const item = {
                ...savedView(scroll),
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: name.trim(),
              };
              saveBookmarks([item, ...bookmarks].slice(0, 40));
              setName('');
            }}
          >
            <label>
              Bookmark name
              <input
                className="ds-input"
                maxLength={80}
                placeholder="e.g. Unusual spike"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="ds-button" disabled={!provider.rowCount}>
              Save bookmark
            </button>
          </form>
          {!!bookmarks.length && (
            <ul className="ds-bookmarks" aria-label="Saved places">
              {bookmarks.map((bookmark) => (
                <li key={bookmark.id}>
                  <button
                    className="ds-button"
                    onClick={() => {
                      scroll.controller.restore(bookmark.location);
                      scroll.setSelection(bookmark.selection);
                    }}
                  >
                    {bookmark.name}
                  </button>
                  <button
                    className="ds-button"
                    aria-label={`Remove bookmark ${bookmark.name}`}
                    onClick={() => saveBookmarks(bookmarks.filter((b) => b.id !== bookmark.id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="ds-tool-message" role="status">
            {message}
          </p>
        </div>
      )}
      {compare &&
        pinned &&
        selection &&
        renderComparison(pinned, selection, () => setCompare(false))}
    </>
  );
}

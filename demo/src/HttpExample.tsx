import { useEffect, useRef, useState } from 'react';
import {
  GranumGrid,
  decodeView,
  encodeView,
  type DataProvider,
  type GranumGridApi,
  type SavedView,
} from 'granum-grid';
import { connectHttpTrace, type RequestMeasurement } from './data/http-trace';
import type { TraceRow } from './data/trace';

export function HttpExample() {
  const [provider, setProvider] = useState<DataProvider<TraceRow> | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [requests, setRequests] = useState({ count: 0, bytes: 0, lastMs: 0 });
  const [saved, setSaved] = useState<SavedView | null>(null);
  const [link, setLink] = useState('');
  const api = useRef<GranumGridApi<TraceRow>>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setRequests({ count: 0, bytes: 0, lastMs: 0 });
    const measure = (request: RequestMeasurement) => {
      if (!controller.signal.aborted)
        setRequests((value) => ({
          count: value.count + 1,
          bytes: value.bytes + request.bytes,
          lastMs: request.durationMs,
        }));
    };
    void connectHttpTrace(controller.signal, measure)
      .then((value) => {
        if (!controller.signal.aborted) setProvider(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(String(reason));
      });
    return () => controller.abort();
  }, [attempt]);
  const shared = provider ? decodeView(location.hash.replace(/^#view=/, ''), provider) : null;
  const selectNearby = () => {
    const mounted = api.current;
    if (!mounted) return;
    const index = mounted.getSnapshot().activeIndex ?? 0;
    mounted.setSelection({
      start: Math.max(0, index - 10),
      end: Math.min(mounted.provider.rowCount, index + 11),
    });
  };
  return (
    <main className="example-page http-example">
      <a href="./">← Dataset gallery</a>
      <h1>Investigate a recording over HTTP</h1>
      <p>Find a slow event, inspect its neighbours, select a range, then compare or save it.</p>
      <p>
        The server holds a real, redacted Chromium recording. Rows and exact summaries arrive on
        demand. Event durations can overlap; their sum is not CPU time.
      </p>
      <output aria-label="HTTP request statistics">
        {requests.count} requests · {requests.bytes.toLocaleString()} JSON response bytes · last
        response {requests.lastMs.toFixed(1)} ms
      </output>
      {error && (
        <p role="alert">
          {error} <button onClick={() => setAttempt((value) => value + 1)}>Retry connection</button>
        </p>
      )}
      {!provider && !error && <p role="status">Connecting to the recording…</p>}
      {provider && (
        <>
          <div className="http-actions">
            <button
              onClick={(event) => {
                event.currentTarget.focus();
                api.current?.openSearch('duration > 10');
              }}
            >
              Find slow events
            </button>
            <button onClick={selectNearby}>Select nearby events</button>
            <button onClick={() => setSaved(api.current!.getView())}>Remember view</button>
            <button disabled={!saved} onClick={() => saved && api.current?.restoreView(saved)}>
              Restore view
            </button>
            <button
              onClick={() => {
                const view = api.current?.getView();
                if (!view) return;
                const hash = `#view=${encodeView(view)}`;
                history.replaceState(null, '', hash);
                setLink(location.href);
              }}
            >
              Create share link
            </button>
          </div>
          {link && (
            <p>
              <a href={link}>Open saved view</a> · This link needs the same server and recording.
            </p>
          )}
          {location.hash.startsWith('#view=') && !shared && (
            <p role="status">
              This saved view does not match the recording. Showing the beginning.
            </p>
          )}
          <GranumGrid
            provider={provider}
            apiRef={api}
            ariaLabel="HTTP recording events"
            rowHeight={40}
            initialView={shared}
            tools={{ storageKey: 'http-trace-views' }}
            hints={false}
            reducedMotion
            header={
              <>
                <span>Event</span>
                <span>Start (ms)</span>
                <span>Duration (ms)</span>
              </>
            }
            className="http-explorer"
            styles={{
              row: {
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 2fr) 1fr 1fr',
                gap: 12,
                padding: '8px 12px',
              },
            }}
            renderRow={({ row }) => (
              <>
                <span role="gridcell" title={row.name}>
                  {row.name}
                </span>
                <span role="gridcell">{row.time.toFixed(2)}</span>
                <span role="gridcell">{row.duration.toFixed(2)}</span>
              </>
            )}
          />
        </>
      )}
      <a href="./tutorials.html?lesson=compose">Continue to the next lesson →</a>
    </main>
  );
}

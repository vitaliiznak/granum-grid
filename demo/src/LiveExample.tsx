import { useEffect, useMemo, useState } from 'react';
import { GranumGrid, type DataProvider } from 'granum-grid';
import { DetailsIndicator } from './Showcase';

function Feed() {
  const [count, setCount] = useState(200),
    [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setCount((n) => n + 5), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const provider = useMemo<DataProvider<{ text: string }>>(
    () => ({
      id: 'live-example',
      revision: '1',
      rowCount: count,
      async fetchRows(start, length, signal) {
        signal.throwIfAborted();
        return Array.from({ length }, (_, i) => ({
          text: `Generated event ${start + i + 1} · synthetic live feed`,
        }));
      },
    }),
    [count],
  );
  return (
    <>
      <p>
        New events follow while you are at the end. Scroll up to read without losing your place.
      </p>
      <button onClick={() => setRunning(!running)}>
        {running ? 'Pause events' : 'Start events'}
      </button>
      <GranumGrid
        provider={provider}
        ariaLabel="Live example events"
        dataMode="append"
        followOutput
        initialIndex={199}
        rowHeight={36}
        style={{ height: 320, marginTop: 12 }}
        exploration={false}
        features={{ hints: false, flight: false }}
        renderRail={() => null}
        renderToolbar={() => null}
        renderRow={({ row }) => (
          <span role="gridcell" style={{ padding: 8 }}>
            {row.text}
          </span>
        )}
      />
    </>
  );
}
export function LiveExample() {
  const [open, setOpen] = useState(false);
  return (
    <details className="integration" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="integration-title">
          Try a live feed <small>Append rows while preserving your place</small>
        </span>
        <DetailsIndicator />
      </summary>
      {open && (
        <div className="playground-inner">
          <Feed />
        </div>
      )}
    </details>
  );
}

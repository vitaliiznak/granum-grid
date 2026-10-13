import { useRef } from 'react';
import type { ScrollStats } from 'deepscroll';
import { LatencyControl } from './Playground';
import { DEFAULT_LATENCY } from './data/provider';

function BugIcon() {
  return (
    <svg
      className="debug-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m8 3 1.5 2.5M16 3l-1.5 2.5M3 9h3m12 0h3M3 15h3m12 0h3M5 21l3-3m8 0 3 3" />
      <path d="M9 9V7a3 3 0 0 1 6 0v2M12 9v11" />
      <rect x="6" y="9" width="12" height="11" rx="6" />
    </svg>
  );
}

export function DebugTools({
  latency,
  onLatency,
  stats,
}: {
  latency: number;
  onLatency(value: number): void;
  stats: ScrollStats | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        className="ds-button debug-trigger"
        aria-haspopup="dialog"
        title="Adjust the artificial delay added to each new data request"
        onClick={() => dialog.current?.showModal()}
      >
        <BugIcon />
        Simulated server latency: {latency / 1000} s
      </button>
      <dialog ref={dialog} className="debug-dialog" aria-label="Debug and simulation settings">
        <div className="debug-heading">
          <h2>
            <BugIcon /> Debug and simulation settings
          </h2>
          <button className="ds-button" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
        <p>This demo adds an artificial delay to simulate a slower server.</p>
        <LatencyControl latency={latency} onLatency={onLatency} />
        <p className="debug-help">
          Applies immediately to new requests. Cached rows stay instant. Close this panel to try
          scrolling or jumping to another row.
        </p>
        <div className="debug-stats">
          <span>{stats?.activeRequests ?? 0} requests in flight</span>
          <span>{stats?.cachedRows.toLocaleString() ?? '0'} cached rows</span>
        </div>
        <button className="ds-button" onClick={() => onLatency(DEFAULT_LATENCY)}>
          Reset to {DEFAULT_LATENCY / 1000} s
        </button>
      </dialog>
    </>
  );
}

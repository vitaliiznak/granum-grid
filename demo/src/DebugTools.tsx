import { useRef, type ReactNode } from 'react';
import type { Features, ScrollStats } from 'granum-grid';

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

const labels: Record<keyof Features, string> = {
  overview: 'Overview graph',
  chapters: 'Year chapters',
  markers: 'Event markers',
  magnetism: 'Magnetic snapping',
  magnifier: 'Track magnifier',
  precision: 'Precision scrubbing',
  preview: 'Real row previews',
  trail: 'Visited trail',
  inertia: 'Touch inertia',
  edgeElasticity: 'Elastic edges',
  automaticAggregation: 'Zoom out at speed',
  flight: 'Fly-to animation',
  transitions: 'View transitions',
  progressiveEstimates: 'Progressive estimates',
  prefetch: 'Predictive prefetch',
  hints: 'Context hints',
};
export function DebugTools({
  latency,
  onLatency,
  simulateLatency,
  features,
  onFeatures,
  reduced,
  onReduced,
  stats,
  onReset,
  children,
}: {
  latency: number;
  onLatency(value: number): void;
  simulateLatency: boolean;
  features: Features;
  onFeatures(value: Features): void;
  reduced: boolean;
  onReduced(value: boolean): void;
  stats: ScrollStats | null;
  onReset(): void;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        className="ds-button debug-trigger"
        aria-haspopup="dialog"
        title="Developer tools: simulation, behavior, and performance"
        onClick={(event) => {
          // WebKit does not focus buttons on click; give the dialog a return target.
          event.currentTarget.focus({ preventScroll: true });
          dialog.current?.showModal();
        }}
      >
        <BugIcon /> Debug
      </button>
      <dialog ref={dialog} className="debug-dialog" aria-label="Debug">
        <div className="debug-heading">
          <h2>
            <BugIcon /> Debug
          </h2>
          <button className="ds-button" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
        {simulateLatency && (
          <section className="debug-section" aria-label="Server simulation">
            <label className="latency-label">
              <span>Simulated server latency</span>
              <input
                aria-label="Simulated server latency"
                type="range"
                min="0"
                max="10000"
                step="40"
                value={latency}
                onChange={(event) => onLatency(+event.target.value)}
              />
              <output>{latency / 1000} s</output>
            </label>
            <p className="debug-help">
              Artificial delay for new requests. Cached rows stay instant. Close Debug to try
              scrolling or jumping to another row.
            </p>
          </section>
        )}
        <section className="debug-section" aria-label="Behavior">
          <h3>Behavior</h3>
          <label className="feature-switch">
            <input
              type="checkbox"
              checked={reduced}
              onChange={(event) => onReduced(event.target.checked)}
            />
            Emulate reduced motion
          </label>
          <div className="feature-grid">
            {(Object.keys(labels) as (keyof Features)[]).map((key) => (
              <label key={key} className="feature-switch">
                <input
                  type="checkbox"
                  checked={features[key]}
                  onChange={(event) => onFeatures({ ...features, [key]: event.target.checked })}
                />
                {labels[key]}
              </label>
            ))}
          </div>
        </section>
        {children}
        <section className="debug-section" aria-label="Performance">
          <h3>Performance</h3>
          <div className="debug-stats">
            <span>
              <strong>{stats?.cachedRows.toLocaleString() ?? '0'}</strong> cached rows
            </span>
            <span>
              <strong>{((stats?.cachedBytes ?? 0) / 1024).toFixed(0)} KiB</strong> estimated cache
            </span>
            <span>
              <strong>{stats?.activeRequests ?? 0}</strong> in flight
            </span>
            <span>
              <strong>{stats?.abortedRequests ?? 0}</strong> canceled
            </span>
            <span>
              <strong>{stats?.fps ?? '—'}</strong> measured fps
            </span>
            <span>
              <strong>{stats?.completedFetches ?? 0}</strong> pages fetched
            </span>
            <span>
              <strong>{stats?.measuredRows ?? 0}</strong> measured heights
            </span>
          </div>
          <p className="debug-help">Frame rate is measured during navigation on this device.</p>
        </section>
        <button className="ds-button" onClick={onReset}>
          Reset defaults
        </button>
      </dialog>
    </>
  );
}

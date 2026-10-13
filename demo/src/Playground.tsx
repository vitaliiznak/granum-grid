import { defaultFeatures, type Features, type ScrollStats } from 'deepscroll';
import { DEFAULT_LATENCY } from './data/provider';

export function LatencyControl({
  latency,
  onLatency,
}: {
  latency: number;
  onLatency(value: number): void;
}) {
  return (
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
export function Playground({
  features,
  onFeatures,
  latency,
  onLatency,
  reduced,
  onReduced,
  stats,
}: {
  features: Features;
  onFeatures(value: Features): void;
  latency: number;
  onLatency(value: number): void;
  reduced: boolean;
  onReduced(value: boolean): void;
  stats: ScrollStats | null;
}) {
  return (
    <details className="playground">
      <summary>
        <span>
          Developer tools <small>Behavior, latency & performance</small>
        </span>
        <span className="details-indicator" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="playground-inner">
        <div className="playground-controls">
          <LatencyControl latency={latency} onLatency={onLatency} />
          <label className="feature-switch">
            <input
              type="checkbox"
              checked={reduced}
              onChange={(event) => onReduced(event.target.checked)}
            />{' '}
            Emulate reduced motion
          </label>
          <button
            onClick={() => {
              onFeatures({ ...defaultFeatures });
              onReduced(false);
              onLatency(DEFAULT_LATENCY);
            }}
          >
            Reset defaults
          </button>
        </div>
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
        <div className="playground-stats">
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
        <p>
          Aggregates are sampled in a Web Worker. Rows are exact and generated on demand. Frame rate
          is measured during navigation on this device.
        </p>
      </div>
    </details>
  );
}

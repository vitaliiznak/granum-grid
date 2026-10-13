import { defaultFeatures, type Features, type ScrollStats } from 'deepscroll';
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
          ⚙ Playground <small>Tune the experience</small>
        </span>
        <span>+</span>
      </summary>
      <div className="playground-inner">
        <div className="playground-controls">
          <label className="latency-label">
            Server latency{' '}
            <input
              aria-label="Server latency"
              type="range"
              min="0"
              max="2000"
              step="40"
              value={latency}
              onChange={(event) => onLatency(+event.target.value)}
            />
            <output>{latency} ms</output>
          </label>
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
              onLatency(80);
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
        </div>
        <p>
          Aggregates are sampled in a Web Worker. Rows are exact and generated on demand. Frame rate
          is measured during navigation on this device.
        </p>
      </div>
    </details>
  );
}

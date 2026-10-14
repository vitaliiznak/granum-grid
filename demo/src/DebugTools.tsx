import { useRef, type ReactNode } from 'react';
import {
  defaultFeatures,
  type AtlasRailOptions,
  type Features,
  type ScrollStats,
} from 'granum-grid';

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

/**
 * Debug switches across the library's layers: map layers are `AtlasRailOptions`, motion and
 * data are hook `features`, and hints belong to the playground. Map layers start on, features
 * start at the library defaults except elastic edges, which the playground turns on to show
 * them, and context hints start off because they would cover the guided demo.
 */
export const DEMO_SWITCHES = {
  overview: true,
  chapters: true,
  markers: true,
  magnetism: true,
  magnifier: true,
  precision: true,
  preview: true,
  trail: true,
  ...defaultFeatures,
  edgeElasticity: true,
  hints: false,
};
type DemoSwitches = typeof DEMO_SWITCHES;

export function switchFeatures(switches: DemoSwitches): Features {
  const features = { ...defaultFeatures };
  for (const key of Object.keys(features) as (keyof Features)[]) features[key] = switches[key];
  return features;
}

/**
 * A map switch that is off overrides the dataset's map settings; on leaves them alone. The
 * dataset's axis label names its chapters, so a rows axis is labeled Row instead.
 */
export function switchMap(atlas: AtlasRailOptions, switches: DemoSwitches): AtlasRailOptions {
  const map: AtlasRailOptions = {
    ...atlas,
    ...(!switches.overview && { variant: 'markers' }),
    ...(!switches.chapters && { axis: 'rows' }),
    ...(!switches.markers && { showMarkers: false }),
    ...(!switches.magnetism && { snapToMarkers: false, snapToPeaks: false }),
    ...(!switches.magnifier && { showMagnifier: false }),
    ...(!switches.precision && { precision: false }),
    ...(!switches.preview && atlas.preview !== 'summary' && { preview: 'none' }),
    ...(!switches.trail && { showTrail: false }),
  };
  return map.axis === 'rows' ? { ...map, axisLabel: 'Row' } : map;
}

const labels: Record<keyof DemoSwitches, string> = {
  overview: 'Overview graph',
  chapters: 'Chapters',
  markers: 'Event markers',
  magnetism: 'Magnetic snapping',
  magnifier: 'Track magnifier',
  precision: 'Precision scrubbing',
  preview: 'Real row previews',
  trail: 'Visited trail',
  inertia: 'Touch inertia',
  edgeElasticity: 'Elastic edges',
  transitions: 'View transitions',
  progressiveEstimates: 'Progressive estimates',
  prefetch: 'Predictive prefetch',
  hints: 'Context hints',
};
export function DebugTools({
  latency,
  onLatency,
  simulateLatency,
  switches,
  onSwitches,
  reduced,
  onReduced,
  stats,
  fps,
  onReset,
  children,
}: {
  latency: number;
  onLatency(value: number): void;
  simulateLatency: boolean;
  switches: DemoSwitches;
  onSwitches(value: DemoSwitches): void;
  reduced: boolean;
  onReduced(value: boolean): void;
  stats: ScrollStats | null;
  /** Frames per second during the latest navigation, measured by the playground. */
  fps: number | null;
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
        <BugIcon /> debug
      </button>
      <dialog ref={dialog} className="debug-dialog" aria-label="debug">
        <div className="debug-heading">
          <h2>
            <BugIcon /> debug
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
              Artificial delay for new requests. Cached rows stay instant. Close debug to try
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
            {(Object.keys(labels) as (keyof DemoSwitches)[]).map((key) => (
              <label key={key} className="feature-switch">
                <input
                  type="checkbox"
                  checked={switches[key]}
                  onChange={(event) => onSwitches({ ...switches, [key]: event.target.checked })}
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
              <strong>{fps ?? '—'}</strong> measured fps
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

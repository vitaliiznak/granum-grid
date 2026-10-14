import rawTrace from '../data/fixtures/exploration-trace.json?raw';
import {
  elapsed,
  parseTrace,
  traceProvider,
  traceRangeLabel,
  traceBuckets,
  type TraceRecording,
  type TraceRow,
} from '../data/trace';
import { SignalIcon } from './icons';
import { type DemoDataset } from './types';

/** DevTools-style work groups, so the reader can tell script from layout and paint at a glance. */
type Phase = 'scripting' | 'rendering' | 'painting' | 'gc' | 'timing' | 'other';
const PHASE_LABELS: Record<Phase, string> = {
  scripting: 'Scripting',
  rendering: 'Rendering',
  painting: 'Painting',
  gc: 'GC',
  timing: 'Timing',
  other: 'Other',
};
const RENDERING = new Set([
  'UpdateLayoutTree',
  'RecalculateStyles',
  'Layout',
  'HitTest',
  'PrePaint',
  'Layerize',
  'UpdateLayerTree',
  'ScheduleStyleRecalculation',
  'InvalidateLayout',
]);
const PAINTING = new Set([
  'Paint',
  'PaintImage',
  'RasterTask',
  'Composite',
  'CompositeLayers',
  'DecodeImage',
  'Commit',
]);
const SCRIPTING = new Set([
  'FunctionCall',
  'EventDispatch',
  'EvaluateScript',
  'CompileScript',
  'RunMicrotasks',
  'TimerFire',
  'TimerInstall',
  'TimerRemove',
  'FireAnimationFrame',
  'RequestAnimationFrame',
  'FireIdleCallback',
  'XHRReadyStateChange',
]);
export function tracePhase(name: string): Phase {
  if (RENDERING.has(name)) return 'rendering';
  if (PAINTING.has(name)) return 'painting';
  if (SCRIPTING.has(name)) return 'scripting';
  if (/^V8\.GC|GC$|scavenge|Weakness/i.test(name)) return 'gc';
  if (name === 'TimeStamp' || name.startsWith('UserTiming')) return 'timing';
  return 'other';
}
/**
 * Durations span microseconds to tens of milliseconds, so a linear bar hides almost every
 * event. The bar is logarithmic from 1 µs to the longest event; the label stays exact.
 */
const durationShare = (duration: number, longest: number) =>
  Math.log10(1 + duration * 1000) / Math.log10(1 + Math.max(duration, longest, 0.001) * 1000);

export function performanceDataset(
  recording: TraceRecording,
  filename: string,
  revision: string,
): DemoDataset<TraceRow> {
  const provider = traceProvider(recording, revision);
  const longest = recording.rows[recording.longestIndex];
  return {
    id: 'performance',
    name: 'Performance',
    unit: 'events',
    title: 'Inside a browser recording',
    description:
      'Explore recorded browser activity. Use the recording map to find long events, then inspect the surrounding rows.',
    facts: [elapsed(recording.duration), filename],
    icon: <SignalIcon />,
    origin: 'real',
    profileValues: traceBuckets(recording, { start: 0, end: provider.rowCount, buckets: 96 }).map(
      (bucket) => bucket.max,
    ),
    provider,
    rowHeight: 40,
    bytesPerRow: 200,
    sourceNote: `${filename} · ${recording.rows.length.toLocaleString()} complete / instant events · ${recording.ignored.toLocaleString()} unsupported or invalid events omitted. Recording held in memory; no upload.`,
    ariaLabel: 'Performance recording events',
    task: {
      title: `Find the longest recorded event (${elapsed(longest.duration)}), then inspect its neighbours.`,
      action: 'Inspect longest event',
      run: (api) => api.scrollToIndex(recording.longestIndex, { align: 'center' }),
    },
    formatRange: (range) => traceRangeLabel(recording, range),
    atlas: {
      axisLabel: 'Elapsed',
      title: 'Recording map',
      formatValue: (value) => value.toFixed(2),
    },
    map: {
      chapters: 'Elapsed labels',
      profile: 'Event durations',
      tracks: 'Extra tracks',
      explain:
        'Down follows events ordered by start time, not a linear time axis. Right means longer event durations.',
      sampling:
        'Exact summaries of supported events in this recording. Nested events overlap; durations do not represent total CPU time.',
    },
    header: (
      <>
        <span>Event</span>
        <span>Phase</span>
        <span className="trace-col-start">Start</span>
        <span title="Bars use a log scale from 1 µs to the longest event">
          Duration <small>log bar</small>
        </span>
        <span>Thread</span>
      </>
    ),
    tour: [
      {
        feature: 'Investigate',
        label: 'Around longest event',
        hint: `${longest.name} lasts ${elapsed(longest.duration)}. Inspect its surrounding events; overlapping durations are not added together.`,
        run: (api) =>
          api.scrollToIndex(Math.max(0, recording.longestIndex - 32), { align: 'start' }),
      },
      {
        feature: 'Inspect',
        label: 'Longest event',
        hint: 'Exact event duration and relative start time from the recording.',
        run: (api) => api.scrollToIndex(recording.longestIndex, { align: 'center' }),
      },
      {
        feature: 'Search',
        label: 'Events over 10 ms',
        hint: 'Search supported events in this local recording. Search results report when truncated.',
        run: (api) => api.openSearch('duration > 10'),
      },
    ],
    renderRow: ({ row, rowNumber }) => {
      const phase = tracePhase(row.name);
      return (
        <>
          <span role="gridcell" className="trace-event" data-phase={phase}>
            <small>#{rowNumber}</small>
            <strong title={row.category}>{row.name}</strong>
          </span>
          <span role="gridcell" className="trace-phase" data-phase={phase}>
            {PHASE_LABELS[phase]}
          </span>
          <span role="gridcell" className="trace-start">
            {elapsed(row.time)}
          </span>
          <span role="gridcell" className="trace-duration" data-phase={phase}>
            {row.kind === 'instant' ? (
              <>
                <span className="trace-duration-bar" data-instant aria-hidden="true">
                  <i />
                </span>
                <span>Instant</span>
              </>
            ) : (
              <>
                <span className="trace-duration-bar" aria-hidden="true">
                  <i
                    style={{
                      width: `${Math.max(4, durationShare(row.duration, longest.duration) * 100)}%`,
                    }}
                  />
                </span>
                <span>{elapsed(row.duration)}</span>
              </>
            )}
          </span>
          <span role="gridcell" className="trace-thread">
            {row.thread}
          </span>
        </>
      );
    },
  };
}
/** A content-derived revision, so saved views never restore against a re-recorded trace. */
function contentRevision(text: string): string {
  // FNV-1a over UTF-16 code units; identity only, not a security boundary.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return `bundled-${(hash >>> 0).toString(16).padStart(8, '0')}-${text.length}`;
}
export const performance = performanceDataset(
  parseTrace(rawTrace),
  'Bundled Chromium recording',
  contentRevision(rawTrace),
);

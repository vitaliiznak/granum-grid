import type { AggregateRenderContext } from 'granum-grid';
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
import { splitRange } from '../data/ranges';
import { SignalIcon } from './icons';
import { showAll, type DemoDataset } from './types';

function TraceSummary({
  recording,
  context,
}: {
  recording: TraceRecording;
  context: AggregateRenderContext;
}) {
  const { bucket } = context;
  const count = bucket.end - bucket.start;
  const wide = count > 32;
  const names = new Map<string, number>();
  for (let i = bucket.start; i < bucket.end; i++)
    names.set(recording.rows[i].name, (names.get(recording.rows[i].name) ?? 0) + 1);
  const common = [...names].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <div className="trace-summary" data-level={wide ? 'activity' : 'group'}>
      <div className="trace-summary-line">
        <b>{wide ? 'Activity window' : 'Event group'}</b>
        <span>{count.toLocaleString()} events</span>
        <span>Longest {elapsed(bucket.max ?? 0)}</span>
      </div>
      {wide ? (
        <div className="trace-duration-bars" aria-label="Maximum event duration in each subgroup">
          {splitRange(bucket.start, bucket.end, Math.min(32, count)).map(({ start, end }, i) => {
            let max = 0;
            for (let j = start; j < end; j++) max = Math.max(max, recording.rows[j].duration);
            return (
              <span
                key={i}
                style={{
                  height: `${Math.max(8, (max / Math.max(0.001, bucket.max ?? 0)) * 100)}%`,
                }}
              />
            );
          })}
        </div>
      ) : (
        <p>{common.map(([name, n]) => `${name}${n > 1 ? ` ×${n}` : ''}`).join(' · ')}</p>
      )}
    </div>
  );
}
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
      'Explore recorded browser activity. Zoom from activity windows into event groups, then inspect individual events without losing your place.',
    facts: [elapsed(recording.duration), filename],
    icon: <SignalIcon />,
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
      action: 'See whole recording',
      run: showAll,
    },
    formatRange: (range) => traceRangeLabel(recording, range),
    renderAggregate: (context) => <TraceSummary recording={recording} context={context} />,
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
        <span>Start</span>
        <span>Duration</span>
        <span>Thread</span>
      </>
    ),
    tour: [
      {
        feature: 'Zoom',
        label: 'Whole recording',
        hint: 'Each card summarizes consecutive events. Zoom into a card to reveal smaller groups.',
        run: ({ fit }) => fit(),
      },
      {
        feature: 'Investigate',
        label: 'Around longest event',
        hint: `${longest.name} lasts ${elapsed(longest.duration)}. Inspect its surrounding events; overlapping durations are not added together.`,
        run: ({ controller }) =>
          controller.zoomToRange({
            start: Math.max(0, recording.longestIndex - 32),
            end: Math.min(provider.rowCount, recording.longestIndex + 33),
          }),
      },
      {
        feature: 'Inspect',
        label: 'Longest event',
        hint: 'Exact event duration and relative start time from the recording.',
        run: ({ controller }) =>
          controller.scrollToIndex(recording.longestIndex, { align: 'center' }),
      },
      {
        feature: 'Search',
        label: 'Events over 10 ms',
        hint: 'Search supported events in this local recording. Search results report when truncated.',
        run: ({ search }) => search('duration > 10'),
      },
    ],
    renderRow: ({ row, rowNumber }) => (
      <>
        <span role="gridcell" className="trace-event">
          <small>#{rowNumber}</small>
          <strong title={row.category}>{row.name}</strong>
        </span>
        <span role="gridcell">{elapsed(row.time)}</span>
        <span role="gridcell" className="trace-duration">
          <i
            style={{
              width: `${Math.max(1, (row.duration / Math.max(1, longest.duration)) * 100)}%`,
            }}
          />
          <span>{row.kind === 'instant' ? 'Instant' : elapsed(row.duration)}</span>
        </span>
        <span role="gridcell">{row.thread}</span>
      </>
    ),
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

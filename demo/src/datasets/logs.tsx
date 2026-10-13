import {
  DAY,
  DEPLOYS,
  INCIDENTS,
  LOG_COUNT,
  LOG_START,
  logAt,
  logTime,
  type LogLine,
} from '../data/logs';
import { syntheticProvider } from '../data/synthetic';
import { LogsIcon } from './icons';
import { formatCount, type DemoDataset } from './types';

const at = (x: number) => Math.round(x * (LOG_COUNT - 1));
const days = logTime.chapters(
  Array.from({ length: 30 }, (_, i) => LOG_START + i * DAY),
  (time, i) => {
    const date = new Date(time);
    const day = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    return { id: `day-${i + 1}`, label: day, breadcrumb: ['prod-eu-west-1', `${weekday}, ${day}`] };
  },
);
const provider = syntheticProvider<LogLine>({
  id: 'logs',
  revision: '2',
  metric: { label: 'Error rate', unit: '%', kind: 'value', domain: [0, 30] },
  rowAt: logAt,
  markers: [
    ...INCIDENTS.map((i) => ({ id: i.id, index: at(i.x), label: i.label, kind: 'error' as const })),
    ...DEPLOYS.map((d, n) => ({
      id: `deploy-${n}`,
      index: at(d.x),
      label: d.label,
      kind: 'event' as const,
    })),
  ].sort((a, b) => a.index - b.index),
  chapters: days,
  search: {
    examples: ['auth', 'service = "auth"', 'status >= 500', '2026-09-18'],
    fields: {
      level: { kind: 'text', read: (i) => logAt(i).level },
      service: { kind: 'text', read: (i) => logAt(i).service },
      route: { kind: 'text', read: (i) => logAt(i).route },
      message: { kind: 'text', read: (i) => logAt(i).message },
      trace: { kind: 'text', read: (i) => logAt(i).trace },
      status: { kind: 'number', read: (i) => logAt(i).status },
      latency: { kind: 'number', read: (i) => logAt(i).latency },
    },
    // A bare year means its only logged month.
    date: (text) => logTime.dateIndex(text, '09-01'),
    label: (index, field, value) => {
      const line = logAt(index);
      return `${field} ${typeof value === 'number' ? formatCount(value) : value} · ${line.service} · ${line.time.slice(5, 19).replace('T', ' ')}`;
    },
  },
});

const stampede = INCIDENTS.find((i) => i.id === 'INC-2057')!;
export const logs: DemoDataset<LogLine> = {
  id: 'logs',
  name: 'Server logs',
  unit: 'lines',
  title: 'Production logs',
  description:
    'Four billion synthetic request logs from six fictional services across September 2026, with deploys, rollbacks, and five incidents. Rows are generated on demand.',
  facts: ['6 services', 'September 2026'],
  icon: <LogsIcon />,
  provider,
  ariaLabel: 'Synthetic server logs',
  rowHeight: 34,
  bytesPerRow: 220,
  formatRange: ({ start, end }) =>
    `${logAt(start).time.slice(5, 19).replace('T', ' ')}–${logAt(end - 1)
      .time.slice(5, 19)
      .replace('T', ' ')} UTC`,
  task: {
    title: 'Inspect the cache stampede and the deployment just before it.',
    action: 'Open the incident',
    run: (controller) =>
      controller.zoomToRange({
        start: Math.max(0, at(stampede.x) - 300_000),
        end: Math.min(LOG_COUNT, at(stampede.x) + 300_000),
      }),
  },
  atlas: { axisLabel: 'Day', formatValue: (v) => `${v.toFixed(0)}%` },
  map: {
    chapters: 'Days',
    profile: 'Error rate + incidents',
    tracks: 'Show latency track',
    explain:
      'Down follows time. Right means more failing requests. Red diamonds are incidents; others are deploys.',
    sampling: 'Each map group samples 64 lines from the synthetic error-rate model.',
  },
  header: (
    <>
      <span className="lg-col-time">Time (UTC)</span>
      <span className="lg-col-level">Level</span>
      <span className="lg-col-service">Service</span>
      <span className="lg-col-route">Request</span>
      <span className="lg-col-status">Status</span>
      <span className="lg-col-latency">Latency</span>
      <span className="lg-col-message">Message</span>
    </>
  ),
  tour: [
    {
      feature: 'Flight',
      label: 'Fly to INC-2057',
      hint: `The cache stampede, near row ${formatCount(at(stampede.x) + 1)}. Notice the deploy marker just before it.`,
      run: ({ controller }) => controller.goTo(at(stampede.x)),
    },
    {
      feature: 'Markers',
      label: 'Next incident',
      hint: 'Step through incidents only. From the keyboard, N and P visit every marker.',
      run: ({ controller }) => controller.nextMarker('error'),
    },
    {
      feature: 'Search',
      label: 'Find 5xx responses',
      hint: 'Try level = "ERROR", service = "payments", or latency > 2000 as well.',
      run: ({ search }) => search('status >= 500'),
    },
    {
      feature: 'Dates',
      label: 'Jump to Sep 18',
      hint: 'Dates resolve to the first line logged that day. Press Enter to go.',
      run: ({ search }) => search('2026-09-18'),
    },
    {
      feature: 'Zoom',
      requiredView: 'zoom',
      label: 'Whole month at once',
      hint: 'Incidents stand out as spikes in the overview. Ctrl + wheel or pinch to zoom in.',
      run: ({ fit }) => fit(),
    },
  ],
  renderRow: ({ row }) => (
    <>
      <span className="lg-tint" data-level={row.level} aria-hidden="true" />
      <span role="gridcell" className="lg-time">
        {row.time.slice(5, 10)} <span>{row.time.slice(11, 23)}</span>
      </span>
      <span role="gridcell" className="lg-level" data-level={row.level}>
        {row.level}
      </span>
      <span role="gridcell" className="lg-service" data-service={row.service}>
        {row.service}
      </span>
      <span role="gridcell" className="lg-route">
        <b>{row.route.split(' ')[0]}</b> {row.route.split(' ')[1]}
      </span>
      <span role="gridcell" className="lg-status" data-class={String(row.status)[0]}>
        {row.status}
      </span>
      <span role="gridcell" className="lg-latency">
        <span className="lg-latency-bar" data-slow={row.latency > 1000 || undefined}>
          <i style={{ width: `${Math.min(100, (Math.log10(row.latency) / 4.5) * 100)}%` }} />
        </span>
        {row.latency >= 1000 ? `${(row.latency / 1000).toFixed(1)} s` : `${row.latency} ms`}
      </span>
      <span role="gridcell" className="lg-message">
        {row.message} <span>trace={row.trace}</span>
      </span>
    </>
  ),
};

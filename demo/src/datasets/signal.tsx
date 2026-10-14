import {
  CHANNELS,
  ROW_COUNT,
  SPIKE_ROWS,
  rowAt,
  signalTime,
  valueAt,
  type Reading,
} from '../data/signal';
import { syntheticProvider } from '../data/synthetic';
import { SignalIcon } from './icons';
import { type DemoDataset } from './types';

const provider = syntheticProvider<Reading>({
  // The original demo's id; saved views and full-page links depend on it.
  id: 'signal-observatory',
  model: 'signal',
  metric: { label: 'Signal amplitude', unit: 'mV', kind: 'value', domain: [0, 180] },
  rowAt,
  markers: SPIKE_ROWS.map((index, i) => ({
    id: `spike-${i + 1}`,
    index,
    label: `Spike ${i + 1}`,
    kind: 'spike',
  })),
  chapters: signalTime.chapters(
    Array.from({ length: 20 }, (_, i) => Date.UTC(2010 + i, 0, 1)),
    (time) => {
      const year = `${new Date(time).getUTCFullYear()}`;
      return { id: `year-${year}`, label: year, breadcrumb: ['Signal archive', year] };
    },
  ),
  search: {
    examples: ['value > 150', 'category = "North"', '2017-03'],
    fields: {
      value: { kind: 'number', read: valueAt },
      category: { kind: 'text', read: (index) => CHANNELS[index % 4] },
    },
    date: (text) => signalTime.dateIndex(text),
    // Every 5,000th row, cycling through the four interleaved channels.
    candidate: (_query, i, from) => (from + i * 5000 + (i % 4)) % ROW_COUNT,
    label: (_index, field, value) => `${field}: ${value}`,
  },
});

export const signal: DemoDataset<Reading> = {
  id: 'signal',
  name: 'Signal archive',
  unit: 'readings',
  title: 'Signal archive',
  description:
    'Twenty years of readings from four synthetic channels, with regime changes and four numbered spikes. The original Granum Grid demo.',
  facts: ['4 channels', '2010–2030'],
  icon: <SignalIcon />,
  origin: 'synthetic',
  provider,
  ariaLabel: 'Synthetic signal readings',
  rowHeight: 40,
  bytesPerRow: 48,
  formatRange: ({ start, end }) =>
    `${rowAt(start).timestamp.slice(0, 16)}–${rowAt(end - 1).timestamp.slice(0, 16)} UTC`,
  task: {
    title: 'Find a spike, then inspect the readings around it.',
    action: 'Inspect spike 3',
    run: (api) => api.goTo(SPIKE_ROWS[2]),
  },
  atlas: { axisLabel: 'Year', showRange: false },
  map: {
    chapters: 'Years',
    profile: 'Average value + events',
    tracks: 'Show channel tracks',
    explain:
      'Down follows the row order. Right means a higher average signal. The blue line marks your current row.',
    sampling: 'This demo uses 320 groups of 312,500 rows, with 64 sampled readings per group.',
  },
  header: (
    <>
      <span className="column-id">Row</span>
      <span className="column-time">Timestamp</span>
      <span className="column-channel">Channel</span>
      <span className="column-reading">Reading</span>
    </>
  ),
  tour: [
    {
      feature: 'Jump',
      label: 'Jump to spike 3',
      hint: 'Long jumps animate through the overview, so you can see how far you traveled.',
      run: (api) => api.goTo(SPIKE_ROWS[2]),
    },
    {
      feature: 'Search',
      label: 'Readings above 150',
      hint: 'Predicate search runs on the provider. Matches appear on the map; press Enter to travel.',
      run: (api) => api.openSearch('value > 150'),
    },
    {
      feature: 'Dates',
      label: 'Jump to March 2017',
      hint: 'Dates resolve to row addresses through the provider. Press Enter to go there.',
      run: (api) => api.openSearch('2017-03'),
    },
  ],
  renderRow: ({ row, rowNumber, index }, { dynamic, expanded, toggle }) =>
    dynamic ? (
      <>
        <span role="gridcell" className="ds-row-id">
          {rowNumber.toLocaleString('en-US')}
        </span>
        <span role="gridcell" className="reading-note">
          <strong>
            {row.timestamp.slice(0, 10)} · {row.category} · {row.event ? 'SPIKE' : 'Nominal'}
          </strong>
          <p>
            {index % 3 === 0
              ? 'A short observation from the synthetic signal.'
              : index % 3 === 1
                ? 'This observation includes a longer note. Its height follows the available width, so the same record wraps naturally on a narrow screen.'
                : 'A change in the signal is worth a closer look. Expand this record to read the context while keeping your place in the dataset.'}
          </p>
          <button
            className="note-toggle"
            aria-expanded={expanded.has(index)}
            aria-label={`${expanded.has(index) ? 'Collapse' : 'Expand'} row ${rowNumber}`}
            onClick={() => toggle(index)}
          >
            {expanded.has(index) ? 'Less detail' : 'More detail'}
          </button>
          {expanded.has(index) && (
            <p className="expanded-note">
              This is generated example text, not an analysis of real measurements. The reading
              belongs to the {row.category} channel. Longer notes, loaded images, and expanded
              details can change row height after the record appears. The surrounding rows should
              remain adjacent, and the current row should stay anchored while its content changes.
            </p>
          )}
        </span>
        <span role="gridcell" className="reading-value">
          {row.value.toFixed(1)} <small>mV</small>
        </span>
      </>
    ) : (
      <>
        <span role="gridcell" className="ds-row-id">
          {rowNumber.toLocaleString('en-US')}
        </span>
        <span role="gridcell" className="reading-time">
          {row.timestamp.slice(0, 10)} <span>{row.timestamp.slice(11, 19)}</span>
        </span>
        <span role="gridcell" className="reading-category" data-channel={row.category}>
          <i aria-hidden="true" />
          {row.category}
        </span>
        <span role="gridcell" className="reading-value">
          {row.value.toFixed(1)} <small>mV</small>
        </span>
        <span role="gridcell" className="reading-bar" aria-label={`${row.value} millivolts`}>
          <i style={{ width: `${Math.min(100, (row.value / 180) * 100)}%` }} />
        </span>
        <span role="gridcell" className={`reading-status ${row.event ? 'event' : ''}`}>
          {row.event ? 'SPIKE' : null}
        </span>
      </>
    ),
};

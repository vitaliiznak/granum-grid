import { provider } from '../data/provider';
import { ROW_COUNT, SPIKES, rowAt, type Reading } from '../data/signal';
import { SignalIcon } from './icons';
import type { DemoDataset } from './types';

export const signal: DemoDataset<Reading> = {
  id: 'signal',
  name: 'Signal archive',
  unit: 'readings',
  title: 'Signal archive',
  description:
    'Twenty years of readings from four synthetic channels, with regime changes and four numbered spikes. The original deepscroll demo.',
  facts: ['100,000,000 rows', '4 channels', '2010–2030'],
  icon: <SignalIcon />,
  provider,
  ariaLabel: 'Synthetic signal readings',
  rowHeight: 40,
  bytesPerRow: 48,
  formatRange: ({ start, end }) =>
    `${rowAt(start).timestamp.slice(0, 16)}–${rowAt(end - 1).timestamp.slice(0, 16)} UTC`,
  task: {
    title: 'Find a spike, then inspect the readings around it.',
    action: 'See whole archive',
    run: (controller) => controller.zoomToRange({ start: 0, end: ROW_COUNT }),
  },
  help: 'Scroll to inspect. Use the dataset map to jump to a year or event.',
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
      feature: 'Flight',
      label: 'Fly to spike 3',
      hint: 'Long jumps animate through the overview, so you can see how far you traveled.',
      run: ({ controller }) => controller.goTo(Math.round(SPIKES[2] * (ROW_COUNT - 1))),
    },
    {
      feature: 'Search',
      label: 'Readings above 150',
      hint: 'Predicate search runs on the provider. Matches appear on the map; press Enter to travel.',
      run: ({ search }) => search('value > 150'),
    },
    {
      feature: 'Dates',
      label: 'Jump to March 2017',
      hint: 'Dates resolve to row addresses through the provider. Press Enter to go there.',
      run: ({ search }) => search('2017-03'),
    },
    {
      feature: 'Focus',
      requiredView: 'lens',
      label: 'Focused rows',
      hint: 'Read nearby rows in the middle. Compressed summaries above and below show the rest; click them to move there.',
    },
    {
      feature: 'Zoom',
      requiredView: 'zoom',
      label: 'See all 100M rows',
      hint: 'Range summaries group readings into bands. Ctrl + wheel or pinch to zoom; “Inspect rows” returns.',
      run: ({ fit }) => fit(),
    },
    {
      feature: 'History',
      label: 'Undo last jump',
      hint: 'Return to the previous location while keeping your selected view and zoom.',
      run: ({ controller }) => controller.back({ preserveView: true }),
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
        <span role="gridcell" className="reading-category">
          <i />
          {row.category}
        </span>
        <span role="gridcell" className="reading-value">
          {row.value.toFixed(1)} <small>mV</small>
        </span>
        <span role="gridcell" className="reading-bar" aria-label={`${row.value} millivolts`}>
          <i style={{ width: `${(row.value / 180) * 100}%` }} />
        </span>
        <span role="gridcell" className={`reading-status ${row.event ? 'event' : ''}`}>
          {row.event ? 'SPIKE' : '—'}
        </span>
      </>
    ),
};

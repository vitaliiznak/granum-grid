import { GranumGrid, useGranumGrid, type DataProvider } from 'granum-grid';
import { useState } from 'react';

const rows = [
  { name: 'North channel', note: 'Primary signal', value: '37.0 mV' },
  { name: 'East channel', note: 'Secondary signal', value: '37.1 mV' },
  { name: 'West channel', note: 'Reference signal', value: '37.3 mV' },
  { name: 'South channel', note: 'Control signal', value: '37.4 mV' },
];
const exampleProvider: DataProvider<(typeof rows)[number]> = {
  id: 'styling-example',
  revision: '1',
  rowCount: 10_000,
  async fetchRows(start, count) {
    return Array.from({ length: count }, (_, i) => rows[(start + i) % rows.length]);
  },
};
const examples = {
  tokens: {
    label: 'CSS variables',
    description:
      'Keep the default controls. Change the palette, spacing, and shape with your own CSS.',
    code: `import 'granum-grid/styles.css';\n\n<GranumGrid className="my-explorer"\n  provider={provider} ariaLabel="Readings"\n  renderRow={({ row }) => <Cell row={row} />}\n/>\n\n.my-explorer {\n  --ds-accent: #536aa1;\n  --ds-radius: 2px;\n}`,
  },
  components: {
    label: 'Your components',
    description:
      'Bring your buttons, toolbar, and footer. Style individual parts with utility classes, CSS Modules, or inline styles.',
    code: `import 'granum-grid/base.css';\n\n<GranumGrid\n  unstyled\n  classNames={{ row: styles.row }}\n  renderToolbar={({ controller }) => (\n    <Button onClick={() => controller.goTo(0)}>\n      Back to start\n    </Button>\n  )}\n  renderFooter={() => null}\n  // provider, ariaLabel, renderRow…\n/>`,
  },
  headless: {
    label: 'Headless',
    description:
      'Own the entire layout. The hook handles loading, keyboard navigation, and row positioning. No library CSS required.',
    code: `const scroll = useGranumGrid({\n  provider,\n  features: { flight: false,\n    automaticAggregation: false },\n});\n\n<div {...scroll.getViewportProps({\n  style: { height: 180 },\n  'aria-label': 'Readings',\n})}>\n  {scroll.rows.map(slot => (\n    <div key={slot.index}\n      {...scroll.getRowProps(slot)}>\n      <Cell slot={slot} />\n    </div>\n  ))}\n</div>`,
  },
} as const;
type Example = keyof typeof examples;

function HeadlessExample() {
  const scroll = useGranumGrid({
    provider: exampleProvider,
    rowHeight: 54,
    features: { automaticAggregation: false },
    reducedMotion: true,
  });
  return (
    <div className="headless-example">
      <div className="headless-toolbar">
        <span>
          Channels <small>10,000 records</small>
        </span>
        <button
          className="example-button"
          onClick={() => scroll.controller.scrollToIndex(4999, { align: 'start' })}
        >
          Go to 5,000 ↓
        </button>
      </div>
      <div
        {...scroll.getViewportProps({
          className: 'headless-viewport',
          'aria-label': 'Headless channels',
          style: { height: 170 },
        })}
      >
        {scroll.rows.map((slot) => (
          <div key={slot.index} {...scroll.getRowProps(slot, { className: 'headless-row' })}>
            <span role="gridcell" className="headless-index">
              {slot.index + 1}
            </span>
            <span role="gridcell">{slot.status === 'ready' ? slot.row.name : 'Loading…'}</span>
            <span role="gridcell">{slot.status === 'ready' ? slot.row.value : '—'}</span>
          </div>
        ))}
      </div>
      <div {...scroll.getAnnouncementProps()} />
    </div>
  );
}
export function StylingExamples() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Example>('tokens');
  const example = examples[selected];
  return (
    <details
      className="integration"
      id="integration"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          Use it in your app <small>Your design system, your controls</small>
        </span>
        <span className="details-indicator" aria-hidden="true">
          +
        </span>
      </summary>
      {open && (
        <div className="integration-content">
          <div className="example-tabs" role="tablist" aria-label="Integration approach">
            {(Object.keys(examples) as Example[]).map((key) => (
              <button
                key={key}
                role="tab"
                id={`tab-${key}`}
                aria-controls="integration-panel"
                aria-selected={key === selected}
                tabIndex={key === selected ? 0 : -1}
                onClick={() => setSelected(key)}
                onKeyDown={(event) => {
                  const keys = Object.keys(examples) as Example[];
                  let next: Example | undefined;
                  if (event.key === 'ArrowRight')
                    next = keys[(keys.indexOf(key) + 1) % keys.length];
                  if (event.key === 'ArrowLeft')
                    next = keys[(keys.indexOf(key) + keys.length - 1) % keys.length];
                  if (event.key === 'Home') next = keys[0];
                  if (event.key === 'End') next = keys[keys.length - 1];
                  if (next) {
                    event.preventDefault();
                    setSelected(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }
                }}
              >
                {examples[key].label}
              </button>
            ))}
          </div>
          <div id="integration-panel" role="tabpanel" aria-labelledby={`tab-${selected}`}>
            <p>{example.description}</p>
            <div className="example-layout">
              <pre>
                <code>{example.code}</code>
              </pre>
              <div className="example-preview">
                <span className="preview-label">Live example</span>
                {selected === 'headless' ? (
                  <HeadlessExample />
                ) : (
                  <GranumGrid
                    key={selected}
                    provider={exampleProvider}
                    ariaLabel="Styled channels"
                    unstyled={selected === 'components'}
                    rowHeight={42}
                    className={`integration-explorer integration-${selected}`}
                    features={{ hints: false }}
                    classNames={{ row: 'example-row' }}
                    renderRail={() => null}
                    renderToolbar={
                      selected === 'components'
                        ? (scroll) => (
                            <div className="custom-toolbar">
                              <strong>My channels</strong>
                              <button
                                className="example-button"
                                onClick={() => scroll.controller.scrollToIndex(0)}
                              >
                                Back to start ↑
                              </button>
                              <button
                                className="example-button"
                                onClick={() => scroll.controller.scrollToIndex(4999)}
                              >
                                Go to 5,000 ↓
                              </button>
                            </div>
                          )
                        : undefined
                    }
                    renderFooter={selected === 'components' ? () => null : undefined}
                    header="Channel readings"
                    renderRow={({ row, rowNumber }) => (
                      <>
                        <span role="gridcell" className="example-index">
                          {rowNumber}
                        </span>
                        <span role="gridcell">{row.name}</span>
                        <span role="gridcell">{row.value}</span>
                      </>
                    )}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </details>
  );
}

import {
  DeepScroll,
  defaultFeatures,
  type ScrollStats,
  type DeepScrollEngine,
  type NavigationLocation,
  type ScrollAlignment,
} from 'deepscroll';
import { useEffect, useRef, useState } from 'react';
import { Playground } from './Playground';
import { stopWorker } from './data/worker-client';
import { provider, setLatency } from './data/provider';
export default function App() {
  const [latency, updateLatency] = useState(80);
  const [features, setFeatures] = useState({ ...defaultFeatures });
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [reduced, setReduced] = useState(false);
  const [stats, setStats] = useState<ScrollStats | null>(null);
  const [dynamic, setDynamic] = useState(false);
  const [expanded, setExpanded] = useState(new Set<number>());
  const [targetRow, setTargetRow] = useState(73_500_000);
  const [align, setAlign] = useState<ScrollAlignment>('center');
  const [saved, setSaved] = useState<NavigationLocation | null>(null);
  const controller = useRef<DeepScrollEngine>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => () => stopWorker(), []);
  const changeLatency = (value: number) => {
    updateLatency(value);
    setLatency(value);
  };
  return (
    <main className="app">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="deepscroll home">
          <span className="logo">≋</span> deepscroll<span className="version">LAB / 0.1</span>
        </a>
        <div className="header-controls">
          <span className="header-note">A map for your data</span>
          <button
            aria-label="Toggle color theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '☼ Light' : '☾ Dark'}
          </button>
        </div>
      </header>
      <section className="intro">
        <div>
          <div className="eyebrow">
            <span className="live-dot" /> THE SIGNAL OBSERVATORY
          </div>
          <h1>
            A hundred million rows.
            <br />
            <span>Find your way through.</span>
          </h1>
          <p>
            Twenty years of synthetic readings. Explore the pattern,
            <br className="desktop-break" /> find an event, and get closer to the details.
          </p>
        </div>
        <div className="dataset-card">
          <span>DATASET 001</span>
          <strong>100,000,000</strong>
          <small>READINGS · 2010 — 2030</small>
          <div className="dataset-tags">
            <span>Deterministic</span>
            <span>On demand</span>
          </div>
        </div>
      </section>
      <div className="explorer-caption">
        <span>
          <i /> LIVE EXPLORER
        </span>
        <label>
          <input
            type="checkbox"
            checked={dynamic}
            onChange={(event) => setDynamic(event.target.checked)}
          />{' '}
          Dynamic row heights
        </label>
      </div>
      {dynamic && (
        <div className="row-controls">
          <label>
            Row{' '}
            <input
              aria-label="Target row"
              type="number"
              min={1}
              max={100_000_000}
              value={targetRow}
              onChange={(event) => setTargetRow(event.target.valueAsNumber)}
            />
          </label>
          <label>
            Align{' '}
            <select
              aria-label="Row alignment"
              value={align}
              onChange={(event) => setAlign(event.target.value as ScrollAlignment)}
            >
              {(['start', 'center', 'end', 'auto'] as const).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() =>
              Number.isSafeInteger(targetRow) &&
              controller.current?.scrollToIndex(targetRow - 1, { align })
            }
          >
            Go to row
          </button>
          <button onClick={() => setSaved(controller.current?.getLocation() ?? null)}>
            Save position
          </button>
          <button disabled={!saved} onClick={() => saved && controller.current?.restore(saved)}>
            Restore position
          </button>
        </div>
      )}
      <DeepScroll
        provider={provider}
        ariaLabel="Synthetic signal readings"
        header={
          <>
            ROW ADDRESS <span style={{ marginLeft: 30 }}>TIMESTAMP · CATEGORY · READING</span>
          </>
        }
        rowHeight={36}
        dynamicRowHeight={dynamic}
        initialLocation={controller.current?.getLocation()}
        controllerRef={controller}
        theme={theme}
        features={features}
        reducedMotion={reduced ? true : 'system'}
        onStats={setStats}
        className="demo-explorer"
        renderRow={({ row, rowNumber, index }) =>
          dynamic ? (
            <>
              <span role="gridcell" className="ds-row-id">
                {rowNumber.toLocaleString('en-US')}
              </span>
              <span role="gridcell" className="reading-note">
                <strong>
                  {row.timestamp.slice(0, 10)} · {row.category} · {row.event ? 'SPIKE' : 'NOMINAL'}
                </strong>
                <p>
                  {index % 3 === 0
                    ? 'A short observation from the synthetic signal.'
                    : index % 3 === 1
                      ? 'This observation includes a longer note. Its height follows the available width, so the same record wraps naturally on a narrow screen.'
                      : 'A change in the signal is worth a closer look. Expand this record to read the context while keeping your place in the dataset.'}
                </p>
                <button
                  aria-expanded={expanded.has(index)}
                  aria-label={`${expanded.has(index) ? 'Collapse' : 'Expand'} row ${rowNumber}`}
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    })
                  }
                >
                  {expanded.has(index) ? 'Less detail' : 'More detail'}
                </button>
                {expanded.has(index) && (
                  <p className="expanded-note">
                    This is generated example text, not an analysis of real measurements. The
                    reading belongs to the {row.category} channel. Longer notes, loaded images, and
                    expanded details can change row height after the record appears. The surrounding
                    rows should remain adjacent, and the current row should stay anchored while its
                    content changes.
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
                {row.event ? 'SPIKE' : 'NOMINAL'}
              </span>
            </>
          )
        }
      />
      <Playground
        features={features}
        onFeatures={setFeatures}
        latency={latency}
        onLatency={changeLatency}
        reduced={reduced}
        onReduced={setReduced}
        stats={stats}
      />
      <footer className="site-footer">
        <span>Only the rows you see. Never the entire dataset.</span>
        <span>
          REACT + TYPESCRIPT <b>↗</b>
        </span>
      </footer>
    </main>
  );
}

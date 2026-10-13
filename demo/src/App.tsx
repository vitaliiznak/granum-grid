import { DeepScroll, defaultFeatures, type ScrollStats } from 'deepscroll';
import { useEffect, useState } from 'react';
import { Playground } from './Playground';
import { stopWorker } from './data/worker-client';
import { provider, setLatency } from './data/provider';
export default function App() {
  const [latency, updateLatency] = useState(80);
  const [features, setFeatures] = useState({ ...defaultFeatures });
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [reduced, setReduced] = useState(false);
  const [stats, setStats] = useState<ScrollStats | null>(null);
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
        <span>Scroll to explore · drag the right rail to travel</span>
      </div>
      <DeepScroll
        provider={provider}
        ariaLabel="Synthetic signal readings"
        header={
          <>
            ROW ADDRESS <span style={{ marginLeft: 30 }}>TIMESTAMP · CATEGORY · READING</span>
          </>
        }
        rowHeight={36}
        theme={theme}
        features={features}
        reducedMotion={reduced ? true : 'system'}
        onStats={setStats}
        className="demo-explorer"
        renderRow={({ row, rowNumber }) => (
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
        )}
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

import { DeepScroll } from 'deepscroll';
import { useState } from 'react';
import { provider, setLatency } from './data/provider';
export default function App() {
  const [latency, updateLatency] = useState(80);
  return <main className="app"><header className="site-header"><a className="wordmark" href="/" aria-label="deepscroll home"><span className="logo">≋</span> deepscroll<span className="version">LAB / 0.1</span></a><span className="header-note">A map for your data</span></header>
    <section className="intro"><div><div className="eyebrow"><span className="live-dot"/> THE SIGNAL OBSERVATORY</div><h1>A hundred million rows.<br/><span>Find your way through.</span></h1><p>Twenty years of synthetic readings. Explore the pattern,<br className="desktop-break"/> find an event, and get closer to the details.</p></div><div className="dataset-card"><span>DATASET 001</span><strong>100,000,000</strong><small>READINGS · 2010 — 2030</small><div className="dataset-tags"><span>Deterministic</span><span>On demand</span></div></div></section>
    <div className="latency-control"><label>Simulated server latency <input aria-label="Server latency" type="range" min="0" max="2000" step="40" value={latency} onChange={e => { const value = +e.target.value; updateLatency(value); setLatency(value); }}/><output>{latency} ms</output></label></div><div className="explorer-caption"><span><i/> LIVE EXPLORER</span><span>Scroll to explore · drag the right rail to travel</span></div>
    <DeepScroll provider={provider} ariaLabel="Synthetic signal readings" rowHeight={36} theme="dark" style={{ height: 560 }} renderRow={({ row, rowNumber }) => <>
      <span role="gridcell" className="ds-row-id">{rowNumber.toLocaleString('en-US').padStart(11, '0')}</span>
      <span role="gridcell" className="reading-time">{row.timestamp.slice(0, 10)} <span>{row.timestamp.slice(11, 19)}</span></span>
      <span role="gridcell" className="reading-category"><i/>{row.category}</span>
      <span role="gridcell" className="reading-value">{row.value.toFixed(1)} <small>mV</small></span>
      <span role="gridcell" className="reading-bar" aria-label={`${row.value} millivolts`}><i style={{ width: `${row.value / 180 * 100}%` }}/></span>
      <span role="gridcell" className={`reading-status ${row.event ? 'event' : ''}`}>{row.event ? 'SPIKE' : 'NOMINAL'}</span>
    </>}/>
    <footer className="site-footer"><span>Only the rows you see. Never the entire dataset.</span><span>REACT + TYPESCRIPT <b>↗</b></span></footer>
  </main>;
}

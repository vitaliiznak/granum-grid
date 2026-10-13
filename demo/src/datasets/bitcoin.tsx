import {
  bitcoinProvider,
  liveRowCount,
  secondLabel,
  timeAt,
  type BitcoinSecond,
} from '../data/binance';
import { BitcoinIcon } from './icons';
import { compact, formatCount, showAll, type DemoDataset } from './types';

const provider = bitcoinProvider(liveRowCount());
const price = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const bitcoin: DemoDataset<BitcoinSecond> = {
  id: 'bitcoin',
  name: 'Bitcoin (live)',
  unit: 'seconds',
  title: 'Bitcoin, second by second',
  description:
    'Every second of BTC/USDT trading on Binance since the pair opened in August 2017. Real candles arrive on demand from Binance’s public API; nothing is generated.',
  facts: ['1 row per second', 'since 2017-08-17', 'Binance API'],
  icon: <BitcoinIcon />,
  provider,
  ariaLabel: 'Binance BTC/USDT seconds',
  rowHeight: 38,
  bytesPerRow: 96,
  sourceLabel: 'Binance API',
  sourceNote:
    'Live data from Binance’s public market-data API (BTC/USDT 1-second candles), requested directly by this page without a key. The demo spends at most half of Binance’s per-address rate limit and pauses when Binance asks it to.',
  formatRange: ({ start, end }) =>
    `${secondLabel(timeAt(start))} – ${secondLabel(timeAt(end - 1))} UTC`,
  task: {
    title: 'Find the sharpest one-day fall, then read the seconds around it.',
    action: 'See whole history',
    run: showAll,
  },
  atlas: { axisLabel: 'Year', formatValue: (v) => `$${compact(v)}` },
  map: {
    chapters: 'Years',
    profile: 'Price range',
    tracks: 'Show volume and trades',
    explain:
      'Down follows time, one row per second. Right means a higher price: the band spans the traded low and high, the line is the volume-weighted average.',
    sampling:
      'Summaries come from Binance candles. Groups that whole candles tile are exact; other groups use the enclosing candles and are marked estimated.',
  },
  header: (
    <>
      <span className="bt-col-time">Time (UTC)</span>
      <span className="bt-col-close">Close</span>
      <span className="bt-col-range">Low – high</span>
      <span className="bt-col-volume">Volume (BTC)</span>
      <span className="bt-col-trades">Trades</span>
      <span className="bt-col-buy">Taker buy</span>
    </>
  ),
  tour: [
    {
      feature: 'Flight',
      label: 'Fly to the highest trade',
      hint: 'Found from the data: weekly, daily, hourly, and minute candles narrow it to one second.',
      run: async ({ controller }) => {
        const markers = await provider.loadMarkers(new AbortController().signal);
        const peak = markers.find((marker) => marker.id === 'highest');
        if (peak) controller.goTo(peak.index);
      },
    },
    {
      feature: 'Search',
      label: 'Find a trade above $100k',
      hint: 'Price thresholds descend from weeks to the exact second in a handful of requests.',
      run: ({ search }) => search('high >= 100000'),
    },
    {
      feature: 'Dates',
      label: 'Jump to 12 March 2020',
      hint: 'Type any date — 2020, 2020-03, or 2020-03-12 — and press Enter. Row addresses are seconds.',
      run: ({ search }) => search('2020-03-12'),
    },
    {
      feature: 'Markers',
      label: 'Next big move',
      hint: 'Markers are the largest daily rises and falls in the data. N and P step between them.',
      run: ({ controller }) => controller.nextMarker(),
    },
    {
      feature: 'Zoom',
      requiredView: 'zoom',
      label: 'Nine years at once',
      hint: 'Summaries come from coarser candles as you zoom out, so a few requests cover any range.',
      run: ({ fit }) => fit(),
    },
  ],
  renderRow: ({ row }) => {
    const time = new Date(row.time).toISOString();
    const when = (
      <span role="gridcell" className="bt-time">
        {time.slice(0, 10)} <span>{time.slice(11, 19)}</span>
      </span>
    );
    if (row.missing)
      return (
        <>
          {when}
          <span role="gridcell" className="bt-missing">
            No candle published
          </span>
          {['range', 'volume', 'trades', 'buy'].map((column) => (
            <span key={column} role="gridcell" className={`bt-${column}`}>
              —
            </span>
          ))}
        </>
      );
    const trend = row.close > row.open ? 'up' : row.close < row.open ? 'down' : 'flat';
    return (
      <>
        {when}
        <span role="gridcell" className="bt-close" data-trend={trend}>
          <i aria-hidden="true">{trend === 'up' ? '▲' : trend === 'down' ? '▼' : '·'}</i>
          {price(row.close)}
        </span>
        <span role="gridcell" className="bt-range">
          {price(row.low)} – {price(row.high)}
        </span>
        <span role="gridcell" className="bt-volume">
          <span className="mk-size-bar">
            <i style={{ width: `${Math.min(100, Math.log10(1 + row.volume * 100) * 25)}%` }} />
          </span>
          {row.volume.toFixed(5)}
        </span>
        <span role="gridcell" className="bt-trades">
          {formatCount(row.trades)}
        </span>
        <span role="gridcell" className="bt-buy">
          {row.volume > 0 ? `${Math.round((row.takerBuyVolume / row.volume) * 100)}%` : '—'}
        </span>
      </>
    );
  },
};

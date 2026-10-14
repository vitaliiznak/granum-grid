import { bitcoinProvider, liveRowCount, timeAt, type BitcoinSecond } from '../data/binance';
import { secondLabel } from '../data/remote';
import { BitcoinIcon } from './icons';
import { compact, jumpToMarker, formatCount, inspectLatest, type DemoDataset } from './types';

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
  origin: 'real',
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
    action: 'Inspect latest rows',
    run: inspectLatest,
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
  renderDetails: (row) => (
    <>
      <p className="inspector-market">BTC / USDT · 1-second candle</p>
      <p className="inspector-timestamp">
        <time dateTime={new Date(row.time).toISOString()}>
          {new Date(row.time).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}
        </time>
      </p>
      {row.missing ? (
        <p>No candle published for this second. Values are unavailable.</p>
      ) : (
        <>
          <dl className="candle-details">
            {(
              [
                ['Open', row.open, 'USDT'],
                ['High', row.high, 'USDT'],
                ['Low', row.low, 'USDT'],
                ['Close', row.close, 'USDT'],
                ['Volume', row.volume, 'BTC'],
                ['Quote volume', row.quoteVolume, 'USDT'],
                ['Trades', row.trades, ''],
                ['Taker buy volume', row.takerBuyVolume, 'BTC'],
              ] as const
            ).map(([label, value, unit]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {String(value)}
                  {unit && <span> {unit}</span>}
                </dd>
              </div>
            ))}
          </dl>
          {row.trades === 0 && <p>No trades occurred in this second.</p>}
        </>
      )}
      <p className="inspector-source">
        Source: Binance BTC/USDT candle. Values shown at the precision supplied by the loaded
        record.
      </p>
    </>
  ),
  tour: [
    {
      feature: 'Jump',
      label: 'Jump to the highest trade',
      hint: 'Found from the data: weekly, daily, hourly, and minute candles narrow it to one second.',
      run: jumpToMarker(provider, 'highest'),
    },
    {
      feature: 'Search',
      label: 'Next trade above $100k',
      hint: 'Price thresholds descend from weeks to the exact second in a handful of requests.',
      run: (api) => api.openSearch('high >= 100000'),
    },
    {
      feature: 'Dates',
      label: 'Jump to 12 March 2020',
      hint: 'Type any date — 2020, 2020-03, or 2020-03-12 — and press Enter. Row addresses are seconds.',
      run: (api) => api.openSearch('2020-03-12'),
    },
    {
      feature: 'Markers',
      label: 'Next big move',
      hint: 'Markers are the largest daily rises and falls in the data. N and P step between them.',
      run: (api) => api.nextMarker(),
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
    // A second without trades repeats the last price; muting it lets active seconds stand out.
    const quiet = row.trades === 0 || undefined;
    const buyShare = row.volume > 0 ? Math.round((row.takerBuyVolume / row.volume) * 100) : null;
    return (
      <>
        {when}
        <span
          role="gridcell"
          className="bt-close"
          data-trend={trend}
          data-quiet={quiet}
          title={quiet && 'No trades in this second'}
        >
          <i aria-hidden="true">{trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''}</i>
          {price(row.close)}
        </span>
        <span role="gridcell" className="bt-range">
          {row.low === row.high ? price(row.low) : `${price(row.low)} – ${price(row.high)}`}
        </span>
        <span role="gridcell" className="bt-volume" data-quiet={quiet}>
          <span className="mk-size-bar">
            <i style={{ width: `${Math.min(100, Math.log10(1 + row.volume * 100) * 25)}%` }} />
          </span>
          {row.volume.toFixed(5)}
        </span>
        <span role="gridcell" className="bt-trades">
          {formatCount(row.trades)}
        </span>
        <span role="gridcell" className="bt-buy">
          {buyShare === null ? (
            '—'
          ) : (
            <>
              <span className="bt-buy-bar" aria-hidden="true">
                <i style={{ width: `${buyShare}%` }} />
              </span>
              {buyShare}%
            </>
          )}
        </span>
      </>
    );
  },
};

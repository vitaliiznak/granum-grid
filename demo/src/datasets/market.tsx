import {
  ALL_TIME_HIGH,
  MARKET_EVENTS,
  MARKET_START,
  MARKET_END,
  TRADE_COUNT,
  marketIndexAt,
  priceAt,
  tradeAt,
  type Trade,
} from '../data/market';
import { syntheticProvider } from '../data/synthetic';
import { MarketIcon } from './icons';
import { compact, formatCount, type DemoDataset } from './types';

const eventIndex = (x: number) => Math.round(x * (TRADE_COUNT - 1));
const years = Array.from({ length: 10 }, (_, i) => ({
  id: `year-${2016 + i}`,
  start: marketIndexAt(Date.UTC(2016 + i, 0, 1)),
  end: i === 9 ? TRADE_COUNT : marketIndexAt(Date.UTC(2017 + i, 0, 1)),
  label: `${2016 + i}`,
  breadcrumb: ['Market tape', `${2016 + i}`],
}));
const provider = syntheticProvider<Trade>({
  id: 'market',
  metric: { label: 'Price', unit: 'USD', kind: 'value', domain: [0, 360] },
  rowAt: tradeAt,
  markers: [
    ...MARKET_EVENTS.map((e) => ({
      id: e.id,
      index: eventIndex(e.x),
      label: e.label,
      kind: 'spike' as const,
    })),
    { id: 'ath', index: ALL_TIME_HIGH, label: 'All-time high', kind: 'event' as const },
  ].sort((a, b) => a.index - b.index),
  chapters: years,
  search: {
    examples: 'size > 5000, price < 120, side = "SELL", or 2020-03',
    fields: {
      price: { kind: 'number', read: priceAt },
      size: { kind: 'number', read: (i) => tradeAt(i).size },
      side: { kind: 'text', read: (i) => tradeAt(i).side },
      venue: { kind: 'text', read: (i) => tradeAt(i).venue },
    },
    date(text) {
      const time = Date.parse(
        `${text.length === 4 ? `${text}-01-01` : text.length === 7 ? `${text}-01` : text}T00:00:00Z`,
      );
      return Number.isFinite(time) && time >= MARKET_START && time < MARKET_END
        ? marketIndexAt(time)
        : null;
    },
    label: (index, field, value) =>
      `${field} ${typeof value === 'number' ? formatCount(value) : value} · ${tradeAt(index).time.slice(0, 16).replace('T', ' ')}`,
  },
});

export const market: DemoDataset<Trade> = {
  id: 'market',
  name: 'Market tape',
  unit: 'trades',
  title: 'Market tape',
  description:
    'Ten years of tick-by-tick trades in DSX, a fictional 24/7 composite. Crashes, a rate shock, and block trades are all in the tape.',
  facts: [`${formatCount(TRADE_COUNT)} trades`, '10 years', '2016–2025'],
  icon: <MarketIcon />,
  provider,
  ariaLabel: 'Synthetic trades',
  rowHeight: 38,
  bytesPerRow: 72,
  help: 'Every row is one trade. Use the map to find a crash or a year.',
  atlas: { axisLabel: 'Year', formatValue: (v) => `$${v.toFixed(0)}` },
  map: {
    chapters: 'Years',
    profile: 'Price + events',
    tracks: 'Show market tracks',
    explain:
      'Down follows time. Right means a higher price. Diamonds mark crashes and the all-time high.',
    sampling: 'Each map group samples 64 trades from the synthetic price model.',
  },
  header: (
    <>
      <span className="mk-col-time">Time (UTC)</span>
      <span className="mk-col-side">Side</span>
      <span className="mk-col-price">Price</span>
      <span className="mk-col-size">Size</span>
      <span className="mk-col-notional">Notional</span>
      <span className="mk-col-venue">Venue</span>
    </>
  ),
  tour: [
    {
      feature: 'Flight',
      label: 'Fly to flash crash',
      hint: 'Markers are addresses: one click flies 160 million trades and lands on the exact row.',
      run: ({ controller }) => controller.goTo(eventIndex(MARKET_EVENTS[0].x)),
    },
    {
      feature: 'Search',
      label: 'Find block trades',
      hint: 'Size, price, side, and venue are searchable. Matches light up on the map.',
      run: ({ search }) => search('size > 5000'),
    },
    {
      feature: 'Dates',
      label: 'Jump to June 2022',
      hint: 'Type any date — 2022, 2022-06, or 2022-06-13 — and press Enter.',
      run: ({ search }) => search('2022-06'),
    },
    {
      feature: 'Markers',
      label: 'Next market event',
      hint: 'N and P step between events. Hover the map to preview real rows before you jump.',
      run: ({ controller }) => controller.nextMarker(),
    },
    {
      feature: 'Zoom',
      requiredView: 'zoom',
      label: 'Ten years at once',
      hint: 'The overview turns 750 million trades into a readable chart. Ctrl + wheel to zoom.',
      run: ({ fit }) => fit(),
    },
    {
      feature: 'Lens',
      requiredView: 'lens',
      label: 'Focus + context',
      hint: 'Read the trades around you while the rest of the decade compresses beside them.',
    },
  ],
  renderRow: ({ row }) => (
    <>
      <span role="gridcell" className="mk-time">
        {row.time.slice(0, 10)} <span>{row.time.slice(11, 23)}</span>
      </span>
      <span role="gridcell" className="mk-side" data-side={row.side}>
        {row.side}
      </span>
      <span
        role="gridcell"
        className="mk-price"
        data-trend={row.change > 0 ? 'up' : row.change < 0 ? 'down' : 'flat'}
      >
        <i aria-hidden="true">{row.change > 0 ? '▲' : row.change < 0 ? '▼' : '·'}</i>
        {row.price.toFixed(2)}
      </span>
      <span role="gridcell" className="mk-size">
        <span className="mk-size-bar">
          <i style={{ width: `${Math.min(100, (Math.log10(row.size) / 4.7) * 100)}%` }} />
        </span>
        {formatCount(row.size)}
        {row.block && <b className="mk-block">BLOCK</b>}
      </span>
      <span role="gridcell" className="mk-notional">
        ${compact(row.size * row.price)}
      </span>
      <span role="gridcell" className="mk-venue">
        {row.venue}
      </span>
    </>
  ),
};

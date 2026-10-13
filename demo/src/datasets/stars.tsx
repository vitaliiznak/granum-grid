import {
  BRIGHT_STRIDE,
  CONSTELLATIONS,
  GALACTIC_CENTER_INDEX,
  NAMED_STARS,
  STAR_COUNT,
  indexAtRa,
  starAt,
  type Star,
} from '../data/stars';
import { syntheticProvider } from '../data/synthetic';
import type { CSSProperties } from 'react';
import { StarsIcon } from './icons';
import { formatCount, type DemoDataset } from './types';

const pad = (value: number, digits = 2) => String(value).padStart(digits, '0');
function sexagesimal(value: number) {
  const total = Math.abs(value);
  const whole = Math.floor(total),
    minutes = Math.floor((total - whole) * 60),
    seconds = ((total - whole) * 60 - minutes) * 60;
  return { sign: value < 0 ? '−' : '+', whole, minutes, seconds };
}
export const formatRa = (hours: number) => {
  const { whole, minutes, seconds } = sexagesimal(hours);
  return `${pad(whole)}h ${pad(minutes)}m ${seconds.toFixed(2).padStart(5, '0')}s`;
};
export const formatDec = (degrees: number) => {
  const { sign, whole, minutes, seconds } = sexagesimal(degrees);
  return `${sign}${pad(whole)}° ${pad(minutes)}′ ${pad(Math.floor(seconds))}″`;
};
/** IAU-style designation built from the coordinates. */
function designation(star: Star) {
  const ra = sexagesimal(star.ra),
    dec = sexagesimal(star.dec);
  return `J${pad(ra.whole)}${pad(ra.minutes)}${ra.seconds.toFixed(1).padStart(4, '0')}${dec.sign}${pad(dec.whole)}${pad(dec.minutes)}${pad(Math.floor(dec.seconds))}`;
}
const provider = syntheticProvider<Star>({
  id: 'stars',
  metric: { label: 'Sky density', unit: 'M stars / RA min', kind: 'value' },
  rowAt: starAt,
  markers: [
    ...NAMED_STARS.map((s) => ({
      id: s.name,
      index: s.index,
      label: s.name,
      kind: 'event' as const,
    })),
    {
      id: 'galactic-center',
      index: GALACTIC_CENTER_INDEX,
      label: 'Galactic center',
      kind: 'spike' as const,
    },
  ].sort((a, b) => a.index - b.index),
  chapters: Array.from({ length: 24 }, (_, h) => ({
    id: `ra-${h}`,
    start: indexAtRa(h),
    end: h === 23 ? STAR_COUNT : indexAtRa(h + 1),
    label: `${pad(h)}h`,
    breadcrumb: ['Sky catalog', `RA ${pad(h)}h`, CONSTELLATIONS[h]],
  })),
  search: {
    examples: 'mag < 6, class = "O", distance < 100, or name = "Vega"',
    fields: {
      mag: { kind: 'number', read: (i) => starAt(i).mag },
      class: { kind: 'text', read: (i) => starAt(i).type },
      distance: { kind: 'number', read: (i) => starAt(i).ly },
      dec: { kind: 'number', read: (i) => starAt(i).dec },
      name: { kind: 'text', read: (i) => starAt(i).name ?? '' },
    },
    lookup(query) {
      if (query.field !== 'name' || query.operator !== '=') return null;
      return NAMED_STARS.filter(
        (s) => s.name.toLowerCase() === String(query.value).toLowerCase(),
      ).map((s) => ({ id: s.name, index: s.index, label: s.name, kind: 'search' }));
    },
    candidate(query, i, from) {
      // Bright stars sit on a fixed stride, so brightness queries can visit them directly.
      if (
        query.field === 'mag' &&
        ['<', '<='].includes(query.operator) &&
        Number(query.value) < 6.6
      ) {
        const first = Math.ceil((from - 7) / BRIGHT_STRIDE);
        const count = Math.floor((STAR_COUNT - 8) / BRIGHT_STRIDE) + 1;
        return i < count ? 7 + ((((first + i) % count) + count) % count) * BRIGHT_STRIDE : -1;
      }
      return (from + i * Math.floor(STAR_COUNT / 20_000) + (i % 7)) % STAR_COUNT;
    },
    label: (index, field, value) => {
      const star = starAt(index);
      return `${field} ${typeof value === 'number' ? formatCount(value) : value} · ${star.name ?? designation(star)}`;
    },
  },
});

const sirius = NAMED_STARS.find((s) => s.name === 'Sirius')!;
export const stars: DemoDataset<Star> = {
  id: 'stars',
  name: 'Star catalog',
  unit: 'stars',
  title: 'Gaia-scale star catalog',
  description:
    'A whole-sky catalog ordered by right ascension. The Milky Way crosses twice, so dense hours take more rows. Named stars use real coordinates; the rest are synthetic.',
  facts: [
    `${formatCount(STAR_COUNT)} stars`,
    '24 hours of sky',
    `${NAMED_STARS.length} named stars`,
  ],
  icon: <StarsIcon />,
  provider,
  ariaLabel: 'Synthetic star catalog',
  rowHeight: 42,
  initialIndex: NAMED_STARS[0].index - 4,
  bytesPerRow: 120,
  formatRange: ({ start, end }) =>
    `${formatRa(starAt(start).ra)}–${formatRa(starAt(end - 1).ra)} RA`,
  task: {
    title: 'Find a dense part of the catalog, then inspect its stars.',
    action: 'See whole catalog',
    run: (controller) => controller.zoomToRange({ start: 0, end: STAR_COUNT }),
  },
  help: 'Every row is one star. The map shows where the Milky Way makes the sky crowded.',
  atlas: { axisLabel: 'RA', formatValue: (v) => `${v.toFixed(1)}M` },
  map: {
    chapters: 'Hours of RA',
    profile: 'Sky density + named stars',
    tracks: 'Show sky tracks',
    explain:
      'Down follows right ascension, 00h to 24h. Right means more stars per minute of sky. Peaks are the Milky Way.',
    sampling: 'Each map group samples 64 stars from the synthetic density model.',
  },
  header: (
    <>
      <span className="st-col-star">Star</span>
      <span className="st-col-ra">Right ascension</span>
      <span className="st-col-dec">Declination</span>
      <span className="st-col-mag">Magnitude</span>
      <span className="st-col-class">Class</span>
      <span className="st-col-distance">Distance</span>
    </>
  ),
  tour: [
    {
      feature: 'Flight',
      label: 'Fly to Sirius',
      hint: 'The brightest star in the night sky, 380 million rows in. Hover the map to preview stars first.',
      run: ({ controller }) => controller.goTo(sirius.index),
    },
    {
      feature: 'Markers',
      label: 'Visit the galactic center',
      hint: 'The densest stretch of sky. Compare how many rows one hour of right ascension takes here.',
      run: ({ controller }) => controller.goTo(GALACTIC_CENTER_INDEX),
    },
    {
      feature: 'Search',
      label: 'Naked-eye stars',
      hint: 'About 9,000 stars are brighter than magnitude 6. Matches are plotted on the map.',
      run: ({ search }) => search('mag < 6'),
    },
    {
      feature: 'Search',
      label: 'Hottest O-type stars',
      hint: 'Rare, blue, and luminous. Search also takes distance < 100 or name = "Vega".',
      run: ({ search }) => search('class = "O"'),
    },
    {
      feature: 'Chapters',
      label: 'Next hour of sky',
      hint: 'Each chapter is one hour of right ascension, labeled with a constellation in that slice.',
      run: ({ controller }) => controller.nextChapter(),
    },
    {
      feature: 'Zoom',
      requiredView: 'zoom',
      label: 'The whole sky',
      hint: '1.8 billion stars at once. The overview reveals both crossings of the Milky Way.',
      run: ({ fit }) => fit(),
    },
  ],
  renderRow: ({ row }) => (
    <>
      <span role="gridcell" className="st-star">
        <i
          className="st-dot"
          data-type={row.type}
          style={
            { '--size': `${Math.max(5, Math.min(15, 14 - row.mag * 0.45))}px` } as CSSProperties
          }
        />
        {row.name ? <strong>{row.name}</strong> : designation(row)}
      </span>
      <span role="gridcell" className="st-ra">
        {formatRa(row.ra)}
      </span>
      <span role="gridcell" className="st-dec">
        {formatDec(row.dec)}
      </span>
      <span role="gridcell" className="st-mag">
        {row.mag.toFixed(2)}
        {row.mag < 6 && <b className="st-visible">visible</b>}
      </span>
      <span role="gridcell" className="st-class" data-type={row.type}>
        <b>{row.type}</b> {formatCount(row.temp)} K
      </span>
      <span role="gridcell" className="st-distance">
        <span className="st-distance-bar">
          <i style={{ width: `${Math.min(100, (Math.log10(row.ly) / 5) * 100)}%` }} />
        </span>
        {row.ly >= 1000 ? `${formatCount(Math.round(row.ly / 10) * 10)} ly` : `${row.ly} ly`}
      </span>
    </>
  ),
};

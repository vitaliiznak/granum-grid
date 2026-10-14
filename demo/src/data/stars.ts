import { clamp, gaussian, noise } from './noise';

/** Gaia-scale catalog size; rows are ordered by right ascension. */
export const STAR_COUNT = 1_811_709_771;
/** Every 200,000th row is a bright star, roughly 9,000 visible to the naked eye. */
export const BRIGHT_STRIDE = 200_000;

const circular = (h: number, center: number) => {
  const d = Math.abs(h - center) % 24;
  return Math.min(d, 24 - d);
};
const lobe = (h: number, center: number, width: number) =>
  Math.exp(-((circular(h, center) / width) ** 2));
/** Relative stars per hour of right ascension: the Milky Way crosses twice. */
function skyDensity(hours: number) {
  return (
    0.32 +
    1.25 * lobe(hours, 17.76, 1.25) +
    0.55 * lobe(hours, 18.9, 2.4) +
    0.42 * lobe(hours, 6.9, 2.1) +
    0.3 * lobe(hours, 20.6, 1.1) +
    0.18 * lobe(hours, 5.6, 1) +
    0.03 * Math.sin(hours * 2.7)
  );
}
const CELLS = 4096;
const cdf = new Float64Array(CELLS + 1);
for (let k = 0; k < CELLS; k++) cdf[k + 1] = cdf[k] + skyDensity(((k + 0.5) * 24) / CELLS);
const integral = cdf[CELLS];
for (let k = 0; k <= CELLS; k++) cdf[k] /= integral;
const mean = integral / CELLS;
/** Millions of stars per minute of right ascension; the mean is STAR_COUNT / 1440. */
const perMinute = (hours: number) => (skyDensity(hours) / mean) * (STAR_COUNT / 1440 / 1e6);
export const densityAt = (index: number) => Math.round(perMinute(raAt(index)) * 100) / 100;

export function raAt(index: number) {
  const u = (index + 0.5) / STAR_COUNT;
  let low = 0,
    high = CELLS - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (cdf[middle] <= u) low = middle;
    else high = middle - 1;
  }
  return ((low + (u - cdf[low]) / (cdf[low + 1] - cdf[low])) * 24) / CELLS;
}
export function indexAtRa(hours: number) {
  const cell = clamp((hours / 24) * CELLS, 0, CELLS - 1e-9);
  const k = Math.floor(cell);
  const u = cdf[k] + (cell - k) * (cdf[k + 1] - cdf[k]);
  return clamp(Math.round(u * STAR_COUNT - 0.5), 0, STAR_COUNT - 1);
}
/** Declination of the galactic equator at a right ascension. */
export function planeDec(hours: number) {
  const ra = (hours * 15 * Math.PI) / 180;
  return (
    (Math.atan(Math.tan((62.87 * Math.PI) / 180) * Math.sin(ra - (282.86 * Math.PI) / 180)) * 180) /
    Math.PI
  );
}
export const diskShareAt = (index: number) => clamp(1 - 0.32 / skyDensity(raAt(index)), 0, 1) * 100;

const ra = (h: number, m: number, s: number) => h + m / 60 + s / 3600;
const dec = (d: number, m: number, s = 0) => Math.sign(d || 1) * (Math.abs(d) + m / 60 + s / 3600);
export const NAMED_STARS = [
  {
    name: 'Polaris',
    ra: ra(2, 31, 49),
    dec: dec(89, 16),
    mag: 1.98,
    type: 'F',
    temp: 6_000,
    ly: 433,
  },
  {
    name: 'Aldebaran',
    ra: ra(4, 35, 55),
    dec: dec(16, 31),
    mag: 0.86,
    type: 'K',
    temp: 3_900,
    ly: 65,
  },
  {
    name: 'Rigel',
    ra: ra(5, 14, 32),
    dec: dec(-8, 12),
    mag: 0.13,
    type: 'B',
    temp: 12_100,
    ly: 860,
  },
  {
    name: 'Betelgeuse',
    ra: ra(5, 55, 10),
    dec: dec(7, 24),
    mag: 0.5,
    type: 'M',
    temp: 3_600,
    ly: 550,
  },
  {
    name: 'Sirius',
    ra: ra(6, 45, 9),
    dec: dec(-16, 43),
    mag: -1.46,
    type: 'A',
    temp: 9_940,
    ly: 8.6,
  },
  {
    name: 'Procyon',
    ra: ra(7, 39, 18),
    dec: dec(5, 13),
    mag: 0.34,
    type: 'F',
    temp: 6_530,
    ly: 11.5,
  },
  {
    name: 'Regulus',
    ra: ra(10, 8, 22),
    dec: dec(11, 58),
    mag: 1.35,
    type: 'B',
    temp: 12_460,
    ly: 79,
  },
  {
    name: 'Spica',
    ra: ra(13, 25, 12),
    dec: dec(-11, 10),
    mag: 0.97,
    type: 'B',
    temp: 22_400,
    ly: 250,
  },
  {
    name: 'Arcturus',
    ra: ra(14, 15, 40),
    dec: dec(19, 11),
    mag: -0.05,
    type: 'K',
    temp: 4_290,
    ly: 36.7,
  },
  {
    name: 'Antares',
    ra: ra(16, 29, 24),
    dec: dec(-26, 26),
    mag: 1.06,
    type: 'M',
    temp: 3_400,
    ly: 550,
  },
  { name: 'Vega', ra: ra(18, 36, 56), dec: dec(38, 47), mag: 0.03, type: 'A', temp: 9_600, ly: 25 },
  {
    name: 'Deneb',
    ra: ra(20, 41, 26),
    dec: dec(45, 17),
    mag: 1.25,
    type: 'A',
    temp: 8_500,
    ly: 2_600,
  },
  {
    name: 'Fomalhaut',
    ra: ra(22, 57, 39),
    dec: dec(-29, 37),
    mag: 1.16,
    type: 'A',
    temp: 8_590,
    ly: 25,
  },
].map((star) => ({ ...star, index: indexAtRa(star.ra) }));
export const SIRIUS = NAMED_STARS.find((star) => star.name === 'Sirius')!;
export const GALACTIC_CENTER_INDEX = indexAtRa(ra(17, 45, 40));

export const CONSTELLATIONS = [
  'Andromeda',
  'Pisces',
  'Aries',
  'Perseus',
  'Taurus',
  'Orion',
  'Gemini',
  'Canis Minor',
  'Cancer',
  'Hydra',
  'Leo',
  'Ursa Major',
  'Virgo',
  'Virgo',
  'Boötes',
  'Libra',
  'Scorpius',
  'Ophiuchus',
  'Sagittarius',
  'Aquila',
  'Cygnus',
  'Capricornus',
  'Aquarius',
  'Pegasus',
];
const CLASSES = [
  { type: 'O', share: 0.0003, temp: [30_000, 45_000], absolute: -4.5 },
  { type: 'B', share: 0.012, temp: [10_000, 30_000], absolute: -1.2 },
  { type: 'A', share: 0.05, temp: [7_500, 10_000], absolute: 1.4 },
  { type: 'F', share: 0.11, temp: [6_000, 7_500], absolute: 3 },
  { type: 'G', share: 0.17, temp: [5_200, 6_000], absolute: 4.6 },
  { type: 'K', share: 0.3, temp: [3_700, 5_200], absolute: 6.2 },
  { type: 'M', share: 1, temp: [2_400, 3_700], absolute: 9.8 },
] as const;
const BRIGHT_CLASSES = [
  { type: 'B', share: 0.2, temp: [10_000, 30_000], absolute: -1.5 },
  { type: 'A', share: 0.45, temp: [7_500, 10_000], absolute: 0.8 },
  { type: 'F', share: 0.6, temp: [6_000, 7_500], absolute: 2.2 },
  { type: 'G', share: 0.72, temp: [5_200, 6_000], absolute: 1 },
  { type: 'K', share: 0.95, temp: [3_700, 5_200], absolute: 0.6 },
  { type: 'M', share: 1, temp: [2_400, 3_700], absolute: -0.4 },
] as const;

export interface Star {
  name: string | null;
  ra: number;
  dec: number;
  mag: number;
  type: string;
  temp: number;
  ly: number;
}
export function starAt(index: number): Star {
  const named = NAMED_STARS.find((s) => s.index === index);
  if (named) return named;
  const hours = raAt(index);
  const disk = noise(index, 1) * 100 < diskShareAt(index);
  const declination = disk
    ? clamp(planeDec(hours) + gaussian(index, 2) * 7, -89.9, 89.9)
    : (Math.asin(noise(index, 3) * 2 - 1) * 180) / Math.PI;
  const bright = index % BRIGHT_STRIDE === 7;
  const roll = noise(index, 4);
  const table = bright ? BRIGHT_CLASSES : CLASSES;
  let total = 0;
  const spectral =
    table.find((c) => {
      total = bright ? c.share : total + c.share;
      return roll < total;
    }) ?? table[table.length - 1];
  const mag = bright
    ? 1.6 + noise(index, 5) * 4.4
    : Math.max(6.5 + noise(index, 6) * 2, 21 + Math.log10(Math.max(1e-12, noise(index, 5))) / 0.35);
  const parsecs = 10 ** ((mag - (spectral.absolute + gaussian(index, 7) * 0.6) + 5) / 5);
  return {
    name: null,
    ra: hours,
    dec: declination,
    mag: Math.round(mag * 100) / 100,
    type: spectral.type,
    temp:
      Math.round(
        (spectral.temp[0] + noise(index, 8) * (spectral.temp[1] - spectral.temp[0])) / 10,
      ) * 10,
    ly: Math.round(clamp(parsecs * 3.2616, 4.2, 98_000) * 10) / 10,
  };
}

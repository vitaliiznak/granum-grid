import { bump, clamp, noise } from './noise';

/** Name, GRCh38 length, approximate centromere (Mb), typical GC %. */
const TABLE = [
  ['1', 248_956_422, 123.4, 41.7],
  ['2', 242_193_529, 93.9, 40.2],
  ['3', 198_295_559, 90.9, 39.7],
  ['4', 190_214_555, 50.0, 38.2],
  ['5', 181_538_259, 48.8, 39.5],
  ['6', 170_805_979, 59.8, 39.6],
  ['7', 159_345_973, 60.1, 40.7],
  ['8', 145_138_636, 45.2, 40.1],
  ['9', 138_394_717, 43.0, 41.3],
  ['10', 133_797_422, 39.8, 41.6],
  ['11', 135_086_622, 53.4, 41.6],
  ['12', 133_275_309, 35.5, 40.8],
  ['13', 114_364_328, 17.7, 38.5],
  ['14', 107_043_718, 17.2, 40.9],
  ['15', 101_991_189, 19.0, 42.2],
  ['16', 90_338_345, 36.8, 44.8],
  ['17', 83_257_441, 25.1, 45.5],
  ['18', 80_373_285, 18.5, 39.8],
  ['19', 58_617_616, 26.2, 48.4],
  ['20', 64_444_167, 28.1, 44.1],
  ['21', 46_709_983, 12.0, 40.9],
  ['22', 50_818_468, 15.0, 48.0],
  ['X', 156_040_895, 60.6, 39.5],
  ['Y', 57_227_415, 10.4, 39.0],
] as const;
let offset = 0;
export const CHROMOSOMES = TABLE.map(([name, length, centromere, gc]) => {
  const chromosome = { name, length, start: offset, centromere: centromere * 1e6, gc };
  offset += length;
  return chromosome;
});
export const GENOME_LENGTH = offset;

/** Well-known genes at approximate GRCh38 starts. Everything between them is synthetic. */
export const GENES = [
  { name: 'TP53', chr: '17', start: 7_668_402, length: 19_070, note: 'Tumor suppressor p53' },
  { name: 'BRCA1', chr: '17', start: 43_044_295, length: 81_189, note: 'DNA repair' },
  { name: 'BRCA2', chr: '13', start: 32_315_474, length: 84_193, note: 'DNA repair' },
  { name: 'CFTR', chr: '7', start: 117_480_025, length: 188_703, note: 'Chloride channel' },
  { name: 'EGFR', chr: '7', start: 55_019_017, length: 188_307, note: 'Growth factor receptor' },
  { name: 'FOXP2', chr: '7', start: 114_086_327, length: 607_048, note: 'Speech and language' },
  { name: 'HBB', chr: '11', start: 5_225_464, length: 1_608, note: 'Hemoglobin beta' },
  { name: 'INS', chr: '11', start: 2_159_779, length: 1_431, note: 'Insulin' },
  { name: 'APOE', chr: '19', start: 44_905_796, length: 3_612, note: 'Lipid transport' },
  { name: 'HTT', chr: '4', start: 3_074_681, length: 169_280, note: 'Huntingtin' },
  { name: 'DMD', chr: 'X', start: 31_097_677, length: 2_241_764, note: 'Largest human gene' },
  { name: 'MYC', chr: '8', start: 127_735_434, length: 7_556, note: 'Transcription factor' },
  { name: 'KRAS', chr: '12', start: 25_205_246, length: 45_684, note: 'GTPase signaling' },
  { name: 'LCT', chr: '2', start: 135_787_850, length: 49_336, note: 'Lactase' },
  { name: 'SRY', chr: 'Y', start: 2_786_855, length: 897, note: 'Sex-determining region' },
].map((gene) => {
  const chromosome = CHROMOSOMES.find((c) => c.name === gene.chr)!;
  return { ...gene, index: chromosome.start + gene.start - 1 };
});

export function locate(index: number) {
  let low = 0,
    high = CHROMOSOMES.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (CHROMOSOMES[middle].start <= index) low = middle;
    else high = middle - 1;
  }
  const chromosome = CHROMOSOMES[low];
  return { chromosome, position: index - chromosome.start + 1 };
}
const EXON_PERIOD = 7_919,
  EXON_LENGTH = 180;
export function regionAt(index: number) {
  const { chromosome, position } = locate(index);
  const gap = Math.min(3e6, chromosome.length * 0.02);
  if (Math.abs(position - chromosome.centromere) < gap / 2)
    return { kind: 'gap', label: 'Centromere' } as const;
  if (position <= 10_000 || position > chromosome.length - 10_000)
    return { kind: 'gap', label: 'Telomere' } as const;
  const gene = GENES.find((g) => index >= g.index && index < g.index + g.length);
  if (gene) {
    const offset = index - gene.index;
    return offset % EXON_PERIOD < EXON_LENGTH
      ? ({
          kind: 'exon',
          label: `${gene.name} exon ${Math.floor(offset / EXON_PERIOD) + 1}`,
          gene,
        } as const)
      : ({ kind: 'intron', label: `${gene.name} intron`, gene } as const);
  }
  const repeat = noise(Math.floor(position / 300) + chromosome.start, 7);
  return repeat < 0.11
    ? ({ kind: 'repeat', label: 'Alu repeat' } as const)
    : repeat < 0.28
      ? ({ kind: 'repeat', label: 'LINE-1 repeat' } as const)
      : repeat < 0.33
        ? ({ kind: 'repeat', label: 'LTR element' } as const)
        : ({ kind: 'intergenic', label: 'Intergenic' } as const);
}
/** Smooth local GC percentage; null inside assembly gaps. */
export function gcAt(index: number): number | null {
  const { chromosome, position } = locate(index);
  const gap = Math.min(3e6, chromosome.length * 0.02);
  if (
    Math.abs(position - chromosome.centromere) < gap / 2 ||
    position <= 10_000 ||
    position > chromosome.length - 10_000
  )
    return null;
  const mb = position / 1e6,
    seed = chromosome.start / 1e8;
  const isochores =
    4.2 * Math.sin(mb * 0.21 + seed) +
    2.4 * Math.sin(mb * 0.83 + seed * 2.3) +
    1.1 * Math.sin(mb * 3.7 + seed * 5.1);
  const genes = GENES.reduce(
    (sum, g) => sum + 7 * bump(index, g.index + g.length / 2, Math.max(g.length, 400_000)),
    0,
  );
  return Math.round(clamp(chromosome.gc + isochores + genes, 30, 64) * 10) / 10;
}
export type Base = 'A' | 'C' | 'G' | 'T' | 'N';
export function baseAt(index: number): Base {
  if (index < 0 || index >= GENOME_LENGTH) return 'N';
  const gc = gcAt(index);
  if (gc === null) return 'N';
  const pair = noise(index, 2) < 0.5;
  return noise(index, 1) * 100 < gc ? (pair ? 'G' : 'C') : pair ? 'A' : 'T';
}
export function geneDensityAt(index: number) {
  const { chromosome } = locate(index);
  const densities: Partial<Record<typeof chromosome.name, number>> = {
    '19': 0.9,
    '17': 0.75,
    '22': 0.7,
    '16': 0.6,
    '1': 0.55,
    '11': 0.55,
  };
  const base = densities[chromosome.name];
  return clamp((base ?? 0.35) + 0.25 * Math.sin(index / 7.3e6), 0, 1) * 100;
}
export function repeatShareAt(index: number) {
  const gc = gcAt(index);
  return gc === null ? null : clamp(72 - gc * 0.55 + 6 * Math.sin(index / 4.1e6), 20, 70);
}
export interface Locus {
  chromosome: string;
  position: number;
  base: Base;
  gc: number | null;
  region: ReturnType<typeof regionAt>;
}
export function locusAt(index: number): Locus {
  const { chromosome, position } = locate(index);
  return {
    chromosome: chromosome.name,
    position,
    base: baseAt(index),
    gc: gcAt(index),
    region: regionAt(index),
  };
}

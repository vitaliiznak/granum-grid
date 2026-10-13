import {
  CHROMOSOMES,
  GENES,
  GENOME_LENGTH,
  baseAt,
  gcAt,
  locusAt,
  regionAt,
  type Locus,
} from '../data/genome';
import { syntheticProvider } from '../data/synthetic';
import { GenomeIcon } from './icons';
import { formatCount, type DemoDataset } from './types';

const where = (index: number) => {
  const locus = locusAt(index);
  return `chr${locus.chromosome}:${formatCount(locus.position)}`;
};
const provider = syntheticProvider<Locus>({
  id: 'genome',
  metric: { label: 'GC content', unit: '%', kind: 'value', domain: [30, 60] },
  rowAt: locusAt,
  markers: GENES.map((gene) => ({
    id: `gene-${gene.name}`,
    index: gene.index,
    label: gene.name,
    kind: 'event',
  })),
  chapters: CHROMOSOMES.map((c) => ({
    id: `chr${c.name}`,
    start: c.start,
    end: c.start + c.length,
    label: `chr${c.name}`,
    breadcrumb: ['Genome', `Chromosome ${c.name}`],
  })),
  search: {
    examples: 'gc > 55, gene = "TP53", or chr = "X"',
    fields: {
      gc: { kind: 'number', read: (i) => gcAt(i) ?? Number.NaN },
      base: { kind: 'text', read: baseAt },
      region: { kind: 'text', read: (i) => regionAt(i).kind },
      gene: { kind: 'text', read: (i) => ('gene' in regionAt(i) ? regionAt(i).gene!.name : '') },
      chr: { kind: 'text', read: (i) => locusAt(i).chromosome },
    },
    lookup(query) {
      if (query.operator !== '=') return null;
      const value = String(query.value).toUpperCase().replace(/^CHR/, '');
      if (query.field === 'gene') {
        const gene = GENES.find((g) => g.name === value);
        return gene
          ? [
              {
                id: `gene-${gene.name}`,
                index: gene.index,
                label: `${gene.name} · ${where(gene.index)}`,
                kind: 'search',
              },
            ]
          : [];
      }
      if (query.field === 'chr') {
        const chromosome = CHROMOSOMES.find((c) => c.name === value);
        return chromosome
          ? [
              {
                id: `chr-${value}`,
                index: chromosome.start,
                label: `chr${chromosome.name} start`,
                kind: 'search',
              },
            ]
          : [];
      }
      return null;
    },
    label: (index, field, value) =>
      `${field} ${typeof value === 'number' ? `${value}%` : value} · ${where(index)}`,
  },
});

const brca1 = GENES.find((g) => g.name === 'BRCA1')!;
const CONTEXT = 10;
function Sequence({ index }: { index: number }) {
  const bases = [];
  for (let offset = -CONTEXT; offset <= CONTEXT; offset++) {
    const base = baseAt(index + offset);
    bases.push(
      <i key={offset} data-base={base} className={offset === 0 ? 'center' : undefined}>
        {base}
      </i>,
    );
  }
  return <>{bases}</>;
}
export const genome: DemoDataset<Locus> = {
  id: 'genome',
  name: 'Human genome',
  unit: 'bases',
  title: 'Human-scale genome',
  description:
    'One row per base pair: 24 chromosomes at GRCh38 lengths, with well-known genes at their approximate positions. The sequence itself is synthetic.',
  facts: [
    `${formatCount(GENOME_LENGTH)} bases`,
    '24 chromosomes',
    `${GENES.length} landmark genes`,
  ],
  icon: <GenomeIcon />,
  provider,
  ariaLabel: 'Synthetic genome bases',
  rowHeight: 40,
  initialIndex: 10_000,
  bytesPerRow: 64,
  help: 'Every row is one base. Use the map to jump to a chromosome or gene.',
  atlas: { axisLabel: 'Chr', formatValue: (v) => `${v.toFixed(0)}%` },
  map: {
    chapters: 'Chromosomes',
    profile: 'GC content + genes',
    tracks: 'Show genome tracks',
    explain:
      'Down follows the genome from chr1 to chrY. Right means more G and C bases. Breaks are centromeres.',
    sampling: 'Each map group samples 64 positions of a smooth synthetic GC model.',
  },
  header: (
    <>
      <span className="gx-col-locus">Locus</span>
      <span className="gx-col-base">Base</span>
      <span className="gx-col-seq">Sequence context ±10</span>
      <span className="gx-col-region">Region</span>
      <span className="gx-col-gc">GC · 1 kb</span>
    </>
  ),
  tour: [
    {
      feature: 'Flight',
      label: 'Fly to BRCA1',
      hint: 'A jump of 2.5 billion rows. The flight passes through the overview so the distance stays legible.',
      run: ({ controller }) => controller.goTo(brca1.index),
    },
    {
      feature: 'Markers',
      label: 'Next gene',
      hint: 'Genes are markers: magnetic on the map, and N / P step between them from the keyboard.',
      run: ({ controller }) => controller.nextMarker(),
    },
    {
      feature: 'Search',
      label: 'Find GC-rich DNA',
      hint: 'Predicate search runs on the provider. Try gene = "TP53" or chr = "X" too.',
      run: ({ search }) => search('gc > 52'),
    },
    {
      feature: 'Chapters',
      label: 'Next chromosome',
      hint: 'Chromosomes are chapters. Ctrl/⌘ + ↓ steps forward; the sticky header names the current one.',
      run: ({ controller }) => controller.nextChapter(),
    },
    {
      feature: 'Lens',
      label: 'Focus + context',
      hint: 'Bases near the focus stay readable while the surrounding megabases compress.',
      run: ({ controller }) => controller.setView('lens'),
    },
    {
      feature: 'Zoom',
      label: 'Whole genome at once',
      hint: 'Overview zoom shows 3 billion bases in one view. Ctrl + wheel or pinch to dive back in.',
      run: ({ fit }) => fit(),
    },
  ],
  renderRow: ({ row, index }) => {
    const region = row.region;
    return (
      <>
        <span role="gridcell" className="gx-locus">
          <b>chr{row.chromosome}</b>
          {formatCount(row.position)}
        </span>
        <span role="gridcell" className="gx-base" data-base={row.base}>
          {row.base}
        </span>
        <span role="gridcell" className="gx-seq" aria-label="Neighboring bases">
          <Sequence index={index} />
        </span>
        <span role="gridcell" className="gx-region" data-kind={region.kind}>
          {region.label}
        </span>
        <span role="gridcell" className="gx-gc">
          {row.gc === null ? (
            <span className="gx-gap">gap</span>
          ) : (
            <>
              <span className="gx-gc-bar">
                <i style={{ width: `${((row.gc - 30) / 30) * 100}%` }} />
              </span>
              {row.gc.toFixed(1)}%
            </>
          )}
        </span>
      </>
    );
  },
};

import type { DataProvider } from '@granum/react';
import {
  createParquetProvider,
  estimateParquetRowBytes,
  type ParquetColumn,
  type ParquetFile,
  type ParquetFileFacts,
  type ParquetRow,
  type ParquetTransfer,
  type ParquetValue,
} from '@granum/parquet';
import { ParquetIcon } from './icons';
import { compact, formatCount, type DemoDataset } from './types';

/**
 * One shard of Hugging Face FineWeb (CC-MAIN-2024-10, `000_00000.parquet`), pinned to a
 * commit so its rows never change. The ETag is the file's content hash.
 */
export const FINEWEB: ParquetFileFacts = {
  url: 'https://huggingface.co/datasets/HuggingFaceFW/fineweb/resolve/9bb295ddab0e05d785b879661af7260fed5140fc/data/CC-MAIN-2024-10/000_00000.parquet',
  byteLength: 2_152_984_890,
  revision: '"ace297bc7959fa4308bfe30f5812a16729eb3e5a1e8f77821c4df7d21ca70c48"',
  rowCount: 973_991,
};
const FINEWEB_ROW_GROUPS = 974;

/** zstd and the other codecs beyond Snappy, loaded with the first row group that needs them. */
const compressors = () => import('hyparquet-compressors').then((module) => module.compressors);

/** Downloads spent on the open file, footer included, for the panel's running total. */
export interface TransferMeter {
  get(): ParquetTransfer;
  subscribe(listener: () => void): () => void;
}
function transferMeter(footer: ParquetTransfer = { requests: 0, bytes: 0 }) {
  let value = footer;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(rows: ParquetTransfer) {
      value = { requests: footer.requests + rows.requests, bytes: footer.bytes + rows.bytes };
      for (const listener of listeners) listener();
    },
  };
}

/** What the Parquet panel shows about the open file. */
export interface ParquetDetails {
  url: string;
  byteLength: number;
  rowGroups: number;
  meter: TransferMeter;
  /** The bundled file rather than one the reader opened. */
  bundled: boolean;
}
const details = new WeakMap<DataProvider<unknown>, ParquetDetails>();
export const parquetDetails = (provider: DataProvider<unknown>) => details.get(provider);

const bytes = (value: number) =>
  value >= 1e9
    ? `${(value / 1e9).toFixed(2)} GB`
    : value >= 1e6
      ? `${(value / 1e6).toFixed(1)} MB`
      : `${Math.ceil(value / 1e3)} KB`;
export const formatBytes = bytes;

/** One line of a value, short enough for a cell. */
function cellText(value: ParquetValue): string {
  if (value === null) return '—';
  if (typeof value === 'number')
    return Number.isInteger(value) ? formatCount(value) : String(Number(value.toPrecision(6)));
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim().slice(0, 240);
  if (typeof value === 'boolean') return String(value);
  return JSON.stringify(value).slice(0, 240);
}
/** A value in full, capped so one row cannot fill the page. */
function detailText(value: ParquetValue) {
  const text =
    typeof value === 'string' ? value : value === null ? '—' : JSON.stringify(value, null, 2);
  return text.length > 20_000
    ? `${text.slice(0, 20_000)}\n… ${formatCount(text.length - 20_000)} more characters`
    : text;
}

/** Header, row, and detail rendering for rows of named columns, shared by Parquet and SQL. */
export function columnRows(columns: readonly ParquetColumn[], shown: readonly string[]) {
  const types = new Map(columns.map((column) => [column.name, column]));
  return {
    header: (
      <>
        <span className="pq-col-row">Row</span>
        {shown.map((name) => (
          <span
            key={name}
            className="pq-cell"
            title={types.get(name)?.type}
            data-number={types.get(name)?.numeric || undefined}
          >
            {name}
          </span>
        ))}
      </>
    ),
    renderRow: ({ row, rowNumber }: { row: ParquetRow; rowNumber: number }) => (
      <>
        <span role="gridcell" className="pq-col-row">
          {formatCount(rowNumber)}
        </span>
        {shown.map((name) => (
          <span
            key={name}
            role="gridcell"
            className="pq-cell"
            data-number={typeof row[name] === 'number' || undefined}
          >
            {cellText(row[name])}
          </span>
        ))}
      </>
    ),
    renderDetails: (row: ParquetRow) => (
      <dl className="pq-details">
        {columns.map((column) => (
          <div key={column.name}>
            <dt>
              {column.name} <span>{column.type}</span>
            </dt>
            <dd>{detailText(row[column.name] ?? null)}</dd>
          </div>
        ))}
      </dl>
    ),
  };
}

const map = (metric: string | undefined): DemoDataset['map'] => ({
  chapters: 'Chapters',
  profile: metric ?? 'Overview',
  tracks: 'Show extra tracks',
  explain: metric
    ? `Down follows rows in file order. Right means a larger ${metric}: the band spans each row group’s smallest and largest value, the line is a mean.`
    : 'Down follows rows in file order. This file has no plain number column, so the map is a scrollbar.',
  sampling: metric
    ? 'The band comes from row-group statistics in the footer and is exact where the file has them. The line reads one row group per map group, so it is marked sampled.'
    : 'No summary is read.',
});

/** Tour steps that only need a row count. */
const tour = (rowCount: number): DemoDataset['tour'] => [
  {
    feature: 'Search',
    label: 'Type a percentage',
    hint: 'Go to accepts a row number or a share of the file, such as 75%.',
    run: (api) => api.openSearch('75%'),
  },
  {
    feature: 'Jump',
    label: 'Jump to the last row',
    hint: 'The last row group is as cheap to read as the first.',
    run: (api) => api.goTo(Math.max(0, rowCount - 1)),
  },
];

const finewebColumns: ParquetColumn[] = [
  { name: 'text', type: 'BYTE_ARRAY · STRING', numeric: false },
  { name: 'id', type: 'BYTE_ARRAY · STRING', numeric: false },
  { name: 'dump', type: 'BYTE_ARRAY · STRING', numeric: false },
  { name: 'url', type: 'BYTE_ARRAY · STRING', numeric: false },
  { name: 'date', type: 'BYTE_ARRAY · STRING', numeric: false },
  { name: 'file_path', type: 'BYTE_ARRAY · STRING', numeric: false },
  { name: 'language', type: 'BYTE_ARRAY · STRING', numeric: false },
  { name: 'language_score', type: 'DOUBLE', numeric: true },
  { name: 'token_count', type: 'INT64', numeric: true },
];

function fineweb(): DemoDataset<ParquetRow> {
  const meter = transferMeter();
  const provider = createParquetProvider(FINEWEB, {
    metricColumn: 'token_count',
    // A few pages run to tens of thousands of tokens; the typical page is under 2,000.
    domain: [0, 2000],
    onTransfer: meter.update,
    compressors,
  });
  details.set(provider, {
    url: FINEWEB.url,
    byteLength: FINEWEB.byteLength,
    rowGroups: FINEWEB_ROW_GROUPS,
    meter,
    bundled: true,
  });
  const middle = Math.floor(FINEWEB.rowCount / 2);
  return {
    id: 'parquet',
    name: 'Web pages (Parquet)',
    unit: 'pages',
    title: 'A 2 GB Parquet file, read in place',
    description:
      'English web pages from Common Crawl, in one 2.15 GB file of Hugging Face’s FineWeb dataset. The page reads the file’s footer, then downloads only the row group that holds the rows you look at, about 2 MB, with HTTP range requests. There is no server of our own. Paste your own Parquet URL below.',
    facts: [`${FINEWEB_ROW_GROUPS} row groups`, '2.15 GB file', 'ODC-By 1.0'],
    icon: <ParquetIcon />,
    origin: 'real',
    provider,
    cache: { estimateRowBytes: estimateParquetRowBytes },
    ariaLabel: 'Parquet rows',
    rowHeight: 36,
    bytesPerRow: FINEWEB.byteLength / FINEWEB.rowCount,
    sourceLabel: 'Hugging Face',
    sourceNote:
      'FineWeb (HuggingFaceFW/fineweb, CC-MAIN-2024-10, file 000_00000) is released under ODC-By 1.0 and subject to Common Crawl’s terms of use. Your browser reads the file directly from Hugging Face; nothing is generated.',
    task: {
      title: 'Jump to the middle of a 2 GB file and see how little it downloads.',
      action: `Go to row ${formatCount(middle + 1)}`,
      run: (api) => api.goTo(middle),
    },
    atlas: {
      axisLabel: 'Row',
      formatValue: (v) => compact(v),
      preview: 'summary',
      showRange: false,
    },
    map: {
      ...map('token_count'),
      explain:
        'Down follows rows in file order. Right means longer pages: the line is the mean token count of one row group per map group, on a 0–2,000 scale. Hover shows each group’s exact shortest and longest page.',
    },
    inspectorClassName: 'row-inspector-reading',
    copyLabel: 'Row as JSON',
    tour: [
      {
        feature: 'Address',
        label: 'Go to row 900,000',
        hint: 'The footer says which row group holds every row, so any row is one range request away.',
        run: (api) => api.goTo(899_999),
      },
      ...tour(FINEWEB.rowCount),
    ],
    ...columnRows(finewebColumns, ['date', 'url', 'token_count', 'language_score', 'text']),
  };
}
export const parquet = fineweb();

/** What a jump downloads, from the footer: pages with a page index, else a row group. */
function jumpCost(file: ParquetFile) {
  if (file.pageIndex) return 'each jump downloads only the pages that hold the rows in view.';
  const largest = bytes(file.largestRowGroupBytes);
  return file.largestRowGroupBytes > 64 * 1024 * 1024
    ? `the file has no page index, so a jump can download a whole row group, up to ${largest}. Rewriting it with smaller row groups or a page index makes jumps cheaper.`
    : `each jump downloads the row group that holds the rows in view, at most ${largest}.`;
}

/** A dataset for a file the reader opened; `footer` is what reading its footer cost. */
export function parquetDataset(
  file: ParquetFile,
  footer: ParquetTransfer,
): DemoDataset<ParquetRow> {
  const meter = transferMeter(footer);
  const provider = createParquetProvider(file, { onTransfer: meter.update, compressors });
  details.set(provider, {
    url: file.url,
    byteLength: file.byteLength,
    rowGroups: file.rowGroups,
    meter,
    bundled: false,
  });
  const name = decodeURIComponent(new URL(file.url).pathname.split('/').pop() || file.url);
  return {
    ...parquet,
    name: 'Your Parquet file',
    unit: 'rows',
    title: name,
    description: `${formatCount(file.rowCount)} rows in ${formatCount(file.rowGroups)} row groups, ${bytes(file.byteLength)}. The footer took ${bytes(footer.bytes)} and ${Math.round(file.footerMs)} ms; ${jumpCost(file)}`,
    facts: [
      `${formatCount(file.columns.length)} columns`,
      `${formatCount(file.rowGroups)} row groups`,
      bytes(file.byteLength),
    ],
    provider,
    rowHeight: 36,
    bytesPerRow: file.rowCount ? file.byteLength / file.rowCount : 0,
    sourceLabel: new URL(file.url).host,
    sourceNote: `Read directly from ${file.url}. Nothing is uploaded or stored; reloading the page opens the file again.`,
    task: {
      title: 'Jump anywhere in your file.',
      action: 'Go to the middle',
      run: (api) => api.goTo(Math.floor(file.rowCount / 2)),
    },
    atlas: { ...parquet.atlas, showRange: true },
    map: map(provider.metric?.label),
    tour: tour(file.rowCount),
    ...columnRows(
      file.columns,
      file.columns.slice(0, 6).map((column) => column.name),
    ),
  };
}

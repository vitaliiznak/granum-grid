# @granum/parquet

A Parquet file read in place over HTTP range requests, as a
[Granum Grid](https://github.com/vitaliiznak/granum-grid) data provider. There is no
server of your own: the page reads the file's footer once, which lists every row group's
row count, so the row count is exact and any row address maps to one row group. A jump
downloads only that group's column chunks, or, when the file has a page index, only the
pages that hold the rows.

The [playground](https://vitaliiznak.github.io/granum-grid/) opens a 2.15 GB FineWeb file
this way and downloads about 2 MB per jump.

## Install

Not yet on npm. `granum-grid` and [hyparquet](https://github.com/hyparam/hyparquet) 1.31.2
or later are peer dependencies. hyparquet decodes uncompressed and Snappy pages; for zstd,
gzip, Brotli, or LZ4, also install `hyparquet-compressors`.

## Use

```tsx
import { GranumGrid } from 'granum-grid';
import { createParquetProvider, openParquetFile, type ParquetRow } from '@granum/parquet';

// Reads only the footer: row count, row groups, and columns.
const { file } = await openParquetFile(url, new AbortController().signal);

const provider = createParquetProvider(file, {
  metricColumn: 'token_count', // the map's numeric column; default: the first one
  // Loaded with the first row group that needs them.
  compressors: () => import('hyparquet-compressors').then((m) => m.compressors),
});

<GranumGrid
  provider={provider}
  ariaLabel="Rows"
  renderRow={({ row }: { row: ParquetRow }) => <span role="gridcell">{String(row.url)}</span>}
/>;
```

To avoid reading the footer before the first render, pass known facts (`url`, `byteLength`,
`revision`, `rowCount`) instead of an opened file. The provider then reads the footer on
first use and rejects a file whose row count no longer matches.

## What it reads, and what it costs

- **Rows**: `fetchRows(start, count)` reads the row groups that hold those rows. With a
  page index (`file.pageIndex`) it reads only the needed pages. Without one, a jump can
  download a whole row group; `file.largestRowGroupBytes` says how much, so a host can
  warn before opening a file written with very large groups.
- **The map**: the band is each row group's exact min–max of the metric column, from
  the footer's statistics. The line is the mean of one row group read per bucket, at most
  24 groups and 8 MB, so the overview is labeled sampled rather than exact.
- **Search**: none. Searching text would read the whole file.
- **Transfer**: `provider.transfer` and `onTransfer` count requests and bytes, footer
  included. Concurrent reads of the same byte range share one request, which is aborted
  only when every reader has gone. Completed ranges stay in a 48 MB cache.

## Server requirements

The server must answer `Range` requests with `206 Partial Content` and, for a page on
another origin, allow CORS for `Range` and expose `Content-Length` (and `ETag`, which
becomes the provider's revision). A server that ignores byte ranges is refused rather
than letting one row download the whole file. Redirects are followed once and their
target reused, which helps CDNs that sign each URL.

Values become JSON-safe: large integers and binary become text, dates ISO strings.
`estimateParquetRowBytes` sizes a row for the explorer's cache budget
(`cache={{ estimateRowBytes: estimateParquetRowBytes }}`).

## License

Apache-2.0

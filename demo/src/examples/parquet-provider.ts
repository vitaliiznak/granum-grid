import { createParquetProvider, openParquetFile } from '@granum/parquet';

/** A Parquet file on any server that answers byte ranges; there is no server of your own. */
export async function openRemoteParquet(url: string, signal: AbortSignal) {
  // Reads only the footer: the row count, the row groups, and the columns.
  const { file } = await openParquetFile(url, signal);
  return createParquetProvider(file, {
    metricColumn: 'token_count',
    // zstd and other codecs, loaded with the first row group that needs them.
    compressors: () => import('hyparquet-compressors').then((m) => m.compressors),
  });
}

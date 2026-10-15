import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compressors } from 'hyparquet-compressors';
import {
  createParquetProvider,
  estimateParquetRowBytes,
  openParquetFile,
} from '@granum-grid/parquet';

assert.match(import.meta.resolve('@granum-grid/parquet'), /\/dist\/index\.js$/);
assert.deepEqual(Object.keys(await import('@granum-grid/parquet')).sort(), [
  'createParquetProvider',
  'estimateParquetRowBytes',
  'openParquetFile',
]);
// @granum-grid/core is a type-only peer: the built JavaScript must not import it at runtime.
const dist = new URL('.', import.meta.resolve('@granum-grid/parquet'));
for (const name of readdirSync(dist).filter((file) => file.endsWith('.js')))
  assert.ok(!readFileSync(new URL(name, dist), 'utf8').includes('@granum-grid/core'), name);

// A range server for the fixture copied next to this script.
const bytes = new Uint8Array(readFileSync(new URL('./readings.parquet', import.meta.url)));
const request = async (_url, { signal, method, headers }) => {
  signal.throwIfAborted();
  if (method === 'HEAD')
    return new Response(null, { headers: { 'content-length': String(bytes.length), etag: '"1"' } });
  const [, first, last] = /^bytes=(\d+)-(\d+)$/.exec(headers.Range);
  return new Response(bytes.slice(Number(first), Number(last) + 1), { status: 206 });
};
const signal = new AbortController().signal;
const { file } = await openParquetFile('https://files.example/readings.parquet', signal, {
  request,
});
assert.equal(file.rowCount, 1000);
assert.equal(file.pageIndex, true);
const provider = createParquetProvider(file, { request, compressors, metricColumn: 'value' });
const rows = await provider.fetchRows(995, 5, signal);
assert.deepEqual(
  rows.map((row) => row.id),
  [995, 996, 997, 998, 999],
);
assert.ok(estimateParquetRowBytes(rows[0]) > 0);
assert.equal((await provider.fetchOverview(10, signal)).length, 10);
console.log(
  `@granum-grid/parquet: ${fileURLToPath(dist).split('node_modules/')[1]} reads rows and a map.`,
);

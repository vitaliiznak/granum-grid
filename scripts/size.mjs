import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

// Bytes a consumer downloads for each public entry: every export bundled from the built
// dist/, minified and gzipped, with peer dependencies (React, hyparquet) external. CSS is
// raw, as hosts usually ship it.
// Budgets ratchet down as the plan in docs/plans/library-family.md removes code; raise one
// only on purpose, with the reason in the commit.
const BUDGETS = {
  '@granum-grid/react': 25_800,
  '@granum-grid/react/headless': 12_300,
  '@granum-grid/core': 3_300,
  '@granum-grid/core/data': 4_100,
  '@granum-grid/core/dom': 10_900,
  '@granum-grid/core/map': 5_000,
  '@granum-grid/parquet': 3_500,
  '@granum-grid/sql': 4_200,
  'base.css': 15_900,
  'styles.css': 19_200,
};
const workspace = fileURLToPath(new URL('../', import.meta.url));
const built = (path) => `${workspace}packages/${path}`;
const scripts = {
  '@granum-grid/react': built('react/dist/index.js'),
  '@granum-grid/react/headless': built('react/dist/headless.js'),
  '@granum-grid/core': built('core/dist/index.js'),
  '@granum-grid/core/data': built('core/dist/data/index.js'),
  '@granum-grid/core/dom': built('core/dist/dom/index.js'),
  '@granum-grid/core/map': built('core/dist/map/index.js'),
  '@granum-grid/parquet': built('parquet/dist/index.js'),
  '@granum-grid/sql': built('sql/dist/index.js'),
};
const sizes = {};
for (const [entry, file] of Object.entries(scripts)) {
  const result = await build({
    stdin: { contents: `export * from ${JSON.stringify(file)};`, resolveDir: workspace },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'hyparquet'],
    write: false,
    logLevel: 'error',
  });
  sizes[entry] = gzipSync(result.outputFiles[0].contents, { level: 9 }).length;
}
for (const file of ['base.css', 'styles.css'])
  sizes[file] = readFileSync(built(`core/dist/${file}`)).length;

let over = false;
for (const [entry, size] of Object.entries(sizes)) {
  const budget = BUDGETS[entry];
  const fits = size <= budget;
  over ||= !fits;
  const kind = entry.endsWith('.css') ? 'raw' : 'min+gz';
  console.log(
    `${fits ? 'ok  ' : 'OVER'} ${entry.padEnd(22)} ${(size / 1024).toFixed(1).padStart(5)} KiB ${kind} (budget ${(budget / 1024).toFixed(1)} KiB)`,
  );
}
if (over) {
  console.error('Size budget exceeded; see scripts/size.mjs.');
  process.exit(1);
}

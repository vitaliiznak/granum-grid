import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

// Bytes a consumer downloads for each public entry: every export bundled from the built
// dist/, minified and gzipped, with React external. CSS is raw, as hosts usually ship it.
// Budgets ratchet down as the plan in docs/plans/library-family.md removes code; raise one
// only on purpose, with the reason in the commit.
const BUDGETS = {
  'granum-grid': 27_400,
  'granum-grid/headless': 13_200,
  'granum-grid/core': 3_700,
  'granum-grid/data': 4_100,
  'base.css': 16_100,
  'styles.css': 19_500,
};
const dist = fileURLToPath(new URL('../granum-grid/dist/', import.meta.url));
const scripts = {
  'granum-grid': 'index.js',
  'granum-grid/headless': 'headless.js',
  'granum-grid/core': 'core/index.js',
  'granum-grid/data': 'data/index.js',
};
const sizes = {};
for (const [entry, file] of Object.entries(scripts)) {
  const result = await build({
    stdin: { contents: `export * from ${JSON.stringify(dist + file)};`, resolveDir: dist },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    write: false,
    logLevel: 'error',
  });
  sizes[entry] = gzipSync(result.outputFiles[0].contents, { level: 9 }).length;
}
for (const file of ['base.css', 'styles.css']) sizes[file] = readFileSync(dist + file).length;

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

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';
import { EXTENSIONS_PATH } from '../src/data/duckdb-extensions';

/**
 * DuckDB-WASM loads its Parquet, JSON, and ICU readers as signed extensions. Instead of each
 * visitor fetching them from extensions.duckdb.org, the build downloads these exact files
 * once, checks them against the hashes below, and serves them beside the page. DuckDB still
 * checks their signatures when it loads them.
 *
 * Bumping @duckdb/duckdb-wasm fails the build until this list matches it: set `engine` to
 * the new `db.getVersion()`, then record `shasum -a 256` of each file at
 * https://extensions.duckdb.org/<engine>/wasm_eh/<name>.duckdb_extension.wasm.
 */
const PINNED = {
  wasmPackage: '1.32.0',
  engine: 'v1.4.3',
  platform: 'wasm_eh',
  files: {
    parquet: '22765c8f7dc741cda2b571a66ac7bb355295d7d69a6c37e5315b265672984f55',
    json: 'b997276c8e15cc3ebdeda340d73d15dc1c4f4755ad281280451cb0a2f79302e9',
    icu: 'c152a87bf98d792ad64ef0b7bf2df89ab06ace37f49edd00b378da6163e8b38c',
  } as Record<string, string>,
};
const UPSTREAM = 'https://extensions.duckdb.org';
const CACHE = fileURLToPath(
  new URL('../../node_modules/.cache/duckdb-extensions/', import.meta.url),
);

/** The path DuckDB requests for an extension, under the repository the page sets. */
const pathOf = (name: string) =>
  `${PINNED.engine}/${PINNED.platform}/${name}.duckdb_extension.wasm`;

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function checkPackageVersion() {
  // The package exports no package.json; its main entry sits in dist/.
  const entry = createRequire(import.meta.url).resolve('@duckdb/duckdb-wasm');
  return readFile(join(dirname(entry), '..', 'package.json'), 'utf8').then((text) => {
    const { version } = JSON.parse(text) as { version: string };
    if (version !== PINNED.wasmPackage)
      throw new Error(
        `@duckdb/duckdb-wasm is ${version}, but demo/server/duckdb-extensions.ts pins extensions for ${PINNED.wasmPackage}. Update its engine version and checksums.`,
      );
  });
}

const loading = new Map<string, Promise<Uint8Array>>();

/** One extension's bytes, from the cache or downloaded once, always matching its hash. */
function extension(name: string): Promise<Uint8Array> {
  let bytes = loading.get(name);
  if (!bytes) {
    bytes = load(name, PINNED.files[name]!);
    loading.set(name, bytes);
    bytes.catch(() => loading.delete(name));
  }
  return bytes;
}

async function load(name: string, expected: string): Promise<Uint8Array> {
  const cached = join(CACHE, pathOf(name));
  const existing = await readFile(cached).catch(() => null);
  if (existing && sha256(existing) === expected) return existing;
  const url = `${UPSTREAM}/${pathOf(name)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Downloading ${url} failed: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== expected)
    throw new Error(`${url} has SHA-256 ${actual}, but ${expected} is pinned. Not using it.`);
  await mkdir(dirname(cached), { recursive: true });
  await writeFile(`${cached}.partial`, bytes);
  await rename(`${cached}.partial`, cached);
  return bytes;
}

export function duckdbExtensionsPlugin(): Plugin {
  const prefix = `/${EXTENSIONS_PATH}/`;
  return {
    name: 'granum-grid-duckdb-extensions',
    buildStart: checkPackageVersion,
    configureServer(server: Pick<ViteDevServer, 'middlewares'>) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith(prefix)) return next();
        const name = Object.keys(PINNED.files).find((key) => url.pathname === prefix + pathOf(key));
        if (!name) {
          res.statusCode = 404;
          res.end(`Not a pinned DuckDB ${PINNED.engine} extension; see duckdb-extensions.ts`);
          return;
        }
        extension(name).then(
          (bytes) => {
            res.setHeader('Content-Type', 'application/wasm');
            res.end(bytes);
          },
          (error: Error) => {
            res.statusCode = 502;
            res.end(error.message);
          },
        );
      });
    },
    async generateBundle() {
      for (const name of Object.keys(PINNED.files))
        this.emitFile({
          type: 'asset',
          fileName: `${EXTENSIONS_PATH}/${pathOf(name)}`,
          source: await extension(name),
        });
    },
  };
}

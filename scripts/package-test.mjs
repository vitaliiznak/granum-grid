import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'granum-grid/package.json'), 'utf8'));
const parquetManifest = JSON.parse(
  readFileSync(join(root, 'packages/parquet/package.json'), 'utf8'),
);
const sqlManifest = JSON.parse(readFileSync(join(root, 'packages/sql/package.json'), 'utf8'));
const temporary = mkdtempSync(join(tmpdir(), 'granum-grid-package-'));

function npm(args, cwd = root) {
  // npm_execpath avoids shell quoting and npm.cmd differences on Windows.
  assert.ok(process.env.npm_execpath, 'Run this check with npm run test:package');
  return execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

/** Pack a workspace, running its prepack build, so no symlink or old dist hides a file. */
function pack(workspace) {
  const [packed] = JSON.parse(
    npm([
      'pack',
      `--workspace=${workspace}`,
      '--json',
      '--foreground-scripts=false',
      '--ignore-scripts=false',
      '--pack-destination',
      temporary,
    ]),
  );
  return packed;
}

try {
  // granum-grid first: the adapters' declarations build against its dist/ types.
  const packed = pack('granum-grid');
  assert.equal(packed.name, manifest.name);
  assert.equal(packed.version, manifest.version);
  assert.equal(manifest.license, 'Apache-2.0');
  assert.deepEqual(
    Object.keys(manifest.exports),
    ['.', './headless', './core', './data', './base.css', './styles.css'],
    'Public entry points changed; update the package README, docs/GUIDE.md, and the consumer fixtures deliberately',
  );
  const files = new Set(packed.files.map(({ path }) => path));
  const targets = Object.values(manifest.exports).flatMap((entry) =>
    typeof entry === 'string' ? [entry] : Object.values(entry),
  );
  for (const path of [
    'package.json',
    'README.md',
    'LICENSE',
    manifest.main,
    manifest.types,
    ...targets,
  ]) {
    assert.ok(files.has(path.replace(/^\.\//, '')), `Missing packed file: ${path}`);
  }
  for (const path of files) {
    assert.match(
      path,
      /^(?:package\.json|README\.md|LICENSE|(?:dist|src)\/[^.].*\.(?:js|map|ts|tsx|css))$/,
      `Unexpected packed file: ${path}`,
    );
    assert.ok(!/(^|\/)(?:tests?|node_modules|demo|media)(\/|\.)/.test(path), path);
  }

  // Adapters ship only their entry, declarations, maps, and source.
  const adapters = [parquetManifest, sqlManifest].map((adapter) => {
    const adapterPacked = pack(`packages/${adapter.name.split('/')[1]}`);
    assert.equal(adapterPacked.name, adapter.name);
    assert.equal(adapterPacked.version, adapter.version);
    assert.deepEqual(Object.keys(adapter.exports), ['.']);
    for (const { path } of adapterPacked.files)
      assert.match(
        path,
        /^(?:package\.json|README\.md|LICENSE|(?:dist|src)\/[^.].*\.(?:js|map|ts))$/,
        `Unexpected packed file in ${adapter.name}: ${path}`,
      );
    return adapterPacked;
  });
  const [parquetPacked, sqlPacked] = adapters;

  const archive = join(temporary, packed.filename);
  const parquetArchive = join(temporary, parquetPacked.filename);
  const sqlArchive = join(temporary, sqlPacked.filename);
  const installedVersion = (name) => lock.packages[`node_modules/${name}`].version;
  const consumers = [
    {
      label: 'React 18.2 (minimum supported)',
      react: '18.2.0',
      reactDom: '18.2.0',
      reactTypes: '18.2.79',
      reactDomTypes: '18.2.25',
    },
    {
      label: 'React 19 (workspace lockfile)',
      react: installedVersion('react'),
      reactDom: installedVersion('react-dom'),
      reactTypes: installedVersion('@types/react'),
      reactDomTypes: installedVersion('@types/react-dom'),
    },
  ];
  for (const [index, consumer] of consumers.entries()) {
    const cwd = join(temporary, `consumer-${index}`);
    mkdirSync(cwd);
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        name: 'granum-grid-package-consumer',
        private: true,
        type: 'module',
        dependencies: {
          [manifest.name]: `file:${archive}`,
          [parquetManifest.name]: `file:${parquetArchive}`,
          [sqlManifest.name]: `file:${sqlArchive}`,
          hyparquet: installedVersion('hyparquet'),
          'hyparquet-compressors': installedVersion('hyparquet-compressors'),
          react: consumer.react,
          'react-dom': consumer.reactDom,
          '@types/react': consumer.reactTypes,
          '@types/react-dom': consumer.reactDomTypes,
          typescript: installedVersion('typescript'),
        },
      }),
    );
    npm(
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        '--registry=https://registry.npmjs.org/',
        '--fetch-retries=1',
        '--fetch-timeout=30000',
      ],
      cwd,
    );
    const installed = join(cwd, 'node_modules', manifest.name);
    assert.ok(
      !lstatSync(installed).isSymbolicLink(),
      'Must install the tarball, not a workspace link',
    );
    assert.equal(
      readFileSync(join(installed, 'LICENSE'), 'utf8'),
      readFileSync(join(root, 'LICENSE'), 'utf8'),
    );
    // Both JavaScript and declaration maps must resolve to the shipped source files.
    for (const path of files) {
      if (!path.endsWith('.map')) continue;
      const map = JSON.parse(readFileSync(join(installed, path), 'utf8'));
      for (const source of map.sources) {
        const target = posix.normalize(
          posix.join(posix.dirname(path), map.sourceRoot ?? '', source),
        );
        assert.ok(files.has(target), `${path} references missing source ${target}`);
      }
    }
    for (const fixture of [
      'package-smoke.mjs',
      'package-parquet-smoke.mjs',
      'package-sql-smoke.mjs',
      'package-consumer.tsx',
    ]) {
      copyFileSync(join(root, 'scripts', fixture), join(cwd, fixture));
    }
    copyFileSync(
      join(root, 'packages/parquet/tests/fixtures/readings.parquet'),
      join(cwd, 'readings.parquet'),
    );
    execFileSync(process.execPath, ['package-smoke.mjs'], { cwd, stdio: 'inherit' });
    execFileSync(process.execPath, ['package-parquet-smoke.mjs'], { cwd, stdio: 'inherit' });
    execFileSync(process.execPath, ['package-sql-smoke.mjs'], { cwd, stdio: 'inherit' });
    for (const mode of [
      ['--module', 'NodeNext'],
      ['--module', 'ESNext', '--moduleResolution', 'Bundler'],
    ]) {
      execFileSync(
        process.execPath,
        [
          'node_modules/typescript/bin/tsc',
          '--noEmit',
          '--strict',
          '--target',
          'ES2022',
          '--jsx',
          'react-jsx',
          ...mode,
          'package-consumer.tsx',
        ],
        { cwd, stdio: 'inherit' },
      );
    }
    console.log(
      `${consumer.label}: tarball install, SSR, exports, styles, and consumer types passed.`,
    );
  }
  const output = join(root, 'output');
  mkdirSync(output, { recursive: true });
  for (const verified of [packed, ...adapters]) {
    copyFileSync(join(temporary, verified.filename), join(output, verified.filename));
    console.log(
      `Verified output/${verified.filename}: ${verified.files.length} files, ${Math.ceil(verified.size / 1024)} KiB packed.`,
    );
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

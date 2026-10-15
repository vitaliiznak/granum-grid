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
const temporary = mkdtempSync(join(tmpdir(), 'granum-package-'));

// Core first: the others build their declarations against its dist/ types. Entry points are
// pinned; change them on purpose, with the READMEs, docs/GUIDE.md, and the consumer fixtures.
const PACKAGES = [
  {
    dir: 'core',
    exports: ['.', './data', './dom', './map', './internal', './base.css', './styles.css'],
  },
  { dir: 'react', exports: ['.', './headless', './base.css', './styles.css'] },
  { dir: 'parquet', exports: ['.'] },
  { dir: 'sql', exports: ['.'] },
].map((entry) => ({
  ...entry,
  manifest: JSON.parse(readFileSync(join(root, 'packages', entry.dir, 'package.json'), 'utf8')),
}));

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
function pack(dir) {
  const [packed] = JSON.parse(
    npm([
      'pack',
      `--workspace=packages/${dir}`,
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
  for (const entry of PACKAGES) {
    const { manifest } = entry;
    const packed = (entry.packed = pack(entry.dir));
    assert.equal(packed.name, manifest.name);
    assert.equal(packed.version, manifest.version);
    assert.equal(manifest.license, 'Apache-2.0');
    assert.deepEqual(
      Object.keys(manifest.exports),
      entry.exports,
      `${manifest.name}: public entry points changed`,
    );
    entry.files = new Set(packed.files.map(({ path }) => path));
    const targets = Object.values(manifest.exports).flatMap((target) =>
      typeof target === 'string' ? [target] : Object.values(target),
    );
    for (const path of [
      'package.json',
      'README.md',
      'LICENSE',
      manifest.main,
      manifest.types,
      ...targets,
    ])
      assert.ok(entry.files.has(path.replace(/^\.\//, '')), `${manifest.name}: missing ${path}`);
    for (const path of entry.files) {
      assert.match(
        path,
        /^(?:package\.json|README\.md|LICENSE|(?:dist|src)\/[^.].*\.(?:js|map|ts|tsx|css))$/,
        `${manifest.name}: unexpected packed file ${path}`,
      );
      assert.ok(!/(^|\/)(?:tests?|node_modules|demo|media)(\/|\.)/.test(path), path);
    }
  }
  const archive = (dir) => {
    const entry = PACKAGES.find((item) => item.dir === dir);
    return `file:${join(temporary, entry.packed.filename)}`;
  };
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
    const local = Object.fromEntries(
      PACKAGES.map(({ dir, manifest }) => [manifest.name, archive(dir)]),
    );
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        name: 'granum-package-consumer',
        private: true,
        type: 'module',
        dependencies: {
          ...local,
          hyparquet: installedVersion('hyparquet'),
          'hyparquet-compressors': installedVersion('hyparquet-compressors'),
          react: consumer.react,
          'react-dom': consumer.reactDom,
          '@types/react': consumer.reactTypes,
          '@types/react-dom': consumer.reactDomTypes,
          typescript: installedVersion('typescript'),
        },
        // @granum-grid/react depends on @granum-grid/core by version; resolve it to the packed archive.
        overrides: { '@granum-grid/core': local['@granum-grid/core'] },
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
    for (const { manifest, files } of PACKAGES) {
      const installed = join(cwd, 'node_modules', manifest.name);
      assert.ok(!lstatSync(installed).isSymbolicLink(), `${manifest.name}: must be the tarball`);
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
          assert.ok(files.has(target), `${manifest.name}: ${path} references missing ${target}`);
        }
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
      `${consumer.label}: tarball installs, SSR, exports, styles, and consumer types passed.`,
    );
  }
  const output = join(root, 'output');
  mkdirSync(output, { recursive: true });
  for (const { packed } of PACKAGES) {
    copyFileSync(join(temporary, packed.filename), join(output, packed.filename));
    console.log(
      `Verified output/${packed.filename}: ${packed.files.length} files, ${Math.ceil(packed.size / 1024)} KiB packed.`,
    );
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

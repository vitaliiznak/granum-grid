import { existsSync, readFileSync } from 'node:fs';

// Read-only diagnostics: no installs, network requests, browser launches, or env dumps.
const root = new URL('../', import.meta.url);
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--json')) {
  console.error('Usage: npm run ai:doctor -- [--json]');
  process.exit(2);
}

const checks = [];
const add = (name, status, message) => checks.push({ name, status, message });
const readJSON = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

try {
  const expectedNode = readFileSync(new URL('.nvmrc', root), 'utf8').trim();
  const nodeMatches = process.versions.node.split('.')[0] === expectedNode;
  add(
    'node',
    nodeMatches ? 'pass' : 'fail',
    `Node ${process.versions.node}; this repo uses Node ${expectedNode}. ${nodeMatches ? '' : 'Run nvm use (or select that major with your version manager).'}`.trim(),
  );

  const manifest = readJSON('package.json');
  const demo = readJSON('demo/package.json');
  const lock = readJSON('package-lock.json');
  for (const [workspace, pkg] of [
    ['', manifest],
    ['demo', demo],
  ]) {
    for (const group of ['dependencies', 'devDependencies']) {
      const declared = Object.entries(pkg[group] ?? {}).sort();
      const locked = Object.entries(lock.packages[workspace]?.[group] ?? {}).sort();
      const matches = JSON.stringify(declared) === JSON.stringify(locked);
      add(
        `lockfile:${workspace || 'root'}:${group}`,
        matches ? 'pass' : 'fail',
        matches
          ? 'Manifest matches lockfile.'
          : 'Manifest and lockfile differ; reconcile them before npm ci.',
      );
    }
  }

  const dependencies = {
    ...manifest.devDependencies,
    ...demo.dependencies,
  };
  // Local workspaces, checked by the build and package tests.
  for (const name of Object.keys(dependencies))
    if (name.startsWith('@granum/')) delete dependencies[name];
  for (const name of Object.keys(dependencies).sort()) {
    const path = `node_modules/${name}/package.json`;
    if (!existsSync(new URL(path, root))) {
      add(name, 'fail', 'Dependency missing. Run npm ci.');
      continue;
    }
    const installed = readJSON(path).version;
    const expected = lock.packages[`node_modules/${name}`]?.version;
    add(
      name,
      installed === expected ? 'pass' : 'fail',
      installed === expected
        ? `Installed ${installed} matches lockfile.`
        : `Installed ${installed}, locked ${expected ?? 'missing'}. Run npm ci after reconciling the lockfile.`,
    );
  }

  if (!checks.some(({ status }) => status === 'fail')) {
    const { chromium, firefox, webkit } = await import('@playwright/test');
    for (const [name, browser] of Object.entries({ chromium, firefox, webkit })) {
      const present = existsSync(browser.executablePath());
      add(
        `browser:${name}`,
        present ? 'pass' : 'warn',
        present
          ? 'Browser binary found; launch/runtime support is verified by test:e2e.'
          : `Full browser binary not found. Run npx playwright install ${name}. A headless-only install may still work.`,
      );
    }
  }
} catch (error) {
  add('setup', 'fail', error.message);
}

const ok = !checks.some(({ status }) => status === 'fail');
const report = { ok, checks };
if (args.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const { name, status, message } of checks) {
    console.log(`${status.toUpperCase()} ${name}: ${message}`);
  }
  console.log(
    ok
      ? '\nReady for npm run check. Browser warnings only affect browser checks.'
      : '\nResolve failures, then rerun npm run ai:doctor.',
  );
}
process.exitCode = ok ? 0 : 1;

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Builds the workspace package in the current directory (npm runs `build` from there):
// declarations and ESM from src/ into dist/, its stylesheets, and the root license.
const root = new URL('../', import.meta.url);
const pkg = pathToFileURL(`${process.cwd()}/`);
rmSync(new URL('dist/', pkg), { recursive: true, force: true });
execFileSync(
  process.execPath,
  [fileURLToPath(new URL('node_modules/typescript/bin/tsc', root)), '-p', 'tsconfig.json'],
  { cwd: fileURLToPath(pkg), stdio: 'inherit' },
);
// Stylesheets come from the package's own src/, or, for @granum-grid/react, from the directory its
// `granumBuild.css` names (core's), so React users install one package.
const manifest = JSON.parse(readFileSync(new URL('package.json', pkg), 'utf8'));
const css = new URL(`${manifest.granumBuild?.css ?? 'src'}/`, pkg);
for (const name of ['base.css', 'styles.css']) {
  if (existsSync(new URL(name, css)))
    copyFileSync(new URL(name, css), new URL(`dist/${name}`, pkg));
}
copyFileSync(new URL('LICENSE', root), new URL('LICENSE', pkg));

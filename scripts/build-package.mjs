import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
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
for (const name of ['base.css', 'styles.css']) {
  if (existsSync(new URL(`src/${name}`, pkg)))
    copyFileSync(new URL(`src/${name}`, pkg), new URL(`dist/${name}`, pkg));
}
copyFileSync(new URL('LICENSE', root), new URL('LICENSE', pkg));

import { execFileSync } from 'node:child_process';
import { copyFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const pkg = new URL('deepscroll/', root);
rmSync(new URL('dist/', pkg), { recursive: true, force: true });
execFileSync(
  process.execPath,
  [fileURLToPath(new URL('node_modules/typescript/bin/tsc', root)), '-p', 'tsconfig.json'],
  { cwd: fileURLToPath(pkg), stdio: 'inherit' },
);
for (const name of ['base.css', 'styles.css']) {
  copyFileSync(new URL(`src/${name}`, pkg), new URL(`dist/${name}`, pkg));
}
copyFileSync(new URL('LICENSE', root), new URL('LICENSE', pkg));

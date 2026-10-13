import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildWiki, syncWiki } from './wiki.mjs';

test('wiki export resolves navigation and commit-pinned references without changing examples', async () => {
  const output = await mkdtemp(join(tmpdir(), 'granum-grid-wiki-'));
  try {
    const names = await buildWiki(output, { repository: 'example/explorer', ref: 'abc123' });
    assert.equal(names.length, 8);
    const home = await readFile(join(output, 'Home.md'), 'utf8');
    assert.ok(home.includes('(https://github.com/example/explorer/wiki/Setup)'));
    assert.ok(home.includes('(https://github.com/example/explorer/blob/abc123/docs/GUIDE.md)'));
    const setup = await readFile(join(output, 'Setup.md'), 'utf8');
    assert.ok(
      setup.includes('(https://github.com/example/explorer/tree/abc123/demo/src/tutorials)'),
    );
    assert.ok(setup.includes('/docs/QUICK_START.md#1-install-the-library)'));
    for (const name of names) {
      const source = await readFile(new URL(`../docs/wiki/${name}`, import.meta.url), 'utf8');
      const exported = await readFile(join(output, name), 'utf8');
      const snippets = (text) =>
        [...text.matchAll(/^```[^\n]*\n[\s\S]*?^```/gm)].map(([text]) => text);
      assert.deepEqual(snippets(exported), snippets(source), `${name} code must be unchanged`);
      const prose = exported.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '');
      for (const [, target] of prose.matchAll(/\]\(([^\s)]+)\)/g)) {
        assert.match(target, /^(?:https?:|#)/, `${name}: unresolved link ${target}`);
      }
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('sync is repeatable, prunes removed managed pages, and preserves manual pages and Git history', async () => {
  const output = await mkdtemp(join(tmpdir(), 'granum-grid-wiki-'));
  try {
    const source = join(output, 'export');
    const destination = join(output, 'checkout');
    await buildWiki(source);
    await mkdir(join(destination, '.git'), { recursive: true });
    await writeFile(join(destination, '.git/HEAD'), 'ref: refs/heads/master\n');
    await writeFile(join(destination, 'Manual.md'), '# Keep me\n');
    await writeFile(join(destination, 'Obsolete.md'), '# Old generated page\n');
    await writeFile(join(destination, 'Home.md'), '# Initial wiki\n');
    await writeFile(
      join(destination, 'deepscroll-wiki-manifest.json'),
      '["Home.md", "Obsolete.md"]',
    );
    await syncWiki(source, destination);
    await assert.rejects(readFile(join(destination, 'Obsolete.md')), { code: 'ENOENT' });
    assert.equal(await readFile(join(destination, 'Manual.md'), 'utf8'), '# Keep me\n');
    assert.equal(
      await readFile(join(destination, '.git/HEAD'), 'utf8'),
      'ref: refs/heads/master\n',
    );
    const first = await readFile(join(destination, 'Home.md'), 'utf8');
    await syncWiki(source, destination);
    assert.equal(await readFile(join(destination, 'Home.md'), 'utf8'), first);
    // A malformed manifest must never permit deleting outside the wiki directory.
    await writeFile(
      join(destination, 'deepscroll-wiki-manifest.json'),
      '["Home.md", "../outside.md"]',
    );
    await assert.rejects(syncWiki(source, destination), /Invalid wiki manifest/);
    assert.equal(await readFile(join(destination, 'Home.md'), 'utf8'), first);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

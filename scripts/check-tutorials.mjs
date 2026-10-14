import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const lessons = resolve(root, 'docs/lessons');
let snippets = 0;
let links = 0;
const documents = [
  ...[
    'README.md',
    'STYLING.md',
    'DESIGN.md',
    'AGENTS.md',
    'packages/core/README.md',
    'packages/react/README.md',
    'packages/parquet/README.md',
    'packages/sql/README.md',
    'media/README.md',
    'media/MUSIC.md',
    'demo/src/data/fixtures/README.md',
  ].map((name) => resolve(root, name)),
  ...(await readdir(resolve(root, 'docs')))
    .filter((name) => extname(name) === '.md')
    .map((name) => resolve(root, 'docs', name)),
  ...(await readdir(lessons))
    .filter((name) => extname(name) === '.md')
    .map((name) => resolve(lessons, name)),
];
for (const path of documents) {
  const name = path.slice(root.length);
  const text = await readFile(path, 'utf8');
  for (const match of text.matchAll(/<!-- source: (.+?) -->\s*```(?:ts|tsx)\n([\s\S]*?)\n```/g)) {
    const source = await readFile(resolve(root, match[1]), 'utf8');
    if (match[2].trim() !== source.trim())
      throw new Error(`${name}: snippet differs from ${match[1]}`);
    snippets++;
  }
  // Check prose links, not example URLs inside fenced code blocks.
  const prose = text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  for (const [, target] of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;
    const [file, anchor] = target.split('#');
    const destination = file ? resolve(dirname(path), file) : path;
    await stat(destination).catch(() => {
      throw new Error(`${name}: missing link ${target}`);
    });
    if (anchor && extname(destination) === '.md') {
      const content = await readFile(destination, 'utf8');
      const headings = [...content.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) =>
        heading
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s_-]/gu, '')
          .replace(/\s/g, '-'),
      );
      if (!headings.includes(anchor)) throw new Error(`${name}: missing heading ${target}`);
    }
    links++;
  }
}
if (snippets !== 7) throw new Error(`Expected seven complete tutorial files; found ${snippets}`);
console.log(
  `Documentation verified: ${snippets} source-matched code blocks and ${links} local links.`,
);

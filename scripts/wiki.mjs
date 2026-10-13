import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const wiki = resolve(root, 'docs/wiki');
const manifest = 'deepscroll-wiki-manifest.json';

function pageNames(value) {
  if (
    !Array.isArray(value) ||
    !value.includes('Home.md') ||
    value.some((name) => typeof name !== 'string' || !/^[\w-]+\.md$/.test(name)) ||
    new Set(value).size !== value.length
  ) {
    throw new Error('Invalid wiki manifest: expected unique Markdown filenames including Home.md');
  }
  return value;
}

async function writePages(destination, pages) {
  const names = pageNames([...pages.keys()].sort());
  let previous = [];
  try {
    previous = pageNames(JSON.parse(await readFile(resolve(destination, manifest), 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(destination, { recursive: true });
  for (const [name, content] of pages) await writeFile(resolve(destination, name), content);
  // Only remove pages recorded by an earlier sync, never unrelated wiki content or .git.
  for (const name of previous) {
    if (!pages.has(name)) await rm(resolve(destination, name), { force: true });
  }
  await writeFile(resolve(destination, manifest), `${JSON.stringify(names, null, 2)}\n`);
  return names;
}

export async function buildWiki(destination, options = {}) {
  const repository =
    options.repository ?? process.env.GITHUB_REPOSITORY ?? 'vitaliiznak/granum-grid';
  const ref = options.ref ?? process.env.GITHUB_SHA ?? 'main';
  const server = (process.env.GITHUB_SERVER_URL ?? 'https://github.com').replace(/\/$/, '');
  const repoURL = `${server}/${repository}`;
  const pages = new Map();
  for (const name of (await readdir(wiki)).filter((name) => name.endsWith('.md')).sort()) {
    const source = await readFile(resolve(wiki, name), 'utf8');
    // Code examples must remain byte-for-byte identical to their compiled companions.
    const parts = source.split(/(^```[^\n]*\n[\s\S]*?^```\s*$)/gm);
    for (let i = 0; i < parts.length; i += 2) {
      const links = [...parts[i].matchAll(/(!?\[[^\]\n]*\]\()([^\s)]+)(\))/g)];
      for (const match of links.reverse()) {
        const [, opening, target, closing] = match;
        if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
        const [file, ...fragment] = target.split('#');
        const path = resolve(wiki, decodeURIComponent(file));
        const local = relative(root, path);
        if (local.startsWith('../') || local === '..')
          throw new Error(`Link outside repo: ${target}`);
        const info = await stat(path);
        const suffix = fragment.length ? `#${fragment.join('#')}` : '';
        const url =
          dirname(path) === wiki && path.endsWith('.md')
            ? `${repoURL}/wiki/${encodeURIComponent(basename(path, '.md'))}${suffix}`
            : `${repoURL}/${opening.startsWith('!') ? 'raw' : info.isDirectory() ? 'tree' : 'blob'}/${encodeURIComponent(ref)}/${local.split('/').map(encodeURIComponent).join('/')}${suffix}`;
        parts[i] =
          `${parts[i].slice(0, match.index)}${opening}${url}${closing}${parts[i].slice(match.index + match[0].length)}`;
      }
    }
    pages.set(name, parts.join(''));
  }
  return writePages(destination, pages);
}

export async function syncWiki(source, destination) {
  const names = pageNames(JSON.parse(await readFile(resolve(source, manifest), 'utf8')));
  const pages = new Map();
  // Read and validate the entire export before touching the destination.
  for (const name of names) pages.set(name, await readFile(resolve(source, name), 'utf8'));
  return writePages(destination, pages);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, source, destination] = process.argv.slice(2);
  const names =
    command === 'build'
      ? await buildWiki(resolve(source ?? resolve(root, 'output/wiki')))
      : command === 'sync' && source && destination
        ? await syncWiki(resolve(source), resolve(destination))
        : (() => {
            throw new Error(
              'Usage: node scripts/wiki.mjs build [output] | sync <export> <wiki-checkout>',
            );
          })();
  console.log(`Wiki ${command}: ${names.length} pages.`);
}

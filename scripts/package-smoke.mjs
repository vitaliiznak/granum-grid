import assert from 'node:assert/strict';
import { createEngine } from '@granum/core';
import { PageCache, createArrayProvider as arrayFromData } from '@granum/core/data';
import { GranumGrid, useGranumGrid, AtlasRail, createArrayProvider } from '@granum/react';
import { useGranumGrid as useHeadlessGrid } from '@granum/react/headless';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
function renderWithoutWarnings(element) {
  const warnings = [];
  const originalError = console.error;
  console.error = (...args) => warnings.push(args);
  try {
    const markup = renderToString(element);
    assert.deepEqual(warnings, [], 'Server rendering must not produce React warnings');
    return markup;
  } finally {
    console.error = originalError;
  }
}
assert.match(import.meta.resolve('@granum/react'), /\/dist\/index\.js$/);
// The runtime surface of each entry point is deliberately small; widen it on purpose.
const entryValues = async (name) => Object.keys(await import(name)).sort();
assert.deepEqual(await entryValues('@granum/react'), [
  'AtlasRail',
  'GranumGrid',
  'JumpBar',
  'createArrayProvider',
  'createCursorProvider',
  'decodeView',
  'encodeView',
  'useGranumGrid',
]);
assert.deepEqual(await entryValues('@granum/react/headless'), ['useGranumGrid']);
// @granum/core is framework-free: no file it ships imports React.
const coreDist = fileURLToPath(new URL('.', import.meta.resolve('@granum/core')));
for (const file of readdirSync(coreDist, { recursive: true }).filter((f) => f.endsWith('.js')))
  assert.ok(!/from ['"]react/.test(readFileSync(`${coreDist}/${file}`, 'utf8')), file);
assert.deepEqual(await entryValues('@granum/core/dom'), [
  'MAX_SCROLL',
  'NATIVE_SCROLL',
  'bindScroll',
  'handleMovementKey',
  'handleViewportKey',
  'isControl',
  'isSearchShortcut',
  'isTextEntry',
  'isWithin',
  'ownsKeys',
  'scrollMapping',
]);
const engine = createEngine({ rowCount: 100_000_000 });
engine.goTo(73_499_999);
assert.equal(engine.getSnapshot().activeIndex, 73_499_999);
assert.equal(engine.getSnapshot().rowCount, 100_000_000);
assert.ok(
  [GranumGrid, useGranumGrid, AtlasRail, PageCache].every((value) => typeof value === 'function'),
);
engine.destroy();
assert.equal(createArrayProvider, arrayFromData);
assert.deepEqual(
  await createArrayProvider([10, 20, 30], { id: 'array', revision: '1' }).fetchRows(
    1,
    2,
    new AbortController().signal,
  ),
  [20, 30],
);
const markup = renderWithoutWarnings(
  createElement(GranumGrid, {
    provider: { id: 'ssr', revision: '1', rowCount: 100_000_000, fetchRows: async () => [] },
    dynamicRowHeight: true,
    ariaLabel: 'Server-rendered rows',
    renderRow: ({ row }) => String(row),
  }),
);
assert.ok(markup.includes('aria-rowcount="100000000"'));
assert.ok(markup.includes('Loading row'));
// Three props render rows and the map; the toolbar, heading row, and footer are opt-in.
assert.ok(markup.includes('data-ds-part="rail"'));
for (const part of ['toolbar', 'header', 'footer'])
  assert.ok(!markup.includes(`data-ds-part="${part}"`), `${part} must be opt-in`);
const chromeMarkup = renderWithoutWarnings(
  createElement(GranumGrid, {
    provider: { id: 'chrome', revision: '1', rowCount: 12, fetchRows: async () => [] },
    ariaLabel: 'Explorer with chrome',
    toolbar: true,
    header: 'Readings',
    footer: true,
    renderRow: ({ row }) => String(row),
  }),
);
for (const part of ['toolbar', 'header', 'footer'])
  assert.ok(chromeMarkup.includes(`data-ds-part="${part}"`), `${part} must render when set`);
const customMarkup = renderWithoutWarnings(
  createElement(GranumGrid, {
    provider: { id: 'custom', revision: '1', rowCount: 12, fetchRows: async () => [] },
    ariaLabel: 'Custom component',
    unstyled: true,
    classNames: { row: 'consumer-row', viewport: 'consumer-viewport' },
    styles: { row: { padding: 12, transform: 'translateY(999px)' } },
    toolbar: ({ snapshot }) => createElement('nav', null, `${snapshot.rowCount} records`),
    rail: false,
    footer: false,
    renderRow: ({ row }) => String(row),
  }),
);
assert.match(customMarkup, /data-unstyled="true"/);
assert.match(customMarkup, /<nav>12 records<\/nav>/);
assert.match(customMarkup, /consumer-row/);
assert.match(customMarkup, /consumer-viewport/);
assert.match(customMarkup, /data-ds-part="row"/);
assert.match(customMarkup, /padding:12px/);
assert.ok(!customMarkup.includes('translateY(999px)'), 'Row geometry must remain engine-owned');
assert.ok(!customMarkup.includes('class="ds-rail'));
assert.ok(!customMarkup.includes('class="ds-footer'));
// The headless entry is the same hook, and its module graph stops before explorer components.
assert.equal(useHeadlessGrid, useGranumGrid);
const headlessModules = new Set();
(function follow(url) {
  if (headlessModules.has(url)) return;
  headlessModules.add(url);
  const source = readFileSync(fileURLToPath(url), 'utf8');
  for (const [, path] of source.matchAll(/(?:from|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g))
    follow(new URL(path, url).href);
})(import.meta.resolve('@granum/react/headless'));
const components = [...headlessModules].filter((url) => /\/react\/[A-Z][^/]*\.js$/.test(url));
assert.deepEqual(components, [], '@granum/react/headless must not load explorer components');
function HeadlessRows() {
  const grid = useHeadlessGrid({
    provider: { id: 'headless', revision: '1', rowCount: 1_000, fetchRows: async () => [] },
  });
  return createElement(
    'div',
    grid.getViewportProps({ 'aria-label': 'Headless rows' }),
    grid.rows.map((slot) => createElement('div', { key: slot.index, ...grid.getRowProps(slot) })),
  );
}
assert.match(renderWithoutWarnings(createElement(HeadlessRows)), /aria-rowcount="1000"/);
const baseCss = readFileSync(new URL(import.meta.resolve('@granum/react/base.css')), 'utf8');
const themeCss = readFileSync(new URL(import.meta.resolve('@granum/react/styles.css')), 'utf8');
assert.match(baseCss, /@layer granum-grid/);
assert.match(themeCss, /@import ['"]\.\/base.css['"]/);
assert.ok(!themeCss.includes('!important'));
console.log('Built exports, navigation, SSR, composition hooks, and packaged styles verified.');

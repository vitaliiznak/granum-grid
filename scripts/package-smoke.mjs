import assert from 'node:assert/strict';
import { createEngine, createZoomMapping } from 'granum-grid/core';
import { PageCache, createArrayProvider as arrayFromData } from 'granum-grid/data';
import { GranumGrid, useGranumGrid, AtlasRail, createArrayProvider } from 'granum-grid';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
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
assert.match(import.meta.resolve('granum-grid'), /\/dist\/index\.js$/);
const engine = createEngine({ rowCount: 100_000_000 });
engine.goTo(73_499_999);
assert.equal(engine.getSnapshot().activeIndex, 73_499_999);
assert.equal(engine.getSnapshot().rowCount, 100_000_000);
assert.ok(
  [GranumGrid, useGranumGrid, AtlasRail, PageCache, createZoomMapping].every(
    (value) => typeof value === 'function',
  ),
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
const customMarkup = renderWithoutWarnings(
  createElement(GranumGrid, {
    provider: { id: 'custom', revision: '1', rowCount: 12, fetchRows: async () => [] },
    ariaLabel: 'Custom component',
    unstyled: true,
    classNames: { row: 'consumer-row', viewport: 'consumer-viewport' },
    styles: { row: { padding: 12, transform: 'translateY(999px)' } },
    renderToolbar: ({ snapshot }) => createElement('nav', null, `${snapshot.rowCount} records`),
    renderRail: () => null,
    renderFooter: () => null,
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
const baseCss = readFileSync(new URL(import.meta.resolve('granum-grid/base.css')), 'utf8');
const themeCss = readFileSync(new URL(import.meta.resolve('granum-grid/styles.css')), 'utf8');
assert.match(baseCss, /@layer granum-grid/);
assert.match(themeCss, /@import ['"]\.\/base.css['"]/);
assert.ok(!themeCss.includes('!important'));
console.log('Built exports, navigation, SSR, composition hooks, and packaged styles verified.');

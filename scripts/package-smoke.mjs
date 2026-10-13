import assert from 'node:assert/strict';
import { createEngine, createLensMapping } from 'deepscroll/core';
import { PageCache } from 'deepscroll/data';
import { DeepScroll, useDeepScroll, AtlasRail } from 'deepscroll';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync, existsSync } from 'node:fs';
assert.match(import.meta.resolve('deepscroll'), /\/dist\/index\.js$/);
const engine = createEngine({ rowCount: 100_000_000 });
engine.goTo(73_499_999);
assert.equal(engine.getSnapshot().activeIndex, 73_499_999);
assert.equal(engine.getSnapshot().rowCount, 100_000_000);
assert.ok(
  [DeepScroll, useDeepScroll, AtlasRail, PageCache, createLensMapping].every(
    (value) => typeof value === 'function',
  ),
);
engine.destroy();
assert.throws(() => import.meta.resolve('deepscroll/tools'), {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
});
assert.equal(existsSync(new URL('./tools.js', import.meta.resolve('deepscroll'))), false);
const markup = renderToString(
  createElement(DeepScroll, {
    provider: { id: 'ssr', revision: '1', rowCount: 100_000_000, fetchRows: async () => [] },
    dynamicRowHeight: true,
    ariaLabel: 'Server-rendered rows',
    renderRow: ({ row }) => String(row),
  }),
);
assert.ok(markup.includes('aria-rowcount="100000000"'));
assert.ok(markup.includes('Loading row'));
const customMarkup = renderToString(
  createElement(DeepScroll, {
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
const baseCss = readFileSync(new URL(import.meta.resolve('deepscroll/base.css')), 'utf8');
const themeCss = readFileSync(new URL(import.meta.resolve('deepscroll/styles.css')), 'utf8');
assert.match(baseCss, /@layer deepscroll/);
assert.match(themeCss, /@import ['"]\.\/base.css['"]/);
assert.ok(!themeCss.includes('!important'));
console.log('Built exports, navigation, SSR, composition hooks, and packaged styles verified.');

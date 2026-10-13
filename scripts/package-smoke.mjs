import assert from 'node:assert/strict';
import { createEngine, createLensMapping } from 'deepscroll/core';
import { PageCache } from 'deepscroll/data';
import { DeepScroll, useDeepScroll, AtlasRail } from 'deepscroll';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
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
const markup = renderToString(
  createElement(DeepScroll, {
    provider: { id: 'ssr', revision: '1', rowCount: 100_000_000, fetchRows: async () => [] },
    dynamicRowHeight: true,
    ariaLabel: 'Server-rendered rows',
    renderRow: ({ row }) => String(row),
  }),
);
assert.ok(markup.includes('aria-rowcount="100000000"'));
assert.ok(markup.includes('Loading reading'));
console.log('Built ESM entry points, exact navigation, and server-rendered placeholders verified.');

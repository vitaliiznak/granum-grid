import assert from 'node:assert/strict';
import { createEngine, createLensMapping } from 'deepscroll/core';
import { PageCache } from 'deepscroll/data';
import { DeepScroll, useDeepScroll, AtlasRail } from 'deepscroll';
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
console.log('Built ESM public entry points and exact navigation verified.');

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { Bucket } from '../src/data/types.js';
import { AggregatePlot } from '../src/react/AggregatePlot.js';
import { atlasDomain } from '../src/visuals/atlas.js';

const bucket: Bucket = {
  start: 0,
  end: 100,
  count: 100,
  avg: 25,
  min: null,
  max: null,
  accuracy: 'exact',
};
const render = (value: Bucket, domain = atlasDomain([value])) =>
  renderToStaticMarkup(
    createElement(AggregatePlot, { bucket: value, domain, metric: 'Activity', unit: 'items/h' }),
  );

it('plots group averages without inventing an unavailable per-row spread', () => {
  const html = render(bucket, [0, 100]);
  expect(html).toContain('Average activity: 25 items/h. Exact summary.');
  expect(html).toContain('width="24%"');
  expect(html).not.toContain('ds-summary-spread');
});

it('keeps missing summaries distinct from a measured zero', () => {
  for (const unavailable of [
    { ...bucket, avg: null },
    { ...bucket, accuracy: 'unavailable' as const },
  ]) {
    const html = render(unavailable);
    expect(html).toContain('Unavailable');
    expect(html).not.toContain('class="ds-summary-bar"');
    expect(html).not.toContain('class="ds-summary-average"');
  }
  const zero = render({ ...bucket, avg: 0 }, [-100, 100]);
  expect(zero).toContain('Average activity: 0 items/h');
  expect(zero).toContain('class="ds-summary-average" x1="50%"');
});

it('plots negative averages and a min–max range without overflowing large finite values', () => {
  const html = render({ ...bucket, avg: -5e307, min: -1e308, max: 1e308, accuracy: 'estimated' });
  expect(html).not.toMatch(/NaN|Infinity/);
  expect(html).toContain('x="26%"');
  expect(html).toContain('width="24%"');
  expect(html).toContain('class="ds-summary-spread" x1="2%" x2="98%"');
  expect(html).toContain('Estimated summary.');
});

import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// 1,000 rows in ten row groups: id, label ("reading N"), value, when.
const file = readFileSync(
  new URL('../../packages/parquet/tests/fixtures/readings.parquet', import.meta.url),
);
const FILE_URL = 'https://files.example/readings.parquet';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'range',
  'access-control-expose-headers': 'content-length, content-range, etag',
};

/** Serve the fixture with byte ranges, and keep the bundled FineWeb file off the network. */
async function serveParquet(page: Page, { ranges = true } = {}) {
  const requests: string[] = [];
  await page.route('https://huggingface.co/**', (route) => route.abort('blockedbyclient'));
  await page.route('https://files.example/**', (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers().range ?? '');
    requests.push(request.headers().range ?? request.method());
    if (request.method() === 'HEAD')
      return route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-length': String(file.length), etag: '"fixture"' },
      });
    if (!range || !ranges) return route.fulfill({ status: 200, headers: CORS, body: file });
    const start = Number(range[1]),
      end = Math.min(file.length, Number(range[2]) + 1);
    return route.fulfill({
      status: 206,
      headers: { ...CORS, 'content-range': `bytes ${start}-${end - 1}/${file.length}` },
      body: file.subarray(start, end),
    });
  });
  return requests;
}

test('a pasted Parquet URL opens in the playground and any row is one jump away', async ({
  page,
  pageErrors,
}) => {
  const requests = await serveParquet(page);
  await page.goto('/?dataset=parquet');
  await page.getByLabel('Parquet file URL').fill(FILE_URL);
  await page.getByRole('button', { name: 'Open Parquet URL' }).click();
  await expect(page.getByRole('heading', { name: 'readings.parquet' })).toBeVisible();
  const grid = page.getByRole('grid', { name: 'Parquet rows' });
  await expect(grid.locator('[data-status="ready"]').first()).toBeVisible();
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 1,000');
  await page.getByRole('button', { name: 'Go to…' }).click();
  await page.getByRole('textbox', { name: 'Go to row, date, or event' }).fill('735');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('position')).toHaveText('Row 735 of 1,000');
  await expect(grid.getByRole('gridcell', { name: 'reading 735', exact: true })).toBeVisible();
  // Every read was a byte range; the whole file was never requested.
  expect(requests.every((request) => request === 'HEAD' || request.startsWith('bytes='))).toBe(
    true,
  );
  await expect(page.getByTestId('parquet-transfer')).toContainText('Downloaded');
  // The address keeps the file, so a reload opens it again.
  expect(new URL(page.url()).searchParams.get('url')).toBe(FILE_URL);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'readings.parquet' })).toBeVisible();
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 1,000');
  await page.getByRole('button', { name: 'Restore FineWeb' }).click();
  await expect(
    page.getByRole('heading', { name: 'A 2 GB Parquet file, read in place' }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get('url')).toBeNull();
  expect(pageErrors).toEqual([]);
});

test('a server that ignores byte ranges is refused before it sends the file', async ({ page }) => {
  await serveParquet(page, { ranges: false });
  await page.goto('/?dataset=parquet');
  await page.getByLabel('Parquet file URL').fill(FILE_URL);
  await page.getByRole('button', { name: 'Open Parquet URL' }).click();
  await expect(page.getByRole('alert')).toContainText('This server ignores byte ranges');
  await expect(
    page.getByRole('heading', { name: 'A 2 GB Parquet file, read in place' }),
  ).toBeVisible();
});

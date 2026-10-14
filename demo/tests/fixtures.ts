import { readFileSync } from 'node:fs';
import { expect, test as base, type Locator, type Page } from '@playwright/test';

// 1,000 rows in ten row groups: id, label ("reading N"), value, when.
const file = readFileSync(
  new URL('../../packages/parquet/tests/fixtures/readings.parquet', import.meta.url),
);
export const FILE_URL = 'https://files.example/readings.parquet';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'range',
  'access-control-expose-headers': 'content-length, content-range, etag',
};

/** Serve the fixture with byte ranges, and keep the bundled FineWeb file off the network. */
export async function serveParquet(
  page: Page,
  { ranges = true, rows = true }: { ranges?: boolean; rows?: boolean } = {},
) {
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
    // Without rows, only the first read (the footer) answers; row reads stay pending.
    if (!rows && requests.filter((entry) => entry.startsWith('bytes=')).length > 1)
      return new Promise<void>(() => {});
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

/** Phone-sized viewport for narrow-layout cases. */
export const MOBILE = { width: 390, height: 844 };
/** Desktop viewport tall enough for the expanded dataset map. */
export const DESKTOP = { width: 1440, height: 1100 };

/** Whether a page's document fits its viewport width, without horizontal scrolling. */
export function fitsViewportWidth(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
}

/** Open a demo page and wait for its first loaded row. */
export async function openDataset(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('[role="row"][data-status="ready"]').first()).toBeVisible();
}

/** Open the signal archive and wait until its markers are on the map. */
export async function openSignal(page: Page) {
  await page.goto('/?dataset=signal');
  await expect(page.getByRole('button', { name: 'Spike 3', exact: true })).toBeVisible();
}

/** Open the debug dialog, run `use` in it, then close it. */
export async function withDebug(page: Page, use: (dialog: Locator) => Promise<unknown>) {
  await page.getByRole('button', { name: 'debug', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'debug', exact: true });
  await use(dialog);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
}

/** Open the scrollbar's Config panel, run `use` in it, then choose Done. */
export async function withMapSettings(page: Page, use: (panel: Locator) => Promise<unknown>) {
  await page.getByRole('button', { name: 'Config', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Config', exact: true });
  await use(panel);
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
}

/** From an open selection menu, enter one-based row numbers and use them. */
export async function enterRows(page: Page, from: string, to?: string) {
  await page.getByRole('button', { name: /^Enter row numbers/ }).click();
  await page.getByLabel('From row', { exact: true }).fill(from);
  if (to !== undefined) await page.getByLabel('To row', { exact: true }).fill(to);
  await page.getByRole('button', { name: 'Use these rows', exact: true }).click();
}

/**
 * Uncaught page errors from the whole test, including setup. Tests that require a clean
 * run assert `expect(pageErrors).toEqual([])`.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
  },
});
export { expect };

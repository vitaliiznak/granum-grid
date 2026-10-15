import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';

// Without PAGES_URL, serve the exact production build at a project-style path.
// With PAGES_URL, exercise the same navigation on the published site.
const root = fileURLToPath(new URL('../demo/', import.meta.url));
const output = fileURLToPath(new URL('../output/playwright/pages-smoke/', import.meta.url));
const fixture = new URL('../packages/parquet/tests/fixtures/readings.parquet', import.meta.url);
let server;
let browser;
let context;
let page;

try {
  let site;
  if (process.env.PAGES_URL) {
    site = new URL(process.env.PAGES_URL);
    assert.ok(['http:', 'https:'].includes(site.protocol), 'PAGES_URL must be an HTTP(S) URL');
    assert.ok(site.pathname.endsWith('/'), 'PAGES_URL must end with /');
  } else {
    const base = '/__pages_check__/';
    server = await preview({
      root,
      configFile: fileURLToPath(new URL('../demo/vite.config.ts', import.meta.url)),
      base,
      preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
    });
    // resolvedUrls carries the port the OS assigned to port 0.
    site = new URL(base, server.resolvedUrls.local[0]);
  }

  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const errors = [];
  context.on('page', (opened) => {
    opened.on('pageerror', (error) => errors.push(error.message));
    opened.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
  });
  context.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const signalURL = new URL(site);
  signalURL.searchParams.set('dataset', 'signal');
  const response = await page.goto(signalURL.href);
  assert.equal(response?.status(), 200, 'The published HTML must load');
  await expect(page.getByText('Signal amplitude · sampled overview')).toBeVisible();
  await page.getByRole('button', { name: 'Spike 3', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 61,700,000 of 100,000,000');
  await expect(page.locator('[role=row][aria-rowindex="61700000"]')).toContainText('SPIKE');

  const home = page.getByRole('link', { name: 'Granum Grid home' });
  assert.equal(new URL(await home.getAttribute('href'), page.url()).href, site.href);
  const fullPage = page.getByRole('link', { name: 'Open full page' });
  const fullURL = new URL(await fullPage.getAttribute('href'), page.url());
  assert.equal(fullURL.pathname, site.pathname, 'Full-page links must keep the project path');
  const opened = page.waitForEvent('popup');
  await fullPage.click();
  const popup = await opened;
  await expect(popup.getByTestId('position')).toHaveText('Row 61,700,000 of 100,000,000');
  await popup.reload();
  await expect(popup.getByTestId('position')).toHaveText('Row 61,700,000 of 100,000,000');
  await expect(popup.locator('[role=row][data-status="ready"]').first()).toBeVisible();
  await popup.close();

  await home.click();
  assert.equal(new URL(page.url()).pathname, site.pathname, 'Home must stay in the project');
  await expect(page.locator('[role=row][data-status="ready"]').first()).toBeVisible();
  assert.deepEqual(errors, [], 'The Pages navigation must have no runtime or HTTP errors');
  await page.screenshot({ path: `${output}/site.png`, fullPage: true });
  await page.goto(new URL('tutorials.html', site).href);
  await page.getByRole('button', { name: 'Find SKU-060' }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 60 of 120');
  await page.getByRole('link', { name: 'Continue to the next lesson' }).click();
  assert.equal(new URL(page.url()).pathname, `${site.pathname}tutorials.html`);
  await expect(
    page.getByRole('grid', { name: 'Sensor readings' }).locator('[data-status="ready"]').first(),
  ).toBeVisible();
  assert.deepEqual(errors, [], 'Tutorials must load and navigate under the project path');

  // DuckDB's extensions come from the deployed copy under the project path, not another host.
  const requests = [];
  context.on('request', (request) => requests.push(new URL(request.url())));
  const fileURL = new URL(site);
  fileURL.searchParams.set('dataset', 'file');
  await page.goto(fileURL.href);
  await page.getByLabel('Open a Parquet, CSV, or JSON file').setInputFiles(fileURLToPath(fixture));
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 1,000', { timeout: 60_000 });
  const outside = requests.filter((url) => url.protocol !== 'blob:' && url.origin !== site.origin);
  assert.deepEqual(outside.map(String), [], 'Opening a file must not reach another host');
  assert.ok(
    requests.some(
      (url) =>
        url.pathname.startsWith(`${site.pathname}duckdb-extensions/v`) &&
        url.pathname.endsWith('/parquet.duckdb_extension.wasm'),
    ),
    'DuckDB must load its Parquet reader from the deployed copy',
  );
  assert.deepEqual(errors, [], 'A local Parquet file must open under the project path');
  await context.tracing.stop();
  console.log(
    `Pages smoke passed: ${site.href} (worker data, jump, full-page reload, home, tutorials, DuckDB file).`,
  );
} catch (error) {
  if (context) await context.tracing.stop({ path: `${output}/trace.zip` }).catch(() => {});
  if (page) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  try {
    await browser?.close();
  } finally {
    await server?.close();
  }
}

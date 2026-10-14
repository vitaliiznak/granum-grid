import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures';

const FIXTURE = fileURLToPath(
  new URL('../../packages/parquet/tests/fixtures/readings.parquet', import.meta.url),
);

// DuckDB-WASM loads from the dev server on first use; give that and the copy room.
test.setTimeout(90_000);

test('a million-row sample opens in DuckDB with an exact map, revisions, and complete search', async ({
  page,
  pageErrors,
}) => {
  await page.goto('/?dataset=file');
  await page.getByRole('button', { name: 'Make a sample of a million requests' }).click();
  await expect(page.getByRole('heading', { name: 'A million generated requests' })).toBeVisible({
    timeout: 60_000,
  });
  const grid = page.getByRole('grid', { name: 'File rows' });
  await expect(grid.locator('[data-status="ready"]').first()).toBeVisible();
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 1,000,000');
  // DuckDB computes every group from every row, so the map says exact, not sampled.
  await expect(page.locator('.ds-legend')).toContainText('exact overview');

  // A filter is a new revision with its own addresses.
  await page.getByLabel('Where').fill('status = 503');
  await page.getByRole('button', { name: 'New revision' }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 3,017', { timeout: 30_000 });
  await expect(grid.getByRole('gridcell', { name: '503', exact: true }).first()).toBeVisible();

  // Search reads every row of the revision: there are exactly 3,017 failures to find.
  await page.getByRole('button', { name: 'Go to…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Jump to a location' });
  await dialog.getByRole('textbox').fill('latency_ms > 900');
  await expect(dialog.getByRole('status')).not.toContainText('Searching');
  await expect(dialog.getByRole('status')).not.toContainText('not an exhaustive search');
  await page.keyboard.press('Escape');

  // The kept revision reopens without copying the rows again.
  const revisions = page.getByRole('navigation', { name: 'Kept revisions' });
  await revisions.getByRole('button', { name: 'all rows, in file order' }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 1,000,000');

  // A condition DuckDB rejects explains itself and keeps the current revision.
  await page.getByLabel('Where').fill('no_such_column > 1');
  await page.getByRole('button', { name: 'New revision' }).click();
  await expect(page.getByRole('alert')).toContainText('no_such_column');
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 1,000,000');
  expect(pageErrors).toEqual([]);
});

test('a local Parquet file opens through DuckDB and is never uploaded', async ({
  page,
  pageErrors,
  baseURL,
}) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    // A blob: URL (WebKit reads the chosen file through one) has the page's own origin.
    if (new URL(request.url()).origin !== new URL(baseURL!).origin)
      outside.push(`${request.method()} ${request.url()}`);
  });
  await page.goto('/?dataset=file');
  await page.getByLabel('Open a Parquet, CSV, or JSON file').setInputFiles(FIXTURE);
  await expect(page.getByRole('heading', { name: 'readings.parquet' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 1,000');
  await page.getByRole('button', { name: 'Go to…' }).click();
  await page.getByRole('textbox', { name: 'Go to row, date, or event' }).fill('735');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('position')).toHaveText('Row 735 of 1,000');
  await expect(
    page.getByRole('grid', { name: 'File rows' }).getByRole('gridcell', { name: 'reading 735' }),
  ).toBeVisible();
  // DuckDB fetches its signed Parquet reader (and ICU) for the pinned version; nothing else
  // leaves the page, and nothing is sent.
  expect(outside.length).toBeGreaterThan(0);
  for (const request of outside)
    expect(request).toMatch(
      /^GET https:\/\/extensions\.duckdb\.org\/v\d+\.\d+\.\d+\/wasm_eh\/\w+\.duckdb_extension\.wasm$/,
    );
  expect(pageErrors).toEqual([]);
});

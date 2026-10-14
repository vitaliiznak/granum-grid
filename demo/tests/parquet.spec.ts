import { expect, test, FILE_URL, serveParquet } from './fixtures';

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

test('a link to a row reopens a pasted Parquet file at that row', async ({ page, pageErrors }) => {
  await serveParquet(page);
  await page.goto('/?dataset=parquet');
  await page.getByLabel('Parquet file URL').fill(FILE_URL);
  await page.getByRole('button', { name: 'Open Parquet URL' }).click();
  await expect(page.getByRole('heading', { name: 'readings.parquet' })).toBeVisible();
  await page.getByRole('button', { name: 'Go to…' }).click();
  await page.getByRole('textbox', { name: 'Go to row, date, or event' }).fill('735');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('position')).toHaveText('Row 735 of 1,000');
  await page.getByRole('button', { name: 'Link to this row' }).click();
  const link = await page.getByRole('textbox', { name: 'Link to this row' }).inputValue();
  expect(new URL(link).searchParams.get('url')).toBe(FILE_URL);
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'readings.parquet' })).toBeVisible();
  await expect(page.getByTestId('position')).toHaveText('Row 735 of 1,000');
  await expect(page.locator('.shared-view-error')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

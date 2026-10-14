import { expect, test, enterRows, openSignal } from './fixtures';
test.beforeEach(async ({ page }) => {
  await openSignal(page);
});
test('overview exposes shape and the third spike can be found directly', async ({ page }) => {
  await expect(page.getByTestId('overview')).toBeVisible();
  await expect(page.getByText('Signal amplitude · sampled overview')).toBeVisible();
  await page.getByRole('button', { name: 'Spike 3', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 61,700,000 of 100,000,000');
  await expect(page.locator('[role=row][aria-rowindex="61700000"]')).toContainText('SPIKE');
});
test('exact row jump and reversible history', async ({ page }) => {
  await page.getByRole('button', { name: 'Go to…' }).click();
  await page.getByRole('textbox', { name: 'Go to row, date, or event' }).fill('73,500,000');
  await expect(page.getByRole('button', { name: 'Row 73,500,000 Row' })).toBeVisible();
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByTestId('position')).toHaveText('Row 73,500,000 of 100,000,000');
  await expect(page.locator('[role=row][aria-rowindex="73500000"]')).toBeVisible();
  await page.getByRole('button', { name: 'Back to previous location', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 100,000,000');
  await page.getByRole('button', { name: 'Forward', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 73,500,000 of 100,000,000');
});
test('orientation is consistent and the final row is reachable without a dataset-height spacer', async ({
  page,
}) => {
  const grid = page.getByRole('grid');
  await grid.focus();
  await grid.press('End');
  await expect(page.getByTestId('position')).toHaveText('Row 100,000,000 of 100,000,000');
  // The final row ends at the bottom of the viewport, with rows above it rather than a gap.
  await expect(grid.locator('[aria-rowindex="100000000"]')).toHaveAttribute('data-status', 'ready');
  await expect
    .poll(() =>
      grid.evaluate((element) => {
        const row = element.querySelector('[aria-rowindex="100000000"]')!.getBoundingClientRect();
        const top = element.getBoundingClientRect().top + element.clientTop;
        // `|| 0` turns a rounded -0 (Firefox's subpixel layout) into 0.
        return Math.round(top + element.clientHeight - row.bottom) || 0;
      }),
    )
    .toBe(0);
  await expect(grid.locator('.gr-dataset-end')).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'Dataset position' })).toHaveAttribute(
    'aria-valuenow',
    '100000000',
  );
  await expect(grid).toHaveAttribute('aria-rowcount', '100000000');
  expect(await grid.locator('[role=row]').count()).toBeLessThan(60);
  const heights = await grid.evaluate((element) => ({
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  // The native scroll range is capped at 8 million pixels, not 100 million rows' 3.2 billion,
  // and the last row puts the native scrollbar at its end.
  expect(heights.scrollHeight).toBeLessThanOrEqual(8_000_000 + heights.height);
  expect(Math.round(heights.scrollTop + heights.height)).toBe(heights.scrollHeight);
});
test('a typed row selection opens its exact rows', async ({ page }) => {
  await page.getByRole('button', { name: 'Select rows', exact: true }).click();
  await enterRows(page, '1000', '2000');
  await page.getByRole('button', { name: 'View selection', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 1,000 of 100,000,000');
  await expect(page.locator('[role=row][aria-rowindex="1000"]')).toHaveAttribute(
    'data-status',
    'ready',
  );
  await expect(page.getByTestId('overview')).toBeVisible();
  expect(await page.getByRole('grid').locator('[role=row]').count()).toBeLessThan(60);
});

import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/?dataset=signal');
  await expect(page.getByRole('button', { name: 'Spike 3', exact: true })).toBeVisible();
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
test('orientation is consistent and the final row is reachable without a tall spacer', async ({
  page,
}) => {
  const grid = page.getByRole('grid');
  await grid.focus();
  await grid.press('End');
  await expect(page.getByTestId('position')).toHaveText('Row 100,000,000 of 100,000,000');
  await expect(page.getByRole('slider', { name: 'Dataset position' })).toHaveAttribute(
    'aria-valuenow',
    '100000000',
  );
  await expect(grid).toHaveAttribute('aria-rowcount', '100000000');
  expect(await grid.locator('[role=row]').count()).toBeLessThan(60);
  const heights = await grid.evaluate((element) => ({
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(heights.scrollHeight).toBeLessThan(heights.height + 150);
});
test('all views preserve the selected row and Zoom refines back to real rows', async ({ page }) => {
  await page.getByRole('button', { name: 'Spike 3', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 61,700,000 of 100,000,000');
  for (const name of ['Lens', 'Zoom', 'Rows']) {
    await page
      .getByRole('combobox', { name: 'View', exact: true })
      .selectOption(name.toLowerCase());
    await expect(page.getByTestId('position')).toHaveText('Row 61,700,000 of 100,000,000');
    await expect(page.getByRole('slider', { name: 'Dataset position' })).toHaveAttribute(
      'aria-valuenow',
      '61700000',
    );
  }
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('zoom');
  await page.getByRole('button', { name: 'Fit dataset', exact: true }).click();
  await expect(page.getByText('Aggregate view', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect rows', exact: true }).click();
  await expect(page.locator('[role=row][aria-rowindex="50000001"]')).toBeVisible();
});

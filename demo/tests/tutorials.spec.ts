import { expect, test, MOBILE } from './fixtures';

test('inventory tutorial reaches the documented product and preserves history', async ({
  page,
}) => {
  await page.goto('/tutorials.html');
  await expect(
    page.getByRole('grid', { name: 'Inventory products' }).locator('[data-status="ready"]').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Find SKU-060' }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 60 of 120');
  await expect(
    page.getByRole('gridcell', { name: '60. SKU-060 · Folder · 13 in stock', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back to previous location' }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 120');
  await page.getByRole('link', { name: 'Continue to the next lesson' }).click();
  await expect(
    page.getByRole('heading', { name: '2. Add a sensor map and summaries', exact: true }),
  ).toBeVisible();
});

test('sensor tutorial gives the documented exact selected-range summary', async ({
  page,
}, testInfo) => {
  await page.goto('/tutorials.html?lesson=sensors');
  await expect(
    page.getByRole('grid', { name: 'Sensor readings' }).locator('[data-status="ready"]').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'See the whole day' }).click();
  await expect(page.getByRole('combobox', { name: 'View' })).toHaveValue('zoom');
  await page.getByRole('button', { name: 'Inspect warm interval' }).click();
  const selection = page.getByRole('region', { name: 'Your selection' });
  await expect(selection).toContainText('20 rows selected');
  await expect(selection).toContainText('Rows 721–740');
  await selection.getByText('Show summary', { exact: true }).click();
  await expect(selection).toContainText('Exact summary');
  await expect(selection).toContainText('40 °C');
  await page.screenshot({ path: testInfo.outputPath('sensor-lesson.png'), fullPage: true });
});

test('log tutorial teaches complete and partial search on a narrow viewport', async ({
  page,
  pageErrors,
}, testInfo) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/tutorials.html?lesson=logs');
  await expect(
    page.getByRole('grid', { name: 'Application logs' }).locator('[data-status="ready"]').first(),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('logs-mobile.png'), fullPage: true });
  const open = page.getByRole('button', { name: 'Find errors', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Jump to a location' });
  await expect(dialog.getByRole('status')).toHaveText('20 matching rows');
  await dialog.getByRole('textbox').fill('auth');
  await expect(dialog.getByRole('status')).toContainText('Partial results · 100 matching rows');
  await dialog.getByRole('textbox').fill('unavailable');
  await expect(dialog.getByRole('status')).toHaveText('20 matching rows');
  await dialog.getByRole('textbox').press('ArrowDown');
  await dialog.getByRole('textbox').press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId('position')).toHaveText('Row 31 of 600');
  await expect(open).toBeFocused();
  expect(pageErrors).toEqual([]);
});

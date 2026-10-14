import { expect, test, MOBILE, fitsViewportWidth } from './fixtures';

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
  await page.getByRole('button', { name: 'Inspect warm interval' }).click();
  const summary = page.getByRole('region', { name: 'Sensor lesson' }).getByRole('status');
  await expect(summary).toContainText('Rows 721–740 · 20 readings · exact');
  await expect(summary).toContainText('mean 40 °C · min 40 °C · max 40 °C');
  await expect(
    page.getByRole('grid', { name: 'Sensor readings' }).locator('[aria-rowindex="721"]'),
  ).toHaveAttribute('data-selected', 'true');
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
  expect(await fitsViewportWidth(page)).toBe(true);
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

test('compose tutorial builds an explorer from the headless hook and controlled widgets', async ({
  page,
  pageErrors,
}) => {
  await page.goto('/tutorials.html?lesson=compose');
  const rows = page.getByRole('grid', { name: 'Composed inventory' });
  await expect(rows.locator('[data-status="ready"]').first()).toBeVisible();
  const position = page.getByLabel('Current row');
  await expect(position).toHaveText('Row 1 of 120');
  // A host marker with its own kind reaches the map and its styling hook.
  await expect(page.locator('.gr-marker[data-kind="restock"]')).toHaveCount(1);
  await rows.focus();
  await page.keyboard.press('n');
  await expect(position).toHaveText('Row 100 of 120');
  await expect(rows.getByRole('gridcell', { name: '100. SKU-100 · Notebook' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(position).toHaveText('Row 1 of 120');
  const open = page.getByRole('button', { name: 'Search products' });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Jump to a location' });
  // The host passes the dialog's matches to the map as highlights.
  await dialog.getByRole('textbox').fill('50');
  await expect(page.locator('.gr-marker[data-kind="search"]')).toHaveCount(1);
  await dialog.getByRole('textbox').fill('restock');
  await dialog.getByRole('button', { name: /^Restock SKU-100 Row 100/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(position).toHaveText('Row 100 of 120');
  await expect(page.locator('.gr-marker[data-kind="search"]')).toHaveCount(0);
  await expect(open).toBeFocused();
  await page.setViewportSize(MOBILE);
  expect(await fitsViewportWidth(page)).toBe(true);
  expect(pageErrors).toEqual([]);
});

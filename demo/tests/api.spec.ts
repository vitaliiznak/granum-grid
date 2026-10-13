import { expect, test, MOBILE } from './fixtures';

test('the tour opens provider search through the public API with dataset-specific guidance', async ({
  page,
}) => {
  await page.goto('/?dataset=logs');
  await expect(page.locator('[data-status="ready"]').first()).toBeVisible();
  const initialPosition = (await page.getByTestId('position').textContent())!;
  await page.getByRole('button', { name: 'Search Find 5xx responses' }).click();
  const dialog = page.getByRole('dialog', { name: 'Jump to a location' });
  await expect(dialog.getByRole('textbox')).toHaveValue('status >= 500');
  await expect(dialog.getByRole('status')).toContainText('Partial results');
  await expect(dialog.getByRole('button', { name: '2017-03', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '2026-09-18', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('1 matching row');
  await dialog.getByRole('textbox').press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId('position')).not.toHaveText(initialPosition);
  await page.getByRole('button', { name: /Go to…/ }).click();
  await dialog.getByRole('textbox').fill('unknown > 1');
  await expect(dialog.getByRole('status')).toContainText('Searchable fields:');
});

test('HTTP integration reads bounded pages and restores selection and location through the public API', async ({
  page,
  pageErrors,
}, testInfo) => {
  const rowCounts: number[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/trace/rows')) rowCounts.push(Number(url.searchParams.get('count')));
  });
  await page.goto('/http.html');
  await expect(page.locator('[data-status="ready"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Find slow events', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Jump to a location' });
  await expect(dialog.getByRole('textbox')).toHaveValue('duration > 10');
  await expect(dialog.locator('.ds-jump-results button').first()).toBeVisible();
  await dialog.getByRole('textbox').press('Enter');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Select nearby events', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change selection', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remember view', exact: true }).click();
  const position = await page.getByTestId('position').textContent();
  const selected = (await page.locator('.ds-selection-description').textContent())!;
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await page.getByRole('grid').press('Home');
  await page.getByRole('button', { name: 'Restore view', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText(position!);
  await expect(page.locator('.ds-selection-description')).toHaveText(selected);
  await page.getByRole('button', { name: 'Create share link', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('position')).toHaveText(position!);
  await expect(page.locator('.ds-selection-description')).toHaveText(selected);
  expect(rowCounts.length).toBeGreaterThan(0);
  expect(Math.max(...rowCounts)).toBeLessThanOrEqual(256);
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('http-desktop.png'), fullPage: true });
});

test('HTTP controls and search guidance fit a narrow viewport', async ({ page }, testInfo) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/http.html');
  await expect(page.locator('[data-status="ready"]').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('http-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Find slow events', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Jump to a location' });
  await expect(dialog.getByRole('textbox')).toBeFocused();
  await dialog.getByText('Searchable fields', { exact: true }).click();
  await expect(dialog.getByText('duration', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('matching row');
  await page.screenshot({ path: testInfo.outputPath('http-mobile-search.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Find slow events', exact: true })).toBeFocused();
  const builtInSearch = page.getByRole('button', { name: /Go to…/ });
  await builtInSearch.click();
  await expect(dialog.getByRole('textbox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(builtInSearch).toBeFocused();
});

test('failed range summaries retry without changing the selected range', async ({ page }) => {
  let fail = true;
  await page.route('**/__granum-grid/trace/aggregates?*', async (route) => {
    if (fail && new URL(route.request().url()).searchParams.get('buckets') === '1') {
      fail = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporary summary failure' }),
      });
    } else await route.continue();
  });
  await page.goto('/http.html');
  await expect(page.locator('[data-status="ready"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Select nearby events', exact: true }).click();
  await page.getByText('Show summary', { exact: true }).click();
  await expect(page.getByText('Error: Temporary summary failure', { exact: true })).toBeVisible();
  const selected = (await page.locator('.ds-selection-description').textContent())!;
  await page.getByRole('button', { name: 'Retry summary', exact: true }).click();
  await expect(page.getByText('Exact summary', { exact: true })).toBeVisible();
  await expect(page.locator('.ds-selection-description')).toHaveText(selected);
});

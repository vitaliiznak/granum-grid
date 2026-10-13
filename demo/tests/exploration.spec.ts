import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?dataset=signal');
  await expect(page.getByRole('button', { name: 'Spike 3', exact: true })).toBeVisible();
});

test('range summaries, linked comparison, saved views and dialog focus', async ({ page }) => {
  await page.getByRole('button', { name: 'Select rows', exact: true }).click();
  await expect(page.getByLabel('From row', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Enter row numbers', exact: false }).click();
  await page.getByLabel('From row', { exact: true }).fill('1000000');
  await page.getByLabel('To row', { exact: true }).fill('1000100');
  await page.getByRole('button', { name: 'Use these rows', exact: true }).click();
  const selected = page.getByRole('region', { name: 'Your selection' });
  await expect(selected).toContainText('101 rows selected');
  await expect(page.getByLabel('From row', { exact: true })).toHaveCount(0);
  await expect(selected.getByRole('button', { name: 'View selection' })).toBeFocused();
  await expect(page.getByText('Estimated summary', { exact: true })).toHaveCount(0);
  await selected.getByText('Show summary', { exact: true }).click();
  await expect(selected.getByText('Estimated summary', { exact: true })).toBeVisible();
  await selected.getByRole('button', { name: 'Save view', exact: true }).click();
  await expect(page.getByLabel('View name')).toBeFocused();
  await page.getByLabel('View name').fill('Sample A');
  await page.getByRole('button', { name: 'Save view', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved “Sample A”');
  await page.getByRole('button', { name: 'Compare ranges', exact: true }).click();
  const setup = page.getByRole('region', { name: 'Range comparison' });
  await expect(setup).toBeFocused();
  await expect(setup.getByRole('group', { name: 'First range', exact: true })).toContainText(
    '1,000,000',
  );
  await expect(setup.getByRole('button', { name: 'Show comparison' })).toBeDisabled();
  await setup.getByRole('button', { name: 'Choose second range', exact: true }).click();
  await setup.getByRole('button', { name: /^Draw on map/ }).click();
  await expect(page.getByRole('button', { name: 'Cancel map selection' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(setup).toBeFocused();
  await setup.getByRole('button', { name: 'Choose second range', exact: true }).click();
  await setup.getByRole('button', { name: /^Enter row numbers/ }).click();
  await expect(page.getByLabel('From row', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Use these rows', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already your first range');
  await page.getByLabel('From row', { exact: true }).fill('61700000');
  await page.getByLabel('To row', { exact: true }).fill('61700100');
  await page.getByRole('button', { name: 'Use these rows', exact: true }).click();
  await expect(setup.getByRole('group', { name: 'First range', exact: true })).toContainText(
    '1,000,000',
  );
  await expect(setup.getByRole('group', { name: 'Second range', exact: true })).toContainText(
    '61,700,000',
  );
  const compare = page.getByRole('button', { name: 'Show comparison', exact: true });
  await expect(compare).toBeFocused();
  await compare.click();
  const dialog = page.getByRole('dialog', { name: 'Compare selected ranges' });
  const a = dialog.getByRole('grid', { name: 'First range rows' });
  const b = dialog.getByRole('grid', { name: 'Second range rows' });
  await expect(a.locator('[data-status=ready]').first()).toContainText('1,000,000');
  await expect(b.locator('[data-status=ready]').first()).toContainText('61,700,000');
  await expect(dialog.getByText('Estimated summary', { exact: true })).toHaveCount(2);
  await expect(dialog.locator('.ds-legend').first()).toContainText('exact overview');
  await expect(dialog.locator('.ds-meta-error')).toHaveCount(0);
  await a.dispatchEvent('wheel', { deltaY: 320, deltaMode: 0 });
  await expect(a.locator('[role=row]').first()).toHaveAttribute('aria-rowindex', '7');
  await expect(b.locator('[role=row]').first()).toHaveAttribute('aria-rowindex', '7');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(compare).toBeFocused();
  await setup.getByRole('button', { name: 'Cancel comparison' }).click();
  await expect(setup).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change selection' })).toBeFocused();
  await page.reload();
  await page.getByRole('button', { name: /^Saved views/ }).click();
  await page.getByRole('button', { name: /^Sample A/ }).click();
  await expect(selected).toContainText('Rows 1,000,000–1,000,100');
  await page.getByRole('button', { name: 'Change selection' }).click();
  await page.getByRole('button', { name: /^Enter row numbers/ }).click();
  await expect(page.getByLabel('From row', { exact: true })).toHaveValue('1000000');
  await expect(page.getByLabel('To row', { exact: true })).toHaveValue('1000100');
});

test('selection choices, validation and single-row summary stay contextual on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Select rows', exact: true }).click();
  await page.getByRole('button', { name: /^Rows on screen/ }).click();
  const selected = page.getByRole('region', { name: 'Your selection' });
  await expect(selected).toContainText('selected');
  const original = await selected.textContent();
  await page.getByRole('button', { name: 'Change selection' }).click();
  await page.getByRole('button', { name: /^Enter row numbers/ }).click();
  await page.getByLabel('From row', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Use these rows', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter whole row numbers');
  await page.keyboard.press('Escape');
  await expect(selected).toHaveText(original!);
  await page.getByRole('button', { name: 'Change selection' }).click();
  await page.getByRole('button', { name: /^Enter row numbers/ }).click();
  await page.getByLabel('From row', { exact: true }).fill('1');
  await page.getByLabel('To row', { exact: true }).fill('1');
  await expect(page.getByText('1 row in this selection', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use these rows', exact: true }).click();
  await expect(selected.getByText('1 row selected', { exact: true })).toBeVisible();
  await expect(selected.getByRole('button', { name: 'Open row' })).toBeFocused();
  await selected.getByText('Show summary', { exact: true }).click();
  await expect(selected.getByText('Value', { exact: true })).toBeVisible();
  await expect(selected.getByText('Lowest', { exact: true })).toHaveCount(0);
  await expect(selected.getByText('Highest', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await selected.getByRole('button', { name: 'Open row' }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 100,000,000');
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(selected).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select rows', exact: true })).toBeFocused();
});

test('separate tab keeps native scrolling and the map in sync and fits a phone', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Try row 73,500,000' }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 73,500,000 of 100,000,000');
  const opened = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open full page' }).click();
  const popup = await opened;
  try {
    await expect(popup.getByTestId('position')).toHaveText('Row 73,500,000 of 100,000,000');
    await expect(popup.locator('[data-ds-root]')).toHaveCSS('position', 'fixed');
    const nativeProgress = () =>
      popup.evaluate(() => scrollY / (document.documentElement.scrollHeight - innerHeight));
    await expect.poll(nativeProgress).toBeCloseTo(0.735, 5);
    await popup.getByRole('grid').hover();
    await popup.mouse.wheel(0, 400);
    await expect(popup.getByTestId('position')).toHaveText('Row 73,500,010 of 100,000,000');
    await expect.poll(() => popup.url()).toContain('73500009');
    await popup.reload();
    await expect(popup.getByTestId('position')).toHaveText('Row 73,500,010 of 100,000,000');
    await expect.poll(nativeProgress).toBeCloseTo(0.735, 5);
    // Native scrollbar offsets address the whole dataset, including its middle.
    await popup.evaluate(() =>
      window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2),
    );
    await expect(popup.getByTestId('position')).toHaveText('Row 50,000,000 of 100,000,000');
    await expect(popup.getByRole('slider', { name: 'Dataset position' })).toHaveAttribute(
      'aria-valuenow',
      '50000000',
    );
    await popup.locator('.ds-map-axis-heading').hover();
    await popup.mouse.wheel(0, 400);
    await expect(popup.getByTestId('position')).toHaveText('Row 50,000,010 of 100,000,000');
    // Scrubbing the map updates the native scrollbar in the reverse direction.
    const track = (await popup.locator('.ds-track').boundingBox())!;
    await popup.keyboard.down('Shift');
    await popup.mouse.move(track.x + track.width / 2, track.y + track.height / 2);
    await popup.mouse.down();
    await popup.mouse.move(track.x + track.width / 2, track.y + track.height * 0.8, { steps: 4 });
    await popup.mouse.up();
    await popup.keyboard.up('Shift');
    await expect.poll(nativeProgress).toBeCloseTo(0.8, 2);
    await popup.getByRole('grid').press('End');
    await expect(popup.getByTestId('position')).toHaveText('Row 100,000,000 of 100,000,000');
    await expect.poll(nativeProgress).toBe(1);
    await popup.getByRole('grid').hover();
    await popup.mouse.wheel(0, -120);
    await expect(popup.getByTestId('position')).toHaveText('Row 99,999,997 of 100,000,000');
    await popup.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        popup
          .locator('[data-ds-root]')
          .evaluate((e) => Math.abs(e.getBoundingClientRect().height - innerHeight)),
      )
      .toBeLessThan(1);
    expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(popup.getByRole('combobox', { name: 'View', exact: true })).toBeVisible();
  } finally {
    await popup.close();
  }
});

test('map selection can be canceled and optional channel tracks stay bounded', async ({ page }) => {
  await page.getByRole('button', { name: 'Select rows', exact: true }).click();
  await page.getByRole('button', { name: /^Draw on map/ }).click();
  const rect = (await page.locator('.ds-track').boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * 0.5, { steps: 3 });
  await expect(page.locator('.ds-map-selection')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.ds-map-selection')).toHaveCount(0);
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 100,000,000');
  await page.getByRole('button', { name: 'Map settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show channel tracks' }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.ds-overview-tracks canvas')).toHaveCount(4);
});

test('live append follows the end, preserves a reader and resumes explicitly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByText('Try a live feed', { exact: false }).first().click();
  const grid = page.getByRole('grid', { name: 'Live example events' });
  await expect(grid.locator('[aria-rowindex="200"]')).toHaveAttribute('data-status', 'ready');
  await page.getByRole('button', { name: 'Start events', exact: true }).click();
  await expect(grid.locator('[aria-rowindex="205"]')).toHaveAttribute('data-status', 'ready');
  await grid.press('Home');
  await expect(page.locator('.ds-live-status')).toContainText('new rows');
  await page.getByRole('button', { name: 'Pause events', exact: true }).click();
  await expect(grid.locator('[role=row]').first()).toHaveAttribute('aria-rowindex', '1');
  const count = await grid.getAttribute('aria-rowcount');
  await page.getByRole('button', { name: 'Jump to latest', exact: true }).click();
  await expect(grid.locator(`[aria-rowindex="${count}"]`)).toHaveAttribute('data-status', 'ready');
  await expect(page.locator('.ds-live-status')).toContainText('up to date');
  expect(errors).toEqual([]);
});
test('a shared full-page link restores its selected range', async ({ page }) => {
  const view = {
    version: 1,
    dataset: 'signal-observatory',
    revision: '1',
    location: { position: 999_999, view: 'rows', rowsPerPixel: 1 / 32 },
    selection: { start: 999_999, end: 1_000_100 },
  };
  await page.goto(`/?page=1&dataset=signal#view=${encodeURIComponent(JSON.stringify(view))}`);
  await page.getByRole('button', { name: 'Change selection', exact: true }).click();
  await page.getByRole('button', { name: /^Enter row numbers/ }).click();
  await expect(page.getByLabel('From row', { exact: true })).toHaveValue('1000000');
  await expect(page.getByLabel('To row', { exact: true })).toHaveValue('1000100');
});

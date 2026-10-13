import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?dataset=signal');
  await expect(page.getByRole('button', { name: 'Spike 3', exact: true })).toBeVisible();
});

test('range summaries, linked comparison, bookmarks and dialog focus', async ({ page }) => {
  await page.getByRole('button', { name: /^Explore/ }).click();
  await page.getByLabel('First row', { exact: true }).fill('1000000');
  await page.getByLabel('Last row', { exact: true }).fill('1000100');
  await page.getByRole('button', { name: 'Select range', exact: true }).click();
  await expect(page.getByText('Estimated summary', { exact: true })).toBeVisible();
  await page.getByLabel('Bookmark name').fill('Sample A');
  await page.getByRole('button', { name: 'Save bookmark', exact: true }).click();
  await page.getByRole('button', { name: 'Use as comparison A', exact: true }).click();
  await page.getByLabel('First row', { exact: true }).fill('61700000');
  await page.getByLabel('Last row', { exact: true }).fill('61700100');
  await page.getByRole('button', { name: 'Select range', exact: true }).click();
  const compare = page.getByRole('button', { name: 'Compare A with selection', exact: true });
  await compare.click();
  const dialog = page.getByRole('dialog', { name: 'Compare selected ranges' });
  const a = dialog.getByRole('grid', { name: 'Range A rows' });
  const b = dialog.getByRole('grid', { name: 'Range B rows' });
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
  await page.reload();
  await page.getByRole('button', { name: /^Explore/ }).click();
  await page.getByRole('button', { name: 'Sample A', exact: true }).click();
  await expect(page.getByLabel('First row', { exact: true })).toHaveValue('1000000');
  await expect(page.getByLabel('Last row', { exact: true })).toHaveValue('1000100');
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
  await page.getByRole('button', { name: /^Explore/ }).click();
  await page.getByRole('button', { name: 'Select on map', exact: true }).click();
  const rect = (await page.locator('.ds-track').boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * 0.5, { steps: 3 });
  await expect(page.locator('.ds-map-selection')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.ds-map-selection')).toHaveCount(0);
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 100,000,000');
  await page.getByText('Map settings', { exact: false }).first().click();
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
  await page.getByRole('button', { name: /^Explore · range selected/ }).click();
  await expect(page.getByLabel('First row', { exact: true })).toHaveValue('1000000');
  await expect(page.getByLabel('Last row', { exact: true })).toHaveValue('1000100');
});

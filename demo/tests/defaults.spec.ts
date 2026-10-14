import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures';

/** Real wheel input over the grid; the browser scrolls whatever is under the pointer. */
async function wheelOver(grid: Locator, deltaY: number) {
  await grid.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const box = (await grid.boundingBox())!;
  await grid.page().mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await grid.page().mouse.wheel(0, deltaY);
}

test('three props render rows and the map, and an embedded explorer stops at its ends', async ({
  page,
  pageErrors,
}) => {
  await page.goto('/tutorials.html?lesson=sensors');
  const lesson = page.getByRole('region', { name: 'Sensor lesson' });
  const grid = lesson.getByRole('grid', { name: 'Sensor readings' });
  await expect(grid.locator('[data-status="ready"]').first()).toBeVisible();
  await expect(lesson.locator('[data-ds-part="rail"]')).toBeVisible();
  for (const part of ['toolbar', 'header', 'footer'])
    await expect(lesson.locator(`[data-ds-part="${part}"]`)).toHaveCount(0);
  // The Go to dialog stays available from the keyboard without the toolbar.
  await grid.focus();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog', { name: 'Jump to a location' })).toBeVisible();
  await page.keyboard.press('Escape');
  // The viewport is a native scroller: at the first row, scrolling up moves nothing.
  await wheelOver(grid, -400);
  await page.waitForTimeout(200);
  expect(await grid.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(grid.locator('[aria-rowindex="1"]')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('the playground opts back into the toolbar and footer', async ({ page }) => {
  await page.goto('/?dataset=signal');
  const grid = page.getByRole('grid');
  await expect(grid.locator('[data-status="ready"]').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to previous location' })).toBeVisible();
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 100,000,000');
  // 400 pixels of wheel are exactly ten 40-pixel rows.
  await wheelOver(grid, 400);
  await expect(page.getByTestId('position')).toHaveText('Row 11 of 100,000,000');
});

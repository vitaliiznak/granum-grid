import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Dispatch one wheel gesture that moves rows down, then pushes past the first row, and
 * return the largest rubber-band offset the rows showed over the next frames.
 */
function pushPastTop(grid: Locator) {
  return grid.evaluate(async (element) => {
    const layer = element.querySelector<HTMLElement>('.ds-pan-layer')!;
    for (const deltaY of [100, -1000, -100])
      element.dispatchEvent(new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true }));
    let largest = 0;
    for (let frame = 0; frame < 6; frame++) {
      await new Promise(requestAnimationFrame);
      const offset = Number(/translateY\((-?[\d.]+)px\)/.exec(layer.style.transform)?.[1] ?? 0);
      largest = Math.max(largest, Math.abs(offset));
    }
    return largest;
  });
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
  expect(await pushPastTop(grid)).toBe(0);
  await expect(grid.locator('[aria-rowindex="1"]')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('the playground opts back into the toolbar, footer, and elastic edges', async ({ page }) => {
  await page.goto('/?dataset=signal');
  const grid = page.getByRole('grid');
  await expect(grid.locator('[data-status="ready"]').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to previous location' })).toBeVisible();
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 100,000,000');
  expect(await pushPastTop(grid)).toBeGreaterThan(1);
});

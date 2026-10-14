import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Press a map's track at a share of its height and release without moving: a jump. */
async function jumpOnMap(page: Page, slider: Locator, share: number) {
  const track = slider.locator('xpath=..');
  await track.scrollIntoViewIfNeeded();
  const box = (await track.boundingBox())!;
  await page.mouse.click(box.x + box.width / 3, box.y + box.height * share);
}

test('one map drives Granum, TanStack Virtual, and a plain list, with no React', async ({
  page,
  pageErrors,
}) => {
  await page.goto('/scrollers.html');
  const granum = page.getByRole('slider', { name: 'Granum position' });
  const tanstack = page.getByRole('slider', { name: 'TanStack position' });
  const plain = page.getByRole('slider', { name: 'Plain list position' });
  await expect(
    page.getByRole('grid', { name: 'Granum rows' }).locator('[data-status=ready]').first(),
  ).toBeVisible();

  // A click halfway down each map scrolls its own scroller to the middle.
  for (const [slider, total] of [
    [granum, 4_000_000_000],
    [tanstack, 500_000],
    [plain, 10_000],
  ] as const) {
    await jumpOnMap(page, slider, 0.5);
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuenow')) / total)
      .toBeGreaterThan(0.45);
    expect(Number(await slider.getAttribute('aria-valuenow')) / total).toBeLessThan(0.55);
  }
  // The rows the scrollers show follow: TanStack renders the row its map reports.
  const middle = Number(await tanstack.getAttribute('aria-valuenow'));
  await expect(page.getByRole('list', { name: 'TanStack rows' })).toContainText(
    `${middle.toLocaleString('en-US')} ·`,
  );

  // The same precise drag as the React map: far to the side, a drag moves at 1/20 speed.
  await plain.locator('xpath=..').scrollIntoViewIfNeeded();
  const plainTrack = (await plain.locator('xpath=..').boundingBox())!;
  const x = plainTrack.x + plainTrack.width / 3,
    y = plainTrack.y + plainTrack.height / 2;
  await page.keyboard.down('Shift');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 250, y);
  const start = Number(await plain.getAttribute('aria-valuenow'));
  await page.mouse.move(x - 250, y + plainTrack.height / 10);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  // A tenth of the track at full speed would be 1,000 rows; at 1/20 it is about 50.
  await expect
    .poll(async () => Number(await plain.getAttribute('aria-valuenow')) - start)
    .toBeGreaterThan(30);
  expect(Number(await plain.getAttribute('aria-valuenow')) - start).toBeLessThan(80);

  // A marker click goes to its row; keys on the map's slider reach the end.
  await page.getByRole('button', { name: 'Burst 3' }).nth(2).click();
  await expect.poll(async () => Number(await plain.getAttribute('aria-valuenow'))).toBe(8300);
  await tanstack.focus();
  await page.keyboard.press('End');
  await expect
    .poll(async () => Number(await tanstack.getAttribute('aria-valuenow')))
    .toBeGreaterThan(499_980);

  // Scrolling a scroller moves its map: the plain list scrolls natively.
  await page
    .getByRole('list', { name: 'Plain rows' })
    .evaluate((element) => (element.scrollTop = 0));
  await expect(plain).toHaveAttribute('aria-valuenow', '1');

  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name),
  );
  expect(
    resources.filter((name) => /react/i.test(name) && !name.endsWith('/@react-refresh')),
  ).toEqual([]);
  expect(pageErrors).toEqual([]);
});

import { expect, test } from './fixtures';

test('mount() runs the explorer without a framework: jumps, history, keys, and native scrolling', async ({
  page,
  pageErrors,
}) => {
  await page.goto('/vanilla.html');
  const grid = page.getByRole('grid', { name: 'Readings without a framework' });
  await expect(grid.locator('[aria-rowindex="1"]')).toHaveAttribute('data-status', 'ready');
  await expect(grid).toHaveAttribute('aria-rowcount', '1000000000');
  const position = page.getByTestId('position');

  // The plain form calls the same handle React's apiRef exposes.
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(position).toHaveText('Row 750,000,000 of 1,000,000,000');
  await expect(grid.locator('[aria-rowindex="750000000"]')).toHaveAttribute('data-status', 'ready');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(position).toHaveText('Row 1 of 1,000,000,000');

  // Keys and the native scroller work as in the React component.
  await grid.focus();
  await page.keyboard.press('End');
  await expect(position).toHaveText('Row 1,000,000,000 of 1,000,000,000');
  await expect(grid.locator('[aria-rowindex="1000000000"]')).toBeVisible();
  await page.keyboard.press('Home');
  await expect(position).toHaveText('Row 1 of 1,000,000,000');
  await grid.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const box = (await grid.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // 320 pixels of wheel are ten 32-pixel rows.
  await page.mouse.wheel(0, 320);
  await expect(position).toHaveText('Row 11 of 1,000,000,000');
  expect(await grid.locator('[role=row]').count()).toBeLessThan(80);

  // No React in this page: the bundle never asked for it. (In development Vite's React
  // plugin injects its refresh preamble into every page; it is not this page's code.)
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name),
  );
  expect(
    resources.filter((name) => /react/i.test(name) && !name.endsWith('/@react-refresh')),
  ).toEqual([]);
  expect(pageErrors).toEqual([]);
});

import { expect, test, DESKTOP, MOBILE, fitsViewportWidth } from './fixtures';

test('bucket sizes, drill-down and Back keep their boundaries explicit', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/?dataset=signal');
  await expect(page.locator('[data-status="ready"]').first()).toBeVisible();
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('zoom');
  await page.getByRole('button', { name: 'Fit dataset', exact: true }).click();
  const buckets = page.locator('[data-ds-part="aggregate"]');
  await expect(buckets.first()).toBeVisible();
  const size = page.getByRole('combobox', { name: 'Group size' });
  await size.selectOption('10000');
  await expect(buckets.first().locator('.ds-summary-meta')).toContainText('10,000 rows');
  const range = async () =>
    buckets.evaluateAll((items) =>
      items.map((item) => ({
        start: Number(item.getAttribute('data-range-start')),
        end: Number(item.getAttribute('data-range-end')),
      })),
    );
  const before = await range();
  expect(before.length).toBeGreaterThan(1);
  const target = before[1];
  await buckets.nth(1).getByRole('button', { name: 'Zoom into group', exact: true }).click();
  await expect
    .poll(async () => {
      const parts = await range();
      return (
        parts.length > 1 && parts[0].start === target.start && parts.at(-1)!.end === target.end
      );
    })
    .toBe(true);
  await expect(page.getByRole('grid')).toBeFocused();
  await page.getByRole('button', { name: 'Back to previous location', exact: true }).click();
  await expect.poll(range).toEqual(before);

  await size.selectOption('custom');
  const input = page.getByRole('spinbutton', { name: 'Rows in each group' });
  await input.fill('25000');
  await input.press('Enter');
  await expect(input).not.toBeVisible();
  await expect(size).toBeFocused();
  await expect(buckets.first().locator('.ds-summary-meta')).toContainText('25,000 rows');
  await expect(buckets.first().locator('.ds-summary-address')).toContainText('Rows');
  await expect(buckets.first()).toContainText('Average');
  const current = await range();
  await size.selectOption('custom');
  await input.fill('0');
  await input.press('Enter');
  await expect(input).toBeVisible();
  expect(await range()).toEqual(current);
  await input.press('Escape');
  await expect(size).toBeFocused();

  await page.getByRole('grid').press('Home');
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 100,000,000');
  await size.selectOption('10000');
  await expect
    .poll(async () => {
      const parts = await range();
      return (
        parts.length > 1 &&
        parts[0].start === 0 &&
        parts.every((part) => Math.abs(part.end - part.start - 10000) <= 1)
      );
    })
    .toBe(true);

  await page.setViewportSize(MOBILE);
  await expect(buckets.first()).toBeVisible();
  expect(await fitsViewportWidth(page)).toBe(true);
  const first = buckets.first();
  await expect(first.getByRole('button', { name: 'Inspect these rows' })).toBeVisible();
  expect(
    await first.evaluate((el) => {
      const content = el.querySelector('.ds-summary-content')!;
      const actions = el.querySelector('.ds-summary-actions')!;
      return actions.getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom;
    }),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});

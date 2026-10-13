import { expect, test, type Page } from '@playwright/test';

async function assertAdjacent(page: Page) {
  await expect
    .poll(async () =>
      page
        .getByRole('grid')
        .locator('[role=row]')
        .evaluateAll((rows) => {
          const rects = rows.map((row) => row.getBoundingClientRect());
          return rects
            .slice(1)
            .every((rect, index) => Math.abs(rect.top - rects[index].bottom) < 1);
        }),
    )
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('deepscroll-hints-v1', 'done'));
  await page.goto('/?dataset=signal');
  await page.getByRole('checkbox', { name: 'Dynamic row heights' }).check();
  await expect(page.getByRole('button', { name: 'Expand row 1', exact: true })).toBeVisible();
});

test('dynamic rows resize, remain adjacent, and keep the viewport anchor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const grid = page.getByRole('grid');
  const first = grid.locator('[aria-rowindex="1"]');
  await assertAdjacent(page);
  const before = await first.boundingBox();
  await page.getByRole('button', { name: 'Expand row 1', exact: true }).click();
  await expect
    .poll(async () => (await first.boundingBox())!.height)
    .toBeGreaterThan(before!.height + 30);
  await assertAdjacent(page);
  expect((await first.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 100,000,000');
  // Content may resize after rendering (for example, a loaded image).
  await first.locator('.expanded-note').evaluate((element) => {
    (element as HTMLElement).style.minHeight = '260px';
  });
  await assertAdjacent(page);
  await page.getByRole('button', { name: 'Collapse row 1', exact: true }).click();
  await assertAdjacent(page);
  await expect.poll(async () => (await first.boundingBox())!.height).toBeCloseTo(before!.height, 0);
  expect(await grid.locator('[role=row]').count()).toBeLessThan(40);
  expect(errors).toEqual([]);
});

test('distant jumps honor each alignment, auto is stable, and location restores', async ({
  page,
}) => {
  const grid = page.getByRole('grid');
  const target = grid.locator('[aria-rowindex="73500000"]');
  for (const align of ['start', 'center', 'end']) {
    await page.getByRole('combobox', { name: 'Row alignment' }).selectOption(align);
    await page.getByRole('button', { name: 'Go to row', exact: true }).click();
    await expect(target).toHaveAttribute('data-status', 'ready');
    await expect
      .poll(async () => {
        const row = (await target.boundingBox())!,
          viewport = (await grid.boundingBox())!;
        return Math.abs(
          align === 'start'
            ? row.y - viewport.y
            : align === 'center'
              ? row.y + row.height / 2 - viewport.y - viewport.height / 2
              : row.y + row.height - viewport.y - viewport.height,
        );
      })
      .toBeLessThan(1);
    await assertAdjacent(page);
  }
  const position = await page.getByTestId('position').innerText();
  await page.getByRole('combobox', { name: 'Row alignment' }).selectOption('auto');
  await page.getByRole('button', { name: 'Go to row', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText(position);
  await page.getByRole('button', { name: 'Save position', exact: true }).click();
  await grid.press('Home');
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 100,000,000');
  await page.getByRole('button', { name: 'Restore position', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText(position);
  await assertAdjacent(page);
});

test('wrapping responds to width and measured detail works in Lens and Zoom', async ({ page }) => {
  await page.getByRole('button', { name: 'Spike 3', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 61,700,000 of 100,000,000');
  const target = page.getByRole('grid').locator('[aria-rowindex="61700000"]');
  await expect(target).toHaveAttribute('data-status', 'ready');
  await assertAdjacent(page);
  const desktopHeight = (await target.boundingBox())!.height;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => (await target.boundingBox())!.height)
    .toBeGreaterThan(desktopHeight);
  await assertAdjacent(page);
  for (const view of ['Lens', 'Zoom', 'Rows']) {
    await page
      .getByRole('combobox', { name: 'View', exact: true })
      .selectOption(view.toLowerCase());
    await expect(target).toHaveAttribute('data-status', 'ready');
    await assertAdjacent(page);
    await expect(page.getByTestId('position')).toHaveText('Row 61,700,000 of 100,000,000');
  }
});

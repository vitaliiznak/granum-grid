import type { Page } from '@playwright/test';
import { expect, test, FILE_URL, MOBILE, fitsViewportWidth, serveParquet } from './fixtures';

/** The Parquet fixture opened from a pasted URL: no network, exact known values. */
async function readings(page: Page, options: { rows?: boolean } = {}) {
  await serveParquet(page, options);
  await page.goto(`/?dataset=parquet&url=${encodeURIComponent(FILE_URL)}`);
  await expect(page.getByRole('heading', { name: 'readings.parquet' })).toBeVisible();
  if (options.rows !== false)
    await expect(page.locator('[role=row][aria-rowindex="4"]')).toHaveAttribute(
      'data-status',
      'ready',
    );
}
const cell = (page: Page, row: number) =>
  page.getByRole('grid').locator(`[aria-rowindex="${row}"] .pq-cell`).first();

test('click inspects exact loaded values, copies JSON, and preserves scroll and history', async ({
  page,
  pageErrors,
}, testInfo) => {
  await page.addInitScript(() => {
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          copied = text;
        },
        readText: async () => copied,
      },
    });
  });
  await readings(page);
  const grid = page.getByRole('grid');
  const row = grid.locator('[aria-rowindex="4"]');
  const position = await page.getByTestId('position').textContent();
  // Inspecting must not move the row; bring it on screen first, as a click would.
  await row.scrollIntoViewIfNeeded();
  const top = (await row.boundingBox())!.y;
  await cell(page, 4).click();
  const panel = page.getByRole('dialog', { name: 'Row details' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Row details' })).toBeFocused();
  await expect(panel).toContainText('reading 4');
  await expect(panel).toContainText('20.3');
  await expect(panel).toContainText('2026-01-01T00:03:00.000Z');
  await expect(row).toHaveAttribute('data-focused', 'true');
  await expect(grid).toHaveAttribute('aria-activedescendant', (await row.getAttribute('id'))!);
  await expect(page.getByTestId('position')).toHaveText(position!);
  expect((await row.boundingBox())!.y).toBe(top);
  await expect(
    page.getByRole('button', { name: 'Back to previous location', exact: true }),
  ).toBeDisabled();
  await panel.getByRole('button', { name: 'Copy record' }).click();
  await expect(panel.getByRole('status')).toHaveText('Copied JSON');
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied).toMatchObject({ id: 3, label: 'reading 4', value: 20.3 });
  await page.screenshot({ path: testInfo.outputPath('inspection-desktop.png') });
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  await expect(grid).toBeFocused();
  await grid.press('Enter');
  await expect(panel).toContainText('reading 4');
  await panel.getByRole('button', { name: 'Close row details' }).click();
  await expect(grid).toBeFocused();
  await grid.press('ArrowDown');
  await grid.press('Enter');
  await expect(panel).toContainText('reading 5');
  await expect(page.getByTestId('position')).toHaveText(position!);
  expect(pageErrors).toEqual([]);
});

test('a clipboard failure and dataset changes stay explicit', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Clipboard denied');
        },
      },
    }),
  );
  await readings(page);
  const grid = page.getByRole('grid');
  const panel = page.getByRole('dialog', { name: 'Row details' });
  await cell(page, 2).click();
  await expect(panel).toContainText('reading 2');
  await panel.getByRole('button', { name: 'Copy record' }).click();
  await expect(panel.getByRole('status')).toHaveText('Could not copy. Try again.');
  // The open panel covers part of the gallery, and how much depends on the fonts; the
  // keyboard reaches the card wherever it sits.
  const logs = page.getByRole('button', { name: /Server logs/ });
  await logs.press('Enter');
  await expect(logs).toHaveAttribute('aria-pressed', 'true');
  await expect(panel).not.toBeVisible();
  await page.getByRole('button', { name: /Web pages \(Parquet\)/ }).click();
  await expect(page.getByRole('heading', { name: 'readings.parquet' })).toBeVisible();
  await expect(panel).not.toBeVisible();
  await expect(grid.locator('[aria-rowindex="1"]')).toHaveAttribute('data-focused', 'true');
});

test('controls, text selection, and modified activation retain their own behavior', async ({
  page,
}) => {
  await readings(page);
  const grid = page.getByRole('grid');
  const row = grid.locator('[aria-rowindex="4"]');
  const panel = page.getByRole('dialog', { name: 'Row details' });
  await row.evaluate((element) => {
    const span = document.createElement('span');
    span.innerHTML =
      '<button>Row action</button><input aria-label="Row note"><span role="button" tabindex="0">Custom action</span><span contenteditable="true">Editable note</span>';
    element.prepend(span);
  });
  for (const control of [
    page.getByRole('button', { name: 'Row action' }),
    page.getByRole('textbox', { name: 'Row note' }),
    page.getByRole('button', { name: 'Custom action' }),
    page.getByText('Editable note', { exact: true }),
  ]) {
    await control.click();
    await control.press('Enter');
    await expect(panel).not.toBeVisible();
  }
  await cell(page, 4).click({ modifiers: ['Shift'] });
  await grid.press('Control+Enter');
  await expect(panel).not.toBeVisible();
  await cell(page, 4).evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(panel).not.toBeVisible();
});

test('loading rows cannot be inspected', async ({ page }) => {
  await readings(page, { rows: false });
  const grid = page.getByRole('grid');
  await expect(grid.locator('[aria-rowindex="4"]')).toHaveAttribute('data-status', 'loading');
  await grid.locator('[aria-rowindex="4"]').click();
  await grid.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Row details' })).not.toBeVisible();
  await expect(grid.locator('[data-activatable]')).toHaveCount(0);
});

test('dark mobile inspection fits and closes without moving the document', async ({
  page,
}, testInfo) => {
  await page.setViewportSize(MOBILE);
  await readings(page);
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  const row = page.getByRole('grid').locator('[aria-rowindex="4"]');
  await row.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  await cell(page, 4).click();
  const panel = page.getByRole('dialog', { name: 'Row details' });
  await expect(panel).toBeVisible();
  expect(await fitsViewportWidth(page)).toBe(true);
  await panel.getByRole('button', { name: 'Copy record' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('inspection-mobile-dark.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('grid')).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
});

test.describe('touch', () => {
  test.use({ hasTouch: true });
  test('a tap inspects but a pan does not', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Synthetic touch pan uses Chromium CDP.');
    await page.setViewportSize(MOBILE);
    await readings(page);
    const row = page.getByRole('grid').locator('[aria-rowindex="4"]');
    await cell(page, 4).tap();
    const panel = page.getByRole('dialog', { name: 'Row details' });
    await expect(panel).toContainText('reading 4');
    await panel.getByRole('button', { name: 'Close row details' }).tap();
    const rect = (await row.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 100, y: rect.y + 15 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 100, y: rect.y - 65 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await cdp.detach();
    }
    await expect(panel).not.toBeVisible();
  });
});

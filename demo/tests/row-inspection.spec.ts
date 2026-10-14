import type { Page } from '@playwright/test';
import { expect, test, MOBILE, fitsViewportWidth } from './fixtures';

const FIRST_SECOND = 1_502_942_428_000;

/** Deterministic candles: no network dependency, with zero-trade and missing seconds. */
async function bitcoin(page: Page, pageMode = false) {
  await page.route('https://data-api.binance.vision/**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const start = Number(params.get('startTime'));
    const candles =
      params.get('interval') === '1s'
        ? Array.from({ length: Number(params.get('limit')) }, (_, i) => {
            const time = start + i * 1000;
            const zero = time === FIRST_SECOND + 1000;
            return [
              time,
              '4261.48123456',
              '4262.12345678',
              '4260.12345678',
              '4261.98765432',
              zero ? '0' : '1.12345678',
              time + 999,
              zero ? '0' : '4788.98765432',
              zero ? 0 : 3,
              zero ? '0' : '0.12345678',
            ];
          }).filter((candle) => candle[0] !== FIRST_SECOND + 2000)
        : [];
    await route.fulfill({ json: candles });
  });
  await page.goto(`/?dataset=bitcoin${pageMode ? '&page=1' : ''}`);
  await expect(page.locator('[role=row][aria-rowindex="4"]')).toHaveAttribute(
    'data-status',
    'ready',
  );
}

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
  await bitcoin(page, true);
  const grid = page.getByRole('grid');
  const row = grid.locator('[aria-rowindex="4"]');
  const position = await page.getByTestId('position').textContent();
  const top = (await row.boundingBox())!.y;
  await row.locator('.bt-close').click();
  const panel = page.getByRole('dialog', { name: 'Row details' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Row details' })).toBeFocused();
  await expect(panel).toContainText('2017-08-17 04:00:31 UTC');
  await expect(panel).toContainText('4261.98765432');
  await expect(panel).toContainText('1.12345678');
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
  expect(copied).toMatchObject({
    time: FIRST_SECOND + 3000,
    close: 4261.98765432,
    missing: false,
    takerBuyVolume: 0.12345678,
  });
  await page.screenshot({ path: testInfo.outputPath('inspection-desktop.png') });
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  await expect(grid).toBeFocused();
  await grid.press('Enter');
  await expect(panel).toContainText('2017-08-17 04:00:31 UTC');
  await panel.getByRole('button', { name: 'Close row details' }).click();
  await expect(grid).toBeFocused();
  await grid.press('ArrowDown');
  await grid.press('Enter');
  await expect(panel).toContainText('2017-08-17 04:00:32 UTC');
  await expect(page.getByTestId('position')).toHaveText(position!);
  expect(pageErrors).toEqual([]);
});

test('missing candles, zero trades, clipboard failure, and dataset changes stay explicit', async ({
  page,
}) => {
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
  await bitcoin(page);
  const grid = page.getByRole('grid');
  const panel = page.getByRole('dialog', { name: 'Row details' });
  await grid.locator('[aria-rowindex="2"] .bt-close').click();
  await expect(panel).toContainText('No trades occurred in this second.');
  await panel.getByRole('button', { name: 'Copy record' }).click();
  await expect(panel.getByRole('status')).toHaveText('Could not copy. Try again.');
  await grid.locator('[aria-rowindex="3"] .bt-time').click();
  await expect(panel).toContainText('No candle published for this second. Values are unavailable.');
  await expect(panel.locator('.candle-details')).toHaveCount(0);
  await expect(panel.getByRole('status')).toHaveText('Candle data as JSON');
  await page.getByRole('button', { name: /Server logs/ }).click();
  await expect(panel).not.toBeVisible();
  await page.getByRole('button', { name: /Bitcoin \(live\)/ }).click();
  await expect(panel).not.toBeVisible();
  await expect(grid.locator('[aria-rowindex="1"]')).toHaveAttribute('data-focused', 'true');
});

test('controls, text selection, and modified activation retain their own behavior', async ({
  page,
}) => {
  await bitcoin(page, true);
  const grid = page.getByRole('grid');
  const row = grid.locator('[aria-rowindex="4"]');
  const panel = page.getByRole('dialog', { name: 'Row details' });
  await row.evaluate((element) => {
    const cell = document.createElement('span');
    cell.innerHTML =
      '<button>Row action</button><input aria-label="Row note"><span role="button" tabindex="0">Custom action</span><span contenteditable="true">Editable note</span>';
    element.prepend(cell);
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
  await row.locator('.bt-close').click({ modifiers: ['Shift'] });
  await grid.press('Control+Enter');
  await expect(panel).not.toBeVisible();
  await row.locator('.bt-close').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(panel).not.toBeVisible();
});

test('loading rows cannot be inspected', async ({ page }) => {
  await page.route('https://data-api.binance.vision/**', (route) => route.abort());
  await page.goto('/?dataset=bitcoin&page=1');
  const grid = page.getByRole('grid');
  await grid.locator('[aria-rowindex="4"]').click();
  await grid.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Row details' })).not.toBeVisible();
  await expect(grid.locator('[data-activatable]')).toHaveCount(0);
});

test('dark mobile inspection fits and closes without moving the document', async ({
  page,
}, testInfo) => {
  await page.setViewportSize(MOBILE);
  await bitcoin(page);
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  const row = page.getByRole('grid').locator('[aria-rowindex="4"]');
  await row.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  await row.locator('.bt-close').click();
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
    await bitcoin(page, true);
    const row = page.getByRole('grid').locator('[aria-rowindex="4"]');
    await row.locator('.bt-close').tap();
    const panel = page.getByRole('dialog', { name: 'Row details' });
    await expect(panel).toContainText('2017-08-17 04:00:31 UTC');
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

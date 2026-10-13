import type { Page } from '@playwright/test';
import { expect, test, MOBILE } from './fixtures';

async function openLogSearch(page: Page) {
  await page.goto('/?dataset=logs');
  await expect(page.locator('[role="row"][data-status="ready"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Go to…' }).click();
}

test('auth searches log rows separately from named markers and keyboard navigation lands on a match', async ({
  page,
}, testInfo) => {
  await openLogSearch(page);
  const dialog = page.getByRole('dialog', { name: 'Jump to a location' });
  const input = dialog.getByRole('textbox');
  const origin = await page.getByTestId('position').innerText();
  await input.fill('  AuTh  ');
  await expect(dialog.getByRole('status')).toContainText(
    'Partial results · 100 matching rows · 2 named markers',
  );
  await expect(dialog.getByRole('status')).toContainText('not an exhaustive search');
  await expect(dialog.locator('.ds-jump-results button')).toHaveCount(102);
  await expect(dialog.getByText('Named markers · 2', { exact: true })).toBeAttached();
  await expect(page.getByTestId('position')).toHaveText(origin);
  await page.screenshot({ path: testInfo.outputPath('auth-search-desktop.png') });
  await dialog.locator('.ds-jump-results button').first().hover();
  for (let i = 0; i < 12; i++) await input.press('ArrowDown');
  const selected = dialog.locator('.ds-jump-results .selected');
  await expect(selected).toHaveCount(1);
  await expect(dialog.locator('.ds-jump-results button').nth(12)).toHaveClass('ds-button selected');
  const target = await selected.locator('small').innerText();
  expect(
    await selected.evaluate((button) => {
      const list = button.closest('.ds-jump-results')!.getBoundingClientRect();
      const rect = button.getBoundingClientRect();
      return rect.top >= list.top - 1 && rect.bottom <= list.bottom + 1;
    }),
  ).toBe(true);
  await input.press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId('position')).toHaveText(
    `${target.replace(' ↵', '')} of 4,000,000,000`,
  );
  await expect(page.locator('.ds-row[data-focused] .lg-service')).toHaveText('auth');
  expect(await page.locator('[role="row"]').count()).toBeLessThan(150);
});

test('query replacement, empty samples, malformed predicates, and dates retain honest status', async ({
  page,
}) => {
  await openLogSearch(page);
  const dialog = page.getByRole('dialog');
  const input = dialog.getByRole('textbox');
  await input.fill('auth');
  await expect(dialog.getByRole('status')).toHaveText('Searching…');
  await input.fill('service = "payments"');
  await expect(dialog.getByRole('status')).toContainText('100 matching rows');
  await expect(dialog.locator('.ds-jump-results button')).toHaveCount(100);
  for (const label of await dialog.locator('.ds-jump-results button span').allTextContents())
    expect(label).toContain('service payments');
  await input.fill('there-is-no-such-service');
  await expect(dialog.getByRole('status')).toContainText('Partial results · 0 matching rows');
  await expect(dialog.locator('.ds-jump-results button')).toHaveCount(0);
  await input.fill('service = auth');
  await expect(dialog.getByRole('status')).toContainText('Try a row number');
  await input.fill('latency > "slow"');
  await expect(dialog.getByRole('status')).toHaveText('latency requires a number.');
  await input.fill('2026-09-31');
  await expect(dialog.getByRole('status')).toContainText('Enter a valid date');
  await input.fill('2026-09-18');
  await expect(dialog.locator('.ds-jump-results button')).toHaveCount(1);
  await input.press('Enter');
  await expect(page.locator('.ds-row[data-focused]')).toContainText('09-18');
});

test('text search stays usable on mobile and closing a search prevents stale dataset results', async ({
  page,
  pageErrors,
}, testInfo) => {
  await openLogSearch(page);
  await page.setViewportSize(MOBILE);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('connection refused');
  await expect(dialog.getByRole('status')).toContainText('matching rows');
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('log-search-mobile.png') });
  await dialog.getByRole('textbox').fill('auth');
  await dialog.getByRole('textbox').press('Escape');
  await page.getByRole('button', { name: /^Signal archive/ }).click();
  await page.getByRole('button', { name: 'Go to…' }).click();
  await dialog.getByRole('textbox').fill('north');
  await expect(dialog.getByRole('status')).toContainText('100 matching rows');
  await expect(dialog.getByRole('button', { name: /^category: North/ }).first()).toBeVisible();
  await expect(dialog.getByText('Named markers · 2')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('named marker fallback discloses its scope for a provider without text search', async ({
  page,
}) => {
  // The sensor tutorial provider supplies markers but does not opt in to row text search.
  await page.goto('/tutorials.html?lesson=sensors');
  await expect(page.locator('[role="row"][data-status="ready"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Go to…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill(' warm ');
  await expect(dialog.getByRole('status')).toContainText('Searching named markers only');
  await expect(dialog.locator('.ds-jump-results button')).toHaveCount(1);
  await expect(dialog.getByText('Named markers · 1', { exact: true })).toBeVisible();
  await dialog.getByRole('textbox').press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId('position')).toContainText('Row 721 of');
});

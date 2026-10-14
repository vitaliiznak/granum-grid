import { expect, test as base, type Locator, type Page } from '@playwright/test';

/** Phone-sized viewport for narrow-layout cases. */
export const MOBILE = { width: 390, height: 844 };
/** Desktop viewport tall enough for the expanded dataset map. */
export const DESKTOP = { width: 1440, height: 1100 };

/** Whether a page's document fits its viewport width, without horizontal scrolling. */
export function fitsViewportWidth(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
}

/** Open a demo page and wait for its first loaded row. */
export async function openDataset(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('[role="row"][data-status="ready"]').first()).toBeVisible();
}

/** Open the signal archive and wait until its markers are on the map. */
export async function openSignal(page: Page) {
  await page.goto('/?dataset=signal');
  await expect(page.getByRole('button', { name: 'Spike 3', exact: true })).toBeVisible();
}

/** Open the debug dialog, run `use` in it, then close it. */
export async function withDebug(page: Page, use: (dialog: Locator) => Promise<unknown>) {
  await page.getByRole('button', { name: 'debug', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'debug', exact: true });
  await use(dialog);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
}

/** Open the scrollbar's Config panel, run `use` in it, then choose Done. */
export async function withMapSettings(page: Page, use: (panel: Locator) => Promise<unknown>) {
  await page.getByRole('button', { name: 'Config', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Config', exact: true });
  await use(panel);
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
}

/** From an open selection menu, enter one-based row numbers and use them. */
export async function enterRows(page: Page, from: string, to?: string) {
  await page.getByRole('button', { name: /^Enter row numbers/ }).click();
  await page.getByLabel('From row', { exact: true }).fill(from);
  if (to !== undefined) await page.getByLabel('To row', { exact: true }).fill(to);
  await page.getByRole('button', { name: 'Use these rows', exact: true }).click();
}

/**
 * Uncaught page errors from the whole test, including setup. Tests that require a clean
 * run assert `expect(pageErrors).toEqual([])`.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
  },
});
export { expect };

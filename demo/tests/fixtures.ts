import { expect, test as base, type Page } from '@playwright/test';

/** Phone-sized viewport for narrow-layout cases. */
export const MOBILE = { width: 390, height: 844 };
/** Desktop viewport tall enough for the expanded dataset map. */
export const DESKTOP = { width: 1440, height: 1100 };

/** Whether a page's document fits its viewport width, without horizontal scrolling. */
export function fitsViewportWidth(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
}

/** Open the signal archive and wait until its markers are on the map. */
export async function openSignal(page: Page) {
  await page.goto('/?dataset=signal');
  await expect(page.getByRole('button', { name: 'Spike 3', exact: true })).toBeVisible();
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

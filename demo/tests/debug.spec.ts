import { expect, test, MOBILE } from './fixtures';

for (const pageMode of [false, true]) {
  test(`developer controls share one debug panel in ${pageMode ? 'full-page' : 'embedded'} layout`, async ({
    page,
  }) => {
    if (pageMode) await page.setViewportSize(MOBILE);
    await page.goto(`/?dataset=signal${pageMode ? '&page=1' : ''}`);
    const trigger = page.getByRole('button', { name: 'debug', exact: true });
    const dialog = page.getByRole('dialog', { name: 'debug', exact: true });
    const latency = page.getByRole('slider', { name: 'Simulated server latency' });
    await expect(trigger).toHaveCount(1);
    await expect(latency).toHaveCount(0);
    await expect(page.getByText('Developer tools', { exact: true })).toHaveCount(0);
    await trigger.click();
    await expect(latency).toHaveCount(1);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await latency.focus();
    await latency.press('Home');
    await latency.press('ArrowRight');
    await expect(dialog.locator('output')).toHaveText('0.04 s');
    await dialog.getByRole('checkbox', { name: 'Emulate reduced motion' }).check();
    await dialog.getByRole('checkbox', { name: 'Overview graph', exact: true }).uncheck();
    await dialog.getByRole('checkbox', { name: 'Dynamic row heights' }).check();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('complementary', { name: 'Dataset scrollbar' })).toHaveAttribute(
      'data-variant',
      'markers',
    );
    await expect(page.getByRole('button', { name: 'Expand row 1', exact: true })).toBeVisible();
    await trigger.click();
    await expect(latency).toHaveValue('40');
    await expect(dialog.getByRole('checkbox', { name: 'Emulate reduced motion' })).toBeChecked();
    await expect(dialog.getByRole('region', { name: 'Performance', exact: true })).toContainText(
      'cached rows',
    );
    await dialog.getByRole('button', { name: 'Reset defaults' }).click();
    await expect(latency).toHaveValue('1000');
    await expect(
      dialog.getByRole('checkbox', { name: 'Overview graph', exact: true }),
    ).toBeChecked();
    await expect(
      dialog.getByRole('checkbox', { name: 'Emulate reduced motion' }),
    ).not.toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'Dynamic row heights' })).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Dataset scrollbar' })).toHaveAttribute(
      'data-variant',
      'profile',
    );
  });
}

test('real sources expose debug without artificial server latency', async ({ page }) => {
  await page.goto('/?dataset=file');
  await page.getByRole('button', { name: 'debug', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'debug', exact: true });
  await expect(dialog.getByRole('slider', { name: 'Simulated server latency' })).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: 'Emulate reduced motion' })).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Performance', exact: true })).toBeVisible();
});

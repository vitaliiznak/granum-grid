import { expect, test } from './fixtures';
import { SPIKE_ROWS } from '../src/data/signal';

const spike3 = `[role=row][aria-rowindex="${SPIKE_ROWS[2] + 1}"]`;

test('the gallery switches datasets and a tour step jumps to a spike', async ({ page }) => {
  await page.goto('/?dataset=logs');
  await page.getByRole('button', { name: /^Signal archive/ }).click();
  await expect(page).toHaveURL(/dataset=signal/);
  const grid = page.getByRole('grid', { name: 'Synthetic signal readings' });
  await expect(grid.locator('[aria-rowindex="1"]')).toHaveAttribute('data-status', 'ready');
  await page.getByRole('button', { name: /Jump to spike 3/ }).click();
  await expect(page.locator(spike3)).toHaveAttribute('data-status', 'ready', { timeout: 8000 });
  await expect(page.locator('.tour-hint')).toContainText('Jump');
});

test('each dataset keeps its place while you visit another', async ({ page }) => {
  await page.goto('/?dataset=signal');
  await page.getByRole('button', { name: /Jump to spike 3/ }).click();
  const target = page.locator(spike3);
  await expect(target).toHaveAttribute('data-status', 'ready', { timeout: 8000 });
  await page.getByRole('button', { name: /^Server logs/ }).click();
  await expect(page.getByRole('grid', { name: 'Synthetic server logs' })).toBeVisible();
  await page.getByRole('button', { name: /^Signal archive/ }).click();
  await expect(target).toHaveAttribute('data-status', 'ready');
});

test('a search step types into the real jump bar', async ({ page }) => {
  await page.goto('/?dataset=logs');
  await page.getByRole('button', { name: /Find 5xx responses/ }).click();
  const input = page.getByRole('textbox', { name: 'Go to row, date, or event' });
  await expect(input).toHaveValue('status >= 500');
  await expect(page.getByRole('button', { name: /^status 50\d/ }).first()).toBeVisible();
  await input.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.gr-row[data-focused] .lg-status')).toHaveText(/^50\d$/, {
    timeout: 8000,
  });
});

test('each dataset shows how it connects, with real provider code', async ({ page }) => {
  await page.goto('/?dataset=file');
  await page.getByText('How this dataset connects', { exact: true }).click();
  await expect(page.locator('.provider-code code')).toContainText('createSqlSource');
  await expect(page.getByRole('link', { name: '@granum-grid/sql source' })).toHaveAttribute(
    'href',
    /packages\/sql\/src\/index\.ts$/,
  );
  await page.goto('/?dataset=logs');
  await page.getByText('How this dataset connects', { exact: true }).click();
  // Generated rows are not passed off as a server's: the code shows what yours would be.
  await expect(page.locator('.provider-code')).toContainText('generated in your browser');
  await expect(page.locator('.provider-code code')).toContainText('fetchRows');
});

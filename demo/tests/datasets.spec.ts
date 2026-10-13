import { expect, test } from '@playwright/test';
import { GENES } from '../src/data/genome';

const brca1 = GENES.find((gene) => gene.name === 'BRCA1')!;

test('the gallery switches datasets and a tour step flies to a gene', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Human genome/ }).click();
  await expect(page).toHaveURL(/dataset=genome/);
  const grid = page.getByRole('grid', { name: 'Synthetic genome bases' });
  await expect(grid.locator('[aria-rowindex="10001"]')).toHaveAttribute('data-status', 'ready');
  await page.getByRole('button', { name: /Fly to BRCA1/ }).click();
  await expect(grid.locator(`[aria-rowindex="${brca1.index + 1}"]`)).toContainText('BRCA1 exon 1', {
    timeout: 8000,
  });
  await expect(page.locator('.tour-hint')).toContainText('Flight');
});

test('each dataset keeps its place while you visit another', async ({ page }) => {
  await page.goto('/?dataset=genome');
  await page.getByRole('button', { name: /Fly to BRCA1/ }).click();
  const target = page.locator(`[role=row][aria-rowindex="${brca1.index + 1}"]`);
  await expect(target).toHaveAttribute('data-status', 'ready', { timeout: 8000 });
  await page.getByRole('button', { name: /^Server logs/ }).click();
  await expect(page.getByRole('grid', { name: 'Synthetic server logs' })).toBeVisible();
  await page.getByRole('button', { name: /^Human genome/ }).click();
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
  await expect(page.locator('.ds-row[data-focused] .lg-status')).toHaveText(/^50\d$/, {
    timeout: 8000,
  });
});

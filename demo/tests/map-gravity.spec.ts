import type { Page } from '@playwright/test';
import { expect, test, DESKTOP, openDataset, withDebug, withMapSettings } from './fixtures';

const total = 4_000_000_000;
// The cache-stampede summit in the log provider's 320-group overview.
const peak = 2_381_249_999;

async function trackGeometry(page: Page) {
  // Firefox's protocol boundingBox rounds the height differently from the DOM.
  // At billions of rows, that tiny difference changes the exact expected index.
  return page.locator('.ds-track').evaluate((element) => {
    const { top, height } = element.getBoundingClientRect();
    return { top, height };
  });
}

async function openMap(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDataset(page, '/?dataset=logs');
  await expect(page.locator('.ds-legend')).toContainText('sampled overview');
  await withMapSettings(page, async (panel) => {
    await panel.getByRole('combobox', { name: 'Scrollbar width' }).selectOption('expanded');
    await panel.getByRole('combobox', { name: 'Scrollbar hover details' }).selectOption('summary');
    await panel.getByRole('checkbox', { name: 'Snap to events while dragging' }).uncheck();
  });
  const track = await trackGeometry(page);
  const plot = (await page.locator('.ds-map-plot').boundingBox())!;
  return {
    x: plot.x + plot.width / 2,
    y: track.top + (peak / (total - 1)) * track.height,
    height: track.height,
    top: track.top,
  };
}

test('hover attracts to a peak without navigating; click agrees and Shift bypasses it', async ({
  page,
  pageErrors,
}, testInfo) => {
  const { x, y, height, top } = await openMap(page);
  const position = page.getByTestId('position');
  const origin = await position.innerText();
  const preview = page.locator('.ds-preview-target');
  const hover = page.locator('.ds-map-hover');
  const nearY = Math.round(y + 2);
  await page.mouse.move(x, nearY);
  await expect(hover).toHaveAttribute('data-attracted', 'true');
  await expect(preview).toHaveText((peak + 1).toLocaleString('en-US'));
  await expect(position).toHaveText(origin);
  await expect(page.locator('.ds-preview-detail')).toContainText('Snapped to peak');
  await page.screenshot({ path: testInfo.outputPath('peak-gravity.png') });

  await page.mouse.click(x, nearY);
  await expect(position).toHaveText(`Row ${(peak + 1).toLocaleString('en-US')} of 4,000,000,000`);
  await page.getByRole('button', { name: 'Back to previous location', exact: true }).click();
  await expect(position).toHaveText(origin);
  await page.keyboard.down('Shift');
  await page.mouse.move(x, nearY);
  await expect(hover).toHaveAttribute('data-attracted', 'false');
  const rawRow = Math.round(((nearY - top) / height) * (total - 1)) + 1;
  await expect(preview).toHaveText(rawRow.toLocaleString('en-US'));
  await page.mouse.click(x, nearY);
  await page.keyboard.up('Shift');
  await expect(position).toHaveText(`Row ${rawRow.toLocaleString('en-US')} of 4,000,000,000`);

  await page.mouse.move(x, y + 18);
  await expect(hover).toHaveAttribute('data-attracted', 'false');
  await withMapSettings(page, (panel) =>
    panel.getByRole('checkbox', { name: 'Attract pointer to chart peaks' }).uncheck(),
  );
  await page.mouse.move(x, nearY);
  await expect(hover).toHaveAttribute('data-attracted', 'false');
  await expect(preview).toHaveText(rawRow.toLocaleString('en-US'));
  expect(pageErrors).toEqual([]);
});

test('slow drags settle on peaks, release naturally, and preserve precision and cancellation', async ({
  page,
}) => {
  const { x, y, height, top } = await openMap(page);
  const slider = page.getByRole('slider', { name: 'Dataset position' });
  const origin = (await slider.getAttribute('aria-valuenow'))!;
  await page.mouse.move(x, y - 20);
  await page.mouse.down();
  await page.mouse.move(x, y - 2, { steps: 6 });
  await expect(slider).toHaveAttribute('aria-valuenow', String(peak + 1));
  // Horizontal precision changes must not dislodge a settled peak.
  await page.mouse.move(x - 230, y - 2);
  await expect(slider).toHaveAttribute('aria-valuenow', String(peak + 1));
  await page.mouse.move(x - 230, y + 2);
  const fineRow = Math.round(peak + ((4 * 0.05) / height) * (total - 1)) + 1;
  await expect
    .poll(async () => Math.abs(Number(await slider.getAttribute('aria-valuenow')) - fineRow))
    .toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(slider).toHaveAttribute('aria-valuenow', origin);

  await page.mouse.move(x, y - 20);
  await page.mouse.down();
  await page.mouse.move(x, y - 2, { steps: 6 });
  const releaseY = Math.round(y + 18);
  await page.mouse.move(x, releaseY, { steps: 8 });
  const rawRow = Math.round(((releaseY - top) / height) * (total - 1)) + 1;
  await expect
    .poll(async () => Math.abs(Number(await slider.getAttribute('aria-valuenow')) - rawRow))
    .toBeLessThanOrEqual(1);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Back to previous location', exact: true }).click();
  await expect(slider).toHaveAttribute('aria-valuenow', origin);
});

test('hidden profiles, disabled magnetism, and range selection bypass peak attraction', async ({
  page,
}) => {
  const { x, y } = await openMap(page);
  const hover = page.locator('.ds-map-hover');
  await withMapSettings(page, (panel) =>
    panel.getByRole('combobox', { name: 'Scrollbar display' }).selectOption('markers'),
  );
  // A hidden chart may change the track height; there must be no peak targets anywhere.
  await page.mouse.move(x, y);
  await expect(hover).toHaveAttribute('data-attracted', 'false');
  await withMapSettings(page, (panel) =>
    panel.getByRole('combobox', { name: 'Scrollbar display' }).selectOption('profile'),
  );

  await withDebug(page, (dialog) =>
    dialog.getByRole('checkbox', { name: 'Magnetic snapping' }).uncheck(),
  );
  await page.mouse.move(x, y + 2);
  await expect(hover).toHaveAttribute('data-attracted', 'false');
  await withDebug(page, (dialog) =>
    dialog.getByRole('checkbox', { name: 'Magnetic snapping' }).check(),
  );
  await page.mouse.move(x, y + 2);
  await expect(hover).toHaveAttribute('data-attracted', 'true');

  await page.getByRole('button', { name: 'Select rows', exact: true }).click();
  await page.getByRole('button', { name: /^Draw on map/ }).click();
  // The map scrolls into view in the frame that focuses Cancel; measure after it.
  await expect(page.getByRole('button', { name: 'Cancel map selection' })).toBeFocused();
  const track = await trackGeometry(page);
  const trackElement = page.locator('.ds-track');
  // Fractional page scrolling can offset Firefox's delivered pointer coordinates.
  // Assert the exact row for the received input, not the requested mouse position.
  await trackElement.evaluate((element) => {
    element.addEventListener(
      'pointerdown',
      (event) =>
        element.setAttribute('data-test-pointer-y', String((event as PointerEvent).clientY)),
      { once: true },
    );
  });
  const startY = Math.round(track.top + (peak / (total - 1)) * track.height + 2);
  await page.mouse.move(x, startY);
  await page.mouse.down();
  await page.mouse.move(x, startY + 20);
  await page.mouse.up();
  const pointerY = Number(await trackElement.getAttribute('data-test-pointer-y'));
  const start = Math.round(((pointerY - track.top) / track.height) * (total - 1));
  await expect(page.getByRole('region', { name: 'Your selection' })).toContainText(
    `Rows ${(start + 1).toLocaleString('en-US')}–`,
  );
});

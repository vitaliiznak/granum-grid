import { expect, test, MOBILE, DESKTOP, fitsViewportWidth } from './fixtures';

for (const layout of ['expanded', 'compact', 'mobile'] as const) {
  test(`scroll handle stays outside the plot and events in ${layout} layout`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(layout === 'mobile' ? MOBILE : DESKTOP);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?dataset=logs');
    await expect(page.locator('[data-status="ready"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Scrollbar settings', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Scrollbar width' })
      .selectOption(layout === 'mobile' ? 'auto' : layout);
    await page.getByRole('button', { name: 'Done', exact: true }).click();

    const rail = page.getByRole('complementary', { name: 'Dataset scrollbar' });
    const slider = rail.getByRole('slider', { name: 'Dataset position' });
    // Coordinate clicks need the whole track on screen, even when its settings button is visible.
    await rail.locator('.ds-track').scrollIntoViewIfNeeded();
    const track = (await rail.locator('.ds-track').boundingBox())!;
    const plot = (await rail.locator('.ds-map-plot').boundingBox())!;
    const thumb = (await slider.boundingBox())!;
    expect(thumb.x).toBeGreaterThan(plot.x + plot.width);
    expect(track.x + track.width - (thumb.x + thumb.width)).toBeLessThanOrEqual(5);
    for (const marker of await rail.locator('.ds-marker').all()) {
      const rect = (await marker.boundingBox())!;
      expect(rect.x + rect.width).toBeLessThanOrEqual(thumb.x - 2);
    }
    await expect(rail.locator('.ds-track-line')).toHaveCSS('border-top-style', 'dashed');

    const progress = async () => Number(await slider.getAttribute('aria-valuenow')) / 4_000_000_000;
    const x = thumb.x + thumb.width / 2;
    // Shift bypasses optional peak/event attraction so we can verify the scroll address.
    await page.keyboard.down('Shift');
    await page.mouse.click(x, track.y + track.height / 2);
    await expect.poll(progress).toBeCloseTo(0.5, 2);
    const halfway = (await slider.boundingBox())!;
    await page.mouse.move(x, halfway.y + halfway.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, track.y + track.height * 0.72, { steps: 4 });
    await expect.poll(progress).toBeCloseTo(0.72, 2);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect.poll(progress).toBeCloseTo(0.5, 2);
    await page.getByRole('button', { name: 'Scrollbar settings', exact: true }).hover();
    await expect(rail).not.toHaveAttribute('data-scrolling');
    await rail.screenshot({ path: testInfo.outputPath(`scrollbar-${layout}.png`) });
    await slider.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', '4000000000');
    expect(await fitsViewportWidth(page)).toBe(true);
  });
}

test('one named chart uses its own scale and preview without moving the current row', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?dataset=logs');
  await expect(page.getByRole('grid', { name: 'Synthetic server logs' })).toBeVisible();
  await page.getByRole('button', { name: /^Open the incident/ }).click();
  const position = await page.getByTestId('position').innerText();
  const settings = page.getByRole('button', { name: 'Scrollbar settings', exact: true });
  await settings.click();
  await page.getByRole('combobox', { name: 'Scrollbar width' }).selectOption('expanded');
  await page.getByRole('checkbox', { name: 'Show latency track' }).check();
  await page.getByRole('combobox', { name: 'Scrollbar hover details' }).selectOption('summary');
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  const rail = page.getByRole('complementary', { name: 'Dataset scrollbar' });
  const chart = rail.getByRole('combobox', { name: 'Scrollbar chart' });
  await expect(chart.locator('option')).toHaveText(['Error rate', 'p95 latency']);
  await expect(rail.locator('.ds-track canvas')).toHaveCount(1);
  const axis = rail.locator('.ds-map-value-axis');
  await expect(axis).toHaveAttribute('aria-label', 'Error rate scale: 0% to 30%');
  await expect(axis.locator('span')).toHaveText(['0%', '30%']);
  await expect(rail.locator('.ds-map-legend')).toContainText('sampled');
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect
    .poll(async () => (await rail.locator('.ds-track').boundingBox())!.height)
    .toBeGreaterThan(100);
  await page.setViewportSize(DESKTOP);
  const profile = rail.getByTestId('overview');
  const errorChart = await profile.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());

  await chart.selectOption({ label: 'p95 latency' });
  await expect(axis).toHaveAttribute('aria-label', 'p95 latency scale: 0 ms to 2,600 ms');
  await expect
    .poll(() => profile.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()))
    .not.toBe(errorChart);
  await expect(page.getByTestId('position')).toHaveText(position);
  const track = (await rail.locator('.ds-track').boundingBox())!;
  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2);
  await expect(rail.locator('.ds-map-bucket-summary strong')).toContainText('p95 latency');
  await expect(rail.locator('.ds-map-bucket-summary strong')).toContainText('ms');
  await expect(rail.locator('.ds-map-bucket-summary strong')).not.toContainText('%');

  // A native selector owns its keys; the scrollbar keeps its own row navigation.
  await chart.focus();
  expect(
    await chart.evaluate((element) =>
      ['ArrowUp', 'ArrowDown', 'Home', 'End'].map((key) => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    ),
  ).toEqual([false, false, false, false]);
  await chart.selectOption('primary');
  await expect(chart).toHaveValue('primary');
  await expect(page.getByTestId('position')).toHaveText(position);
  const slider = rail.getByRole('slider', { name: 'Dataset position' });
  await slider.focus();
  await slider.press('End');
  await expect(page.getByTestId('position')).toHaveText('Row 4,000,000,000 of 4,000,000,000');
  await page.getByRole('button', { name: 'Back to previous location', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText(position);

  await chart.selectOption({ label: 'p95 latency' });
  await settings.click();
  await page.getByRole('checkbox', { name: 'Show latency track' }).uncheck();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(chart).toHaveCount(0);
  await expect(axis).toHaveAttribute('aria-label', 'Error rate scale: 0% to 30%');
  await settings.click();
  await page.getByRole('checkbox', { name: 'Show latency track' }).check();
  await page.getByRole('combobox', { name: 'Scrollbar display' }).selectOption('markers');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(chart).toHaveCount(0);
  await expect(axis).toHaveCount(0);

  await page.getByRole('button', { name: /Human genome/ }).click();
  await settings.click();
  await page.getByRole('combobox', { name: 'Scrollbar width' }).selectOption('auto');
  await page.getByRole('checkbox', { name: 'Show genome tracks' }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(chart.locator('option')).toHaveText(['GC content', 'Gene density', 'Repeats']);
  await expect(chart).toHaveValue('primary');
  await expect(axis).toHaveAttribute('aria-label', 'GC content scale: 30% to 60%');
  await chart.selectOption({ label: 'Repeats' });
  await expect(axis).toHaveAttribute('aria-label', 'Repeats scale: 20% to 70%');
  await page.setViewportSize(MOBILE);
  await expect(chart).not.toBeVisible();
  await expect(slider).toBeVisible();
  expect(await fitsViewportWidth(page)).toBe(true);
  expect(pageErrors).toEqual([]);
});

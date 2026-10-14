import {
  expect,
  test,
  MOBILE,
  DESKTOP,
  fitsViewportWidth,
  openDataset,
  withMapSettings,
} from './fixtures';

for (const layout of ['expanded', 'compact', 'mobile'] as const) {
  test(`scroll handle stays outside the plot and events in ${layout} layout`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(layout === 'mobile' ? MOBILE : DESKTOP);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDataset(page, '/?dataset=logs');
    await withMapSettings(page, (panel) =>
      panel
        .getByRole('combobox', { name: 'Scrollbar width' })
        .selectOption(layout === 'mobile' ? 'auto' : layout),
    );

    const rail = page.getByRole('complementary', { name: 'Dataset scrollbar' });
    const slider = rail.getByRole('slider', { name: 'Dataset position' });
    // Coordinate clicks need the whole track on screen, even when its settings button is visible.
    await rail.locator('.ds-track').scrollIntoViewIfNeeded();
    const track = (await rail.locator('.ds-track').boundingBox())!;
    const viewport = (await page.locator('.ds-viewport').boundingBox())!;
    if (layout !== 'expanded') {
      expect(Math.abs(track.y - viewport.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(track.y + track.height - (viewport.y + viewport.height))).toBeLessThanOrEqual(
        1,
      );
    }
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
    await page.getByRole('button', { name: 'Config', exact: true }).hover();
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
  await withMapSettings(page, async (panel) => {
    await panel.getByRole('combobox', { name: 'Scrollbar width' }).selectOption('expanded');
    await panel.getByRole('checkbox', { name: 'Show latency track' }).check();
    await panel.getByRole('combobox', { name: 'Scrollbar hover details' }).selectOption('summary');
  });

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

  const primaryTrack = (await rail.locator('.ds-track').boundingBox())!;
  await page.mouse.move(primaryTrack.x + 8, primaryTrack.y + primaryTrack.height / 2);
  const summary = rail.locator('.ds-map-bucket-summary');
  await expect(summary).toContainText('Error rate');
  await expect(summary).toContainText('Estimated average');
  // Group extent, scale, and provenance stay in map help, not the hover card.
  await expect(rail.locator('.ds-preview')).not.toContainText('evenly spaced');
  const help = rail.locator('.ds-map-help');
  await expect(help).toContainText('12,500,000 rows per group');
  await expect(help).toContainText('64 evenly spaced error-rate model values');
  await expect(help).toContainText('0%–30%');

  await chart.selectOption({ label: 'p95 latency' });
  await expect(axis).toHaveAttribute('aria-label', 'p95 latency scale: 0 ms to 2,600 ms');
  await expect
    .poll(() => profile.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()))
    .not.toBe(errorChart);
  await expect(page.getByTestId('position')).toHaveText(position);
  const track = (await rail.locator('.ds-track').boundingBox())!;
  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2);
  await expect(rail.locator('.ds-map-bucket-summary strong')).toContainText('p95 latency');
  await expect(summary.locator('.ds-map-reading-value')).toContainText('ms');
  await expect(summary).not.toContainText('%');
  await expect(summary).not.toContainText('error-rate model');

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
  await withMapSettings(page, (panel) =>
    panel.getByRole('checkbox', { name: 'Show latency track' }).uncheck(),
  );
  await expect(chart).toHaveCount(0);
  await expect(axis).toHaveAttribute('aria-label', 'Error rate scale: 0% to 30%');
  await withMapSettings(page, async (panel) => {
    await panel.getByRole('checkbox', { name: 'Show latency track' }).check();
    await panel.getByRole('combobox', { name: 'Scrollbar display' }).selectOption('markers');
  });
  await expect(chart).toHaveCount(0);
  await expect(axis).toHaveCount(0);

  await page.getByRole('button', { name: /^Signal archive/ }).click();
  await withMapSettings(page, async (panel) => {
    await panel.getByRole('combobox', { name: 'Scrollbar width' }).selectOption('auto');
    await panel.getByRole('checkbox', { name: 'Show channel tracks' }).check();
  });
  await expect(chart.locator('option')).toHaveText([
    'Signal amplitude',
    'North',
    'East',
    'West',
    'South',
  ]);
  await expect(chart).toHaveValue('primary');
  await expect(axis).toHaveAttribute('aria-label', /^Signal amplitude scale: /);
  await chart.selectOption({ label: 'West' });
  await expect(axis).toHaveAttribute('aria-label', /^West scale: /);
  await page.setViewportSize(MOBILE);
  await expect(chart).not.toBeVisible();
  await expect(slider).toBeVisible();
  expect(await fitsViewportWidth(page)).toBe(true);
  expect(pageErrors).toEqual([]);
});

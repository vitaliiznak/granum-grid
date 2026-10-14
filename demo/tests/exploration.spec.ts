import {
  expect,
  test,
  MOBILE,
  enterRows,
  fitsViewportWidth,
  openSignal,
  withMapSettings,
} from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSignal(page);
});

test('range summaries, linked comparison, bookmarks and dialog focus', async ({ page }) => {
  await page.getByRole('button', { name: 'Select rows', exact: true }).click();
  await expect(page.getByLabel('From row', { exact: true })).toHaveCount(0);
  await enterRows(page, '1000000', '1000100');
  const selected = page.getByRole('region', { name: 'Your selection', exact: true });
  await expect(selected).toContainText('101 rows selected');
  await expect(page.getByLabel('From row', { exact: true })).toHaveCount(0);
  await expect(selected.getByRole('button', { name: 'View selection' })).toBeFocused();
  await expect(page.getByText('Estimated summary', { exact: true })).toHaveCount(0);
  await selected.getByText('Show summary', { exact: true }).click();
  await expect(selected.getByText('Estimated summary', { exact: true })).toBeVisible();
  await selected.getByRole('button', { name: 'Save bookmark', exact: true }).click();
  await expect(page.getByLabel('Bookmark name')).toBeFocused();
  await page.getByLabel('Bookmark name').fill('Sample A');
  await page.getByRole('button', { name: 'Save bookmark', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved “Sample A”');
  await page.getByRole('button', { name: 'Compare ranges', exact: true }).click();
  const setup = page.getByRole('region', { name: 'Range comparison' });
  await expect(setup).toBeFocused();
  await expect(setup.getByRole('group', { name: 'First range', exact: true })).toContainText(
    '1,000,000',
  );
  await expect(setup.getByRole('button', { name: 'Show comparison' })).toBeDisabled();
  await setup.getByRole('button', { name: 'Choose second range', exact: true }).click();
  await setup.getByRole('button', { name: /^Draw on map/ }).click();
  await expect(page.getByRole('button', { name: 'Cancel map selection' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(setup).toBeFocused();
  await setup.getByRole('button', { name: 'Choose second range', exact: true }).click();
  await setup.getByRole('button', { name: /^Enter row numbers/ }).click();
  await expect(page.getByLabel('From row', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Use these rows', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already your first range');
  await page.getByLabel('From row', { exact: true }).fill('61700000');
  await page.getByLabel('To row', { exact: true }).fill('61700100');
  await page.getByRole('button', { name: 'Use these rows', exact: true }).click();
  await expect(setup.getByRole('group', { name: 'First range', exact: true })).toContainText(
    '1,000,000',
  );
  await expect(setup.getByRole('group', { name: 'Second range', exact: true })).toContainText(
    '61,700,000',
  );
  const compare = page.getByRole('button', { name: 'Show comparison', exact: true });
  await expect(compare).toBeFocused();
  await compare.click();
  const dialog = page.getByRole('dialog', { name: 'Compare selected ranges' });
  const a = dialog.getByRole('grid', { name: 'First range rows' });
  const b = dialog.getByRole('grid', { name: 'Second range rows' });
  await expect(a.locator('[data-status=ready]').first()).toContainText('1,000,000');
  await expect(b.locator('[data-status=ready]').first()).toContainText('61,700,000');
  await expect(dialog.getByText('Estimated summary', { exact: true })).toHaveCount(2);
  await expect(dialog.locator('.gr-legend').first()).toContainText('exact overview');
  await expect(dialog.locator('.gr-meta-error')).toHaveCount(0);
  // Real wheel input: the pane scrolls natively (how far is the browser's choice; Firefox
  // caps a step at about a page), and the linked pane follows to the same row.
  await a.hover();
  await page.mouse.wheel(0, 320);
  const firstRow = (pane: typeof a) =>
    pane.locator('[role=row]').first().getAttribute('aria-rowindex');
  await expect.poll(() => firstRow(a)).not.toBe('1');
  await page.waitForTimeout(400);
  await expect.poll(() => firstRow(b)).toBe(await firstRow(a));
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(compare).toBeFocused();
  await setup.getByRole('button', { name: 'Cancel comparison' }).click();
  await expect(setup).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change selection' })).toBeFocused();
  await page.reload();
  // Saved bookmarks join the provider's markers on the map, and the panel lists both.
  await expect(page.getByRole('button', { name: 'Sample A', exact: true })).toHaveAttribute(
    'data-kind',
    'bookmark',
  );
  await page.getByRole('button', { name: /^Bookmarks/ }).click();
  await expect(
    page.getByRole('list', { name: 'Dataset markers' }).getByRole('button', { name: /^Spike 3/ }),
  ).toBeVisible();
  await page
    .getByRole('list', { name: 'Saved bookmarks' })
    .getByRole('button', { name: /^Sample A/ })
    .click();
  await expect(selected).toContainText('Rows 1,000,000–1,000,100');
  await page.getByRole('button', { name: 'Change selection' }).click();
  await page.getByRole('button', { name: /^Enter row numbers/ }).click();
  await expect(page.getByLabel('From row', { exact: true })).toHaveValue('1000000');
  await expect(page.getByLabel('To row', { exact: true })).toHaveValue('1000100');
});

test('selection choices, validation and single-row summary stay contextual on a phone', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.getByRole('button', { name: 'Select rows', exact: true }).click();
  await page.getByRole('button', { name: /^Rows on screen/ }).click();
  const selected = page.getByRole('region', { name: 'Your selection', exact: true });
  await expect(selected).toContainText('selected');
  const original = await selected.textContent();
  await page.getByRole('button', { name: 'Change selection' }).click();
  await enterRows(page, '0');
  await expect(page.getByRole('alert')).toContainText('Enter whole row numbers');
  await expect(page.getByLabel('From row', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(selected).toHaveText(original!);
  await page.getByRole('button', { name: 'Change selection' }).click();
  await page.getByRole('button', { name: /^Enter row numbers/ }).click();
  await page.getByLabel('From row', { exact: true }).fill('1');
  await page.getByLabel('To row', { exact: true }).fill('1');
  await expect(page.getByText('1 row in this selection', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use these rows', exact: true }).click();
  await expect(selected.getByText('1 row selected', { exact: true })).toBeVisible();
  await expect(selected.getByRole('button', { name: 'Open row' })).toBeFocused();
  await selected.getByText('Show summary', { exact: true }).click();
  await expect(selected.getByText('Value', { exact: true })).toBeVisible();
  await expect(selected.getByText('Lowest', { exact: true })).toHaveCount(0);
  await expect(selected.getByText('Highest', { exact: true })).toHaveCount(0);
  expect(await fitsViewportWidth(page)).toBe(true);
  await selected.getByRole('button', { name: 'Open row' }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 100,000,000');
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(selected).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select rows', exact: true })).toBeFocused();
});

test('separate tab keeps native scrolling and the map in sync and fits a phone', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Try row 73,500,000' }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 73,500,000 of 100,000,000');
  const opened = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open full page' }).click();
  const popup = await opened;
  try {
    await expect(popup.getByTestId('position')).toHaveText('Row 73,500,000 of 100,000,000');
    await expect(popup.locator('[data-gr-root]')).toHaveCSS('position', 'fixed');
    // The scrollbar addresses the whole dataset. Four viewports at each end scroll one to one,
    // so the middle is proportional to within about 0.0001.
    const nativeProgress = () =>
      popup.evaluate(() => scrollY / (document.documentElement.scrollHeight - innerHeight));
    await expect.poll(nativeProgress).toBeCloseTo(0.735, 3);
    await popup.getByRole('grid').hover();
    await popup.mouse.wheel(0, 400);
    await expect(popup.getByTestId('position')).toHaveText('Row 73,500,010 of 100,000,000');
    await expect.poll(() => popup.url()).toContain('73500009');
    await popup.reload();
    await expect(popup.getByTestId('position')).toHaveText('Row 73,500,010 of 100,000,000');
    await expect.poll(nativeProgress).toBeCloseTo(0.735, 3);
    // Native scrollbar offsets address the whole dataset: its middle shows the middle row.
    // The range ends where the last row meets the bottom, so the middle row sits mid-screen.
    await popup.evaluate(() =>
      window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2),
    );
    await expect(popup.getByRole('grid').locator('[aria-rowindex="50000000"]')).toBeInViewport();
    const middle = Number(
      (await popup.getByTestId('position').innerText())
        .match(/^Row ([\d,]+)/)![1]
        .replaceAll(',', ''),
    );
    await expect(popup.getByRole('slider', { name: 'Dataset position' })).toHaveAttribute(
      'aria-valuenow',
      String(middle),
    );
    await popup.locator('.gr-rail-title').hover();
    await popup.mouse.wheel(0, 400);
    await expect(popup.getByTestId('position')).toHaveText(
      `Row ${(middle + 10).toLocaleString('en-US')} of 100,000,000`,
    );
    // Scrubbing the map updates the native scrollbar in the reverse direction.
    const track = (await popup.locator('.gr-track').boundingBox())!;
    await popup.keyboard.down('Shift');
    await popup.mouse.move(track.x + track.width / 2, track.y + track.height / 2);
    await popup.mouse.down();
    await popup.mouse.move(track.x + track.width / 2, track.y + track.height * 0.8, { steps: 4 });
    await popup.mouse.up();
    await popup.keyboard.up('Shift');
    await expect.poll(nativeProgress).toBeCloseTo(0.8, 2);
    await popup.getByRole('grid').press('End');
    await expect(popup.getByTestId('position')).toHaveText('Row 100,000,000 of 100,000,000');
    await expect.poll(nativeProgress).toBe(1);
    // The last row ends at the bottom, so the top row depends on the viewport's height.
    const topRow = await popup.getByRole('grid').evaluate((element) => {
      const top = element.getBoundingClientRect().top + element.clientTop + 0.5;
      const row = [...element.querySelectorAll('[role=row]')].find((candidate) => {
        const box = candidate.getBoundingClientRect();
        return box.top <= top && box.bottom > top;
      });
      return Number(row!.getAttribute('aria-rowindex'));
    });
    await popup.getByRole('grid').hover();
    await popup.mouse.wheel(0, -120);
    await expect(popup.getByTestId('position')).toHaveText(
      `Row ${(topRow - 3).toLocaleString('en-US')} of 100,000,000`,
    );
    await popup.setViewportSize(MOBILE);
    await expect
      .poll(() =>
        popup
          .locator('[data-gr-root]')
          .evaluate((e) => Math.abs(e.getBoundingClientRect().height - innerHeight)),
      )
      .toBeLessThan(1);
    expect(await fitsViewportWidth(popup)).toBe(true);
  } finally {
    await popup.close();
  }
});

test('map selection can be canceled and optional channel tracks stay bounded', async ({ page }) => {
  await page.getByRole('button', { name: 'Select rows', exact: true }).click();
  await page.getByRole('button', { name: /^Draw on map/ }).click();
  // The map scrolls into view in the frame that focuses Cancel; measure after it.
  await expect(page.getByRole('button', { name: 'Cancel map selection' })).toBeFocused();
  const rect = (await page.locator('.gr-track').boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * 0.5, { steps: 3 });
  await expect(page.locator('.gr-map-selection')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.gr-map-selection')).toHaveCount(0);
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 100,000,000');
  await withMapSettings(page, async (panel) => {
    await panel.getByRole('checkbox', { name: 'Show channel tracks' }).check();
    await panel.getByRole('combobox', { name: 'Scrollbar width' }).selectOption('expanded');
  });
  const chart = page.getByRole('combobox', { name: 'Scrollbar chart' });
  await expect(chart.locator('option')).toHaveCount(5);
  await chart.selectOption({ label: 'North' });
  await expect(page.locator('.gr-track canvas')).toHaveCount(1);
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 100,000,000');
});

test('a shared full-page link restores its selected range', async ({ page }) => {
  const view = {
    version: 1,
    dataset: 'signal-observatory',
    revision: '1',
    location: { position: 999_999, view: 'rows', rowsPerPixel: 1 / 32 },
    selection: { start: 999_999, end: 1_000_100 },
  };
  await page.goto(`/?page=1&dataset=signal#view=${encodeURIComponent(JSON.stringify(view))}`);
  await page.getByRole('button', { name: 'Change selection', exact: true }).click();
  await page.getByRole('button', { name: /^Enter row numbers/ }).click();
  await expect(page.getByLabel('From row', { exact: true })).toHaveValue('1000000');
  await expect(page.getByLabel('To row', { exact: true })).toHaveValue('1000100');
});

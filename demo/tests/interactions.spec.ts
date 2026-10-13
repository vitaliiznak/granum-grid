import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('deepscroll-hints-v1', 'done'));
  await page.goto('/?dataset=signal');
  await expect(page.getByRole('button', { name: 'Spike 3', exact: true })).toBeVisible();
});
test('date and predicate search are honest, cancellable, and do not jump while typing', async ({
  page,
}) => {
  const origin = await page.getByTestId('position').innerText();
  await page.getByRole('grid').focus();
  await page.getByRole('grid').press('/');
  const input = page.getByRole('textbox', { name: 'Go to row, date, or event' });
  await input.fill('2017-03');
  await expect(page.getByRole('button', { name: /^2017-03 Row/ })).toBeVisible();
  await expect(page.getByTestId('position')).toHaveText(origin);
  await input.press('Enter');
  await expect(page.getByTestId('breadcrumb')).toContainText('2017');
  await page.getByRole('button', { name: 'Go to…' }).click();
  await input.fill('value > 120');
  await expect(page.getByText(/Partial results/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^value:/ }).first()).toBeVisible();
  await input.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Go to…' }).click();
  await input.fill('2017-02-30');
  await expect(page.getByText('Enter a valid date, such as 2017-03.')).toBeVisible();
});
test('slow-server jumps keep meaningful estimates and bounded cache', async ({ page }) => {
  await page.getByText('Developer tools', { exact: false }).first().click();
  const latency = page.getByRole('slider', { name: 'Simulated server latency' });
  await latency.focus();
  await latency.press('End');
  await page.getByRole('button', { name: 'Spike 3', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 61,700,000 of 100,000,000');
  await expect(page.getByText('Approximate').first()).toBeVisible();
  await expect(page.locator('[role=row][aria-rowindex="61700000"]')).toContainText('SPIKE', {
    timeout: 15_000,
  });
  const footer = await page.locator('.playground-stats').innerText();
  expect(Number(footer.match(/([\d,]+) cached/)![1].replaceAll(',', ''))).toBeLessThan(4096);
});
test('precision changes do not teleport and escape reverses a scrub', async ({ page }) => {
  await page.getByRole('button', { name: 'Spike 2', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 34,500,001 of 100,000,000');
  const track = await page.locator('.ds-track').boundingBox();
  if (!track) throw new Error('Missing track');
  const x = track.x + track.width / 2,
    y = track.y + track.height * 0.345;
  const origin = await page
    .getByRole('slider', { name: 'Dataset position' })
    .getAttribute('aria-valuenow');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 230, y);
  await expect(page.getByText('Fine · 1/20 speed')).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Dataset position' })).toHaveAttribute(
    'aria-valuenow',
    origin!,
  );
  await page.mouse.move(x - 230, y + 25, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByRole('slider', { name: 'Dataset position' })).toHaveAttribute(
    'aria-valuenow',
    origin!,
  );
});
test('keyboard, reduced motion, and light mobile layout remain usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const grid = page.getByRole('grid');
  await grid.focus();
  await grid.press('n');
  await expect(page.getByTestId('position')).toHaveText('Row 12,000,001 of 100,000,000');
  await grid.press('ArrowDown');
  await expect(page.getByTestId('position')).toHaveText('Row 12,000,002 of 100,000,000');
  await grid.press('Alt+ArrowLeft');
  await expect(page.getByTestId('position')).toHaveText('Row 1 of 100,000,000');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('.ds-root')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('.ds-root')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('slider', { name: 'Dataset position' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Go to…' }).click();
  await page.getByRole('textbox').fill('50%');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByTestId('position')).toHaveText('Row 50,000,001 of 100,000,000');
});
test('no runtime or console errors on a fresh load and view changes', async ({ page }) => {
  // Finish the initial worker bootstrap before reloading. Firefox's automation
  // worker reports NS_BINDING_ABORTED if navigation interrupts its module load.
  await expect(page.locator('.ds-legend')).toContainText('sampled overview');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Spike 1', exact: true })).toBeVisible();
  for (const view of ['Lens', 'Zoom', 'Rows'])
    await page
      .getByRole('combobox', { name: 'View', exact: true })
      .selectOption(view.toLowerCase());
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  expect(errors).toEqual([]);
});
test('view guidance works with keyboard and stays usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole('combobox', { name: 'View', exact: true });
  const guide = page.locator('.ds-view-guide');
  const toggle = guide.locator('summary');
  await expect(menu).toHaveAccessibleDescription(/Read individual records/);
  await toggle.focus();
  await toggle.press('Enter');
  await expect(guide).toHaveAttribute('open', '');
  await expect(
    guide.getByText(/The dataset map on the right always shows the whole dataset/),
  ).toBeVisible();
  await expect(guide.locator('.ds-view-guide-option')).toHaveCount(3);
  await toggle.press('Enter');
  await expect(guide).not.toHaveAttribute('open');
  const position = await page.getByTestId('position').innerText();
  await menu.selectOption({ label: 'Focused rows' });
  await expect(menu).toHaveAccessibleDescription(/Nearby rows stay readable/);
  await expect(page.getByTestId('position')).toHaveText(position);
  await expect(page.getByRole('button', { name: 'Inspect rows', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect rows', exact: true }).click();
  await expect(menu).toHaveValue('rows');
  await expect(page.getByTestId('position')).toHaveText(position);
  await menu.selectOption({ label: 'Range summaries' });
  await expect(page.locator('[data-ds-part="aggregate"]').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('automatic speed zoom is optional and returns to rows after settling', async ({ page }) => {
  await page.getByText('Developer tools', { exact: false }).first().click();
  await expect(page.getByRole('checkbox', { name: 'Zoom out at speed' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Zoom out at speed' }).check();
  const grid = page.getByRole('grid');
  await grid.focus();
  await grid.dispatchEvent('wheel', { deltaY: 1800, deltaMode: 0 });
  await expect(page.locator('.ds-aggregate-label')).toBeVisible();
  await expect(page.locator('.ds-aggregate-label')).not.toBeVisible({ timeout: 4000 });
  await page.getByRole('checkbox', { name: 'Zoom out at speed' }).uncheck();
  await grid.dispatchEvent('wheel', { deltaY: 1800, deltaMode: 0 });
  await expect(page.locator('.ds-aggregate-label')).not.toBeVisible();
});
test('touch pinch and pan navigate the same coordinate system', async ({ page, browserName }) => {
  test.skip(
    browserName !== 'chromium',
    'CDP touch injection is Chromium-specific; physical touch needs manual verification.',
  );
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('zoom');
  await page.getByRole('button', { name: 'Fit dataset', exact: true }).click();
  const grid = page.getByRole('grid');
  await grid.scrollIntoViewIfNeeded();
  const rect = await grid.boundingBox();
  if (!rect) throw new Error('Missing viewport');
  const client = await page.context().newCDPSession(page);
  let touching = false;
  try {
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    const x = rect.x + rect.width / 2,
      y = rect.y + rect.height / 2;
    const scaleBefore = await page.locator('.ds-scale').innerText();
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: x - 35, y, id: 1 },
        { x: x + 35, y, id: 2 },
      ],
    });
    touching = true;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x - 70, y, id: 1 },
        { x: x + 70, y, id: 2 },
      ],
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    touching = false;
    await expect(page.locator('.ds-scale')).not.toHaveText(scaleBefore);
    // Each gesture targets the current viewport; page scrolling or layout can move it after a pinch.
    await grid.scrollIntoViewIfNeeded();
    const panRect = (await grid.boundingBox())!;
    const panX = panRect.x + panRect.width / 2;
    const panY = panRect.y + panRect.height / 2;
    const positionBefore = await page.getByTestId('position').innerText();
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: panX, y: panY + 30, id: 1 }],
    });
    touching = true;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: panX, y: panY - 30, id: 1 }],
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    touching = false;
    await expect(page.getByTestId('position')).not.toHaveText(positionBefore);
  } finally {
    try {
      if (touching)
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await client.detach();
    }
  }
});
test('marker keys leave modified browser shortcuts such as Ctrl/Cmd+P alone', async ({ page }) => {
  const grid = page.getByRole('grid');
  const prevented = (init: Pick<KeyboardEventInit, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>) =>
    grid.evaluate((element, init) => {
      const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, init);
  expect(await prevented({ key: 'p', ctrlKey: true })).toBe(false);
  expect(await prevented({ key: 'p', metaKey: true })).toBe(false);
  expect(await prevented({ key: 'n', altKey: true })).toBe(false);
  expect(await prevented({ key: 'p' })).toBe(true);
});
test('editable host content keeps navigation keys in every contenteditable state', async ({
  page,
}) => {
  const results = await page.getByRole('grid').evaluate((grid) =>
    ['', 'true', 'plaintext-only', 'false'].map((state) => {
      const editor = document.createElement('span');
      editor.setAttribute('contenteditable', state);
      grid.append(editor);
      const event = new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true });
      editor.dispatchEvent(event);
      editor.remove();
      return event.defaultPrevented;
    }),
  );
  // Only contenteditable="false" leaves the explorer's marker key active.
  expect(results).toEqual([false, false, false, true]);
});

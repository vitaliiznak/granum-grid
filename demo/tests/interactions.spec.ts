import { expect, test, MOBILE, fitsViewportWidth, openSignal, withDebug } from './fixtures';
test.beforeEach(async ({ page }) => {
  await openSignal(page);
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
  await withDebug(page, async (dialog) => {
    const latency = dialog.getByRole('slider', { name: 'Simulated server latency' });
    await latency.focus();
    await latency.press('End');
  });
  await page.getByRole('button', { name: 'Spike 3', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 61,700,000 of 100,000,000');
  await expect(page.getByText('Approximate').first()).toBeVisible();
  await expect(page.locator('[role=row][aria-rowindex="61700000"]')).toContainText('SPIKE', {
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'debug', exact: true }).click();
  const footer = await page.locator('.debug-stats').innerText();
  expect(Number(footer.match(/([\d,]+) cached/)![1].replaceAll(',', ''))).toBeLessThan(4096);
});
test('precision changes do not teleport and escape reverses a scrub', async ({ page }) => {
  await page.getByRole('button', { name: 'Spike 2', exact: true }).click();
  await expect(page.getByTestId('position')).toHaveText('Row 34,500,001 of 100,000,000');
  const slider = page.getByRole('slider', { name: 'Dataset position' });
  await slider.scrollIntoViewIfNeeded();
  const thumb = (await slider.boundingBox())!;
  // Start on the handle; the middle of a compact rail may contain an event button.
  const x = thumb.x + thumb.width / 2,
    y = thumb.y + thumb.height / 2;
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
  await page.setViewportSize(MOBILE);
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('.ds-root')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('.ds-root')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('slider', { name: 'Dataset position' })).toBeVisible();
  expect(await fitsViewportWidth(page)).toBe(true);
  await page.getByRole('button', { name: 'Go to…' }).click();
  await page.getByRole('textbox').fill('50%');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByTestId('position')).toHaveText('Row 50,000,001 of 100,000,000');
});
test('no runtime or console errors on a fresh load and row navigation', async ({
  page,
  pageErrors,
}) => {
  // Finish the initial worker bootstrap before reloading. Firefox's automation
  // worker reports NS_BINDING_ABORTED if navigation interrupts its module load.
  await expect(page.locator('.ds-legend')).toContainText('sampled overview');
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Spike 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Spike 1', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  expect(pageErrors).toEqual([]);
});
test('touch pan navigates rows', async ({ page, browserName }) => {
  test.skip(
    browserName !== 'chromium',
    'CDP touch injection is Chromium-specific; physical touch needs manual verification.',
  );
  const grid = page.getByRole('grid');
  await grid.scrollIntoViewIfNeeded();
  const rect = await grid.boundingBox();
  if (!rect) throw new Error('Missing viewport');
  const client = await page.context().newCDPSession(page);
  let touching = false;
  try {
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
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
test('browser zoom gestures remain available without changing rows', async ({ page }) => {
  const grid = page.getByRole('grid');
  const pinch = (scales: number[]) =>
    grid.evaluate((element, scales) => {
      const rect = element.getBoundingClientRect();
      return scales.map((scale, i) => {
        const event = new Event(i ? 'gesturechange' : 'gesturestart', { cancelable: true });
        Object.assign(event, { scale, clientY: rect.top + rect.height / 2 });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      });
    }, scales);
  // Unfocused: leave the gesture to the browser's own page zoom.
  expect(await pinch([1, 2])).toEqual([false, false]);
  const position = await page.getByTestId('position').innerText();
  await grid.focus();
  expect(await pinch([1, 0.5, 0.25])).toEqual([false, false, false]);
  const prevented = await grid.evaluate((element) => {
    const event = new WheelEvent('wheel', {
      deltaY: 100,
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await expect(page.getByTestId('position')).toHaveText(position);
});

test('the wheel scrolls rows natively and hands off to the page at the ends', async ({
  page,
  browserName,
}) => {
  const grid = page.getByRole('grid');
  const position = page.getByTestId('position');
  const pageY = () => page.evaluate(() => window.scrollY);
  // Put the explorer mid-page, so the page itself can scroll in both directions.
  await grid.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const over = async () => {
    const box = (await grid.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  };
  // Firefox keeps wheel input on its first target for 1.5 s; let each gesture end.
  const nextGesture = () => page.waitForTimeout(1600);
  await over();
  await expect(position).toHaveText('Row 1 of 100,000,000');
  // At the first row there is nothing above, so the page scrolls instead.
  const start = await pageY();
  expect(start).toBeGreaterThan(0);
  await page.mouse.wheel(0, -120);
  await expect.poll(pageY).toBeLessThan(start);
  await expect(position).toHaveText('Row 1 of 100,000,000');
  // Between the ends the rows take the wheel and the page stays.
  await nextGesture();
  await grid.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await over();
  const middle = await pageY();
  await page.mouse.wheel(0, 400);
  await expect(position).toHaveText('Row 11 of 100,000,000');
  expect(await pageY()).toBe(middle);
  // Sideways wheels do not move rows.
  await nextGesture();
  await page.mouse.wheel(240, 0);
  await page.waitForTimeout(200);
  await expect(position).toHaveText('Row 11 of 100,000,000');
  // overscroll-behavior: contain keeps the wheel in the rows even at an end. Firefox hands a
  // wheel at a boundary to the page anyway, for a plain scrolling div too (checked 2026-10-14).
  if (browserName === 'firefox') return;
  await grid.press('Home');
  await expect(position).toHaveText('Row 1 of 100,000,000');
  await grid.evaluate((element) => {
    element.style.overscrollBehaviorY = 'contain';
    element.scrollIntoView({ block: 'center' });
  });
  await over();
  await nextGesture();
  const contained = await pageY();
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(300);
  expect(await pageY()).toBe(contained);
});

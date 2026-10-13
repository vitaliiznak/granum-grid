import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
test('performance: sustained navigation remains bounded at 100M rows', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('deepscroll-hints-v1', 'done'));
  await page.goto('/?dataset=signal');
  await expect(page.getByRole('button', { name: 'Spike 1', exact: true })).toBeVisible();
  await page.getByText('Developer tools', { exact: false }).first().click();
  await page.getByRole('grid').focus();
  const report = await page.getByRole('grid').evaluate(async (element) => {
    const intervals: number[] = [];
    let last = performance.now(),
      frames = 0,
      maxRows = 0;
    await new Promise<void>((resolve) => {
      const step = (now: number) => {
        if (frames > 5) intervals.push(now - last);
        last = now;
        element.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: frames < 65 ? 450 : 30,
            bubbles: true,
            cancelable: true,
          }),
        );
        maxRows = Math.max(maxRows, element.querySelectorAll('[role=row]').length);
        if (++frames < 100) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    intervals.sort((a, b) => a - b);
    return {
      frames,
      medianFrameMs: intervals[Math.floor(intervals.length * 0.5)],
      p95FrameMs: intervals[Math.floor(intervals.length * 0.95)],
      maxMountedRows: maxRows,
      domElements: document.querySelectorAll('*').length,
      userAgent: navigator.userAgent,
    };
  });
  expect(report.maxMountedRows).toBeLessThan(256);
  expect(report.p95FrameMs).toBeLessThan(50); // Regression ceiling, not a 60fps assertion.
  await expect(page.locator('.playground-stats')).toContainText('0 in flight', { timeout: 8000 });
  await mkdir('output/playwright', { recursive: true });
  const result = {
    browser: info.project.name,
    ...report,
    footer: await page.locator('.playground-stats').innerText(),
  };
  await writeFile(
    `output/playwright/performance-${info.project.name}.json`,
    JSON.stringify(result, null, 2),
  );
  await info.attach('navigation-performance', {
    body: JSON.stringify(result),
    contentType: 'application/json',
  });
  console.log(JSON.stringify(result));
});

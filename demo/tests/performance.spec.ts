import { expect, openSignal, test } from './fixtures';
test('performance: sustained navigation remains bounded at 100M rows', async ({ page }, info) => {
  await openSignal(page);
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
  // Frame intervals are capped by vsync and hide slower work. Also time each wheel event's
  // main-thread cost: dispatch, React commit, and the resulting style and layout.
  const work = await page.getByRole('grid').evaluate(async (element) => {
    const costs: number[] = [];
    for (let i = 0; i < 120; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const start = performance.now();
      element.dispatchEvent(
        new WheelEvent('wheel', { deltaY: i < 60 ? 30 : -30, bubbles: true, cancelable: true }),
      );
      await null; // React commits external-store updates in a microtask.
      element.getBoundingClientRect();
      costs.push(performance.now() - start);
    }
    costs.sort((a, b) => a - b);
    return { medianEventMs: costs[60], p95EventMs: costs[Math.floor(costs.length * 0.95)] };
  });
  expect(report.maxMountedRows).toBeLessThan(256);
  expect(report.p95FrameMs).toBeLessThan(50); // Regression ceiling, not a 60fps assertion.
  expect(work.medianEventMs).toBeLessThan(8); // Half a 60 Hz frame; local dev builds measure 2-3 ms.
  await page.getByRole('button', { name: 'debug', exact: true }).click();
  await expect(page.locator('.debug-stats')).toContainText('0 in flight', { timeout: 8000 });
  const result = {
    browser: info.project.name,
    ...report,
    ...work,
    footer: await page.locator('.debug-stats').innerText(),
  };
  // Kept with the test report and CI artifact rather than an untracked local file.
  await info.attach('navigation-performance', {
    body: JSON.stringify(result),
    contentType: 'application/json',
  });
  console.log(JSON.stringify(result));
});

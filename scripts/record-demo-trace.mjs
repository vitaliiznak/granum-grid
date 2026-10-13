import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Run against an already-running demo. This captures real browser work, not generated events.
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  await page.goto(`${process.env.DEEPSCROLL_DEMO_URL ?? 'http://127.0.0.1:5193'}/?dataset=signal`);
  await page.locator('.demo-explorer [data-status=ready]').first().waitFor();
  const client = await page.context().newCDPSession(page);
  const events = [];
  client.on('Tracing.dataCollected', ({ value }) => events.push(...value));
  await client.send('Tracing.start', {
    categories: 'devtools.timeline,blink.user_timing',
    transferMode: 'ReportEvents',
  });
  await page.getByRole('button', { name: 'Try row 73,500,000' }).click();
  await page.locator('.demo-explorer [role=grid]').hover();
  await page.mouse.wheel(0, 960);
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('zoom');
  await page.getByRole('button', { name: 'Fit dataset', exact: true }).click();
  await page.locator('.ds-summary-band').first().waitFor();
  await page.getByRole('button', { name: 'Inspect these rows', exact: true }).first().click();
  await page.locator('.demo-explorer [data-status=ready]').first().waitFor();
  let deadline;
  try {
    const completed = new Promise((resolve, reject) => {
      client.once('Tracing.tracingComplete', resolve);
      deadline = setTimeout(() => reject(new Error('Trace capture did not finish')), 10_000);
    });
    await client.send('Tracing.end');
    await completed;
  } finally {
    clearTimeout(deadline);
  }
  await mkdir('demo/src/data/fixtures', { recursive: true });
  const output = {
    traceEvents: events.map(({ name, cat, ph, ts, dur, pid, tid }) => ({
      name,
      cat,
      ph,
      ts,
      dur,
      pid,
      tid,
    })),
    metadata: {
      source: 'Chromium CDP recording of the local deepscroll signal demo',
      recordedOn: new Date().toISOString().slice(0, 10),
      activity: 'Jump to row 73500000, scroll, fit overview, inspect a summary range',
      redaction: 'Event arguments and environment metadata omitted',
    },
  };
  await writeFile('demo/src/data/fixtures/exploration-trace.json', `${JSON.stringify(output)}\n`);
  console.log(
    `Captured ${events.length} events (${events.filter((e) => e.ph === 'X').length} complete).`,
  );
} finally {
  await browser.close();
}

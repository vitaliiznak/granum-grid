import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Run against an already-running demo (`npm run dev`). This captures real browser work,
// not generated events. The fixture path does not depend on the current directory.
const fixtures = new URL('../demo/src/data/fixtures/', import.meta.url);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  await page.goto(`${process.env.GRANUM_GRID_DEMO_URL ?? 'http://127.0.0.1:5173'}/?dataset=signal`);
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
  await page.getByRole('button', { name: 'Spike 3', exact: true }).click();
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
  await mkdir(fixtures, { recursive: true });
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
      source: 'Chromium CDP recording of the local Granum Grid signal demo',
      recordedOn: new Date().toISOString().slice(0, 10),
      activity: 'Jump to row 73500000, scroll, jump to Spike 3, inspect nearby rows',
      redaction: 'Event arguments and environment metadata omitted',
    },
  };
  await writeFile(new URL('exploration-trace.json', fixtures), `${JSON.stringify(output)}\n`);
  console.log(
    `Captured ${events.length} events (${events.filter((e) => e.ph === 'X').length} complete).`,
  );
} finally {
  await browser.close();
}

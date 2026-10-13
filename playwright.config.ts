import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const port = process.env.PLAYWRIGHT_PORT ?? '5187';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './demo/tests',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results',
  timeout: 30_000,
  globalTimeout: 10 * 60 * 1000,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['line'], ['html', { open: 'never' }]] : 'list',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run ${isCI ? 'preview' : 'dev'} -w demo -- --port ${port} --strictPort`,
    url: baseURL,
    // Own the server by default so an agent cannot test a stale or unrelated app.
    reuseExistingServer: !isCI && process.env.PLAYWRIGHT_REUSE_SERVER === '1',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});

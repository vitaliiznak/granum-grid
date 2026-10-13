import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const port = process.env.PLAYWRIGHT_PORT ?? '5187';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './demo/tests',
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
    reuseExistingServer: !isCI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});

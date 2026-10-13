import { defineConfig } from 'vitest/config';
import { granumGridSource } from './demo/vite.config';

// Unit tests exercise library source through the demo's aliases; dist/ may be stale or absent.
export default defineConfig({
  // Browser specs under demo/tests belong to Playwright.
  test: { include: ['granum-grid/tests/**/*.test.ts', 'demo/unit/**/*.test.ts'] },
  resolve: { alias: granumGridSource },
});

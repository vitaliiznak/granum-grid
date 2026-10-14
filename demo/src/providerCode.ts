import sql from './examples/sql-provider.ts?raw';
import parquet from './examples/parquet-provider.ts?raw';
import http from './examples/http-provider.ts?raw';

const GITHUB = 'https://github.com/vitaliiznak/granum-grid/blob/main/';

/**
 * How each playground dataset connects: the adapter's source, and a short, type-checked
 * example where a package does the work. Generated sets show what a provider for your own
 * server looks like instead.
 */
export const providerCode: Record<string, { code?: string; source: string; label: string }> = {
  file: { code: sql, source: `${GITHUB}packages/sql/src/index.ts`, label: '@granum/sql' },
  parquet: {
    code: parquet,
    source: `${GITHUB}packages/parquet/src/index.ts`,
    label: '@granum/parquet',
  },
  hackernews: { source: `${GITHUB}demo/src/data/hackernews.ts`, label: 'Hacker News adapter' },
  logs: { code: http, source: `${GITHUB}demo/src/data/logs.ts`, label: 'Log generator' },
  signal: { code: http, source: `${GITHUB}demo/src/data/signal.ts`, label: 'Signal generator' },
};

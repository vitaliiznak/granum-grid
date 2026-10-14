import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { traceApiPlugin } from './server/trace';

const source = (path: string) => fileURLToPath(new URL(`../packages/${path}`, import.meta.url));

/**
 * Resolve every public entry point of the workspace packages to their source, so `dist/`
 * may be stale or absent. Shared with Vitest; `tsconfig.source.json` maps the same entries
 * for type checking. @granum/react's stylesheets are core's, as in its published package.
 */
export const granumGridSource = [
  { find: /^@granum\/core$/, replacement: source('core/src/index.ts') },
  { find: /^@granum\/core\/(data|dom|map)$/, replacement: source('core/src/$1/index.ts') },
  { find: /^@granum\/core\/internal$/, replacement: source('core/src/internal.ts') },
  { find: /^@granum\/(?:core|react)\/(base|styles)\.css$/, replacement: source('core/src/$1.css') },
  { find: /^@granum\/react$/, replacement: source('react/src/index.ts') },
  { find: /^@granum\/react\/headless$/, replacement: source('react/src/headless.ts') },
  { find: /^@granum\/(parquet|sql)$/, replacement: source('$1/src/index.ts') },
];

export default defineConfig({
  // The same static build works at a domain root or a GitHub Pages project path.
  base: './',
  plugins: [react(), traceApiPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        http: fileURLToPath(new URL('./http.html', import.meta.url)),
        tutorials: fileURLToPath(new URL('./tutorials.html', import.meta.url)),
        vanilla: fileURLToPath(new URL('./vanilla.html', import.meta.url)),
      },
    },
  },
  resolve: { alias: granumGridSource },
});

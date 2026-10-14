import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { traceApiPlugin } from './server/trace';

const source = (path: string) =>
  fileURLToPath(new URL(`../granum-grid/src/${path}`, import.meta.url));
const packageSource = (name: string) =>
  fileURLToPath(new URL(`../packages/${name}/src/index.ts`, import.meta.url));

/**
 * Resolve every public entry point of the workspace packages to their source, so `dist/`
 * may be stale or absent. Shared by the media studio and Vitest; `tsconfig.source.json`
 * maps the same entries for type checking.
 */
export const granumGridSource = [
  { find: /^granum-grid$/, replacement: source('index.ts') },
  { find: /^granum-grid\/(core|data)$/, replacement: source('$1/index.ts') },
  { find: /^granum-grid\/headless$/, replacement: source('headless.ts') },
  { find: /^granum-grid\/(base|styles)\.css$/, replacement: source('$1.css') },
  { find: /^@granum\/parquet$/, replacement: packageSource('parquet') },
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
      },
    },
  },
  resolve: { alias: granumGridSource },
});

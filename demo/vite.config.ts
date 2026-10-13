import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  // The same static build works at a domain root or a GitHub Pages project path.
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: 'deepscroll/base.css',
        replacement: fileURLToPath(new URL('../deepscroll/src/base.css', import.meta.url)),
      },
      {
        find: 'deepscroll/styles.css',
        replacement: fileURLToPath(new URL('../deepscroll/src/styles.css', import.meta.url)),
      },
      {
        find: /^deepscroll$/,
        replacement: fileURLToPath(new URL('../deepscroll/src/index.ts', import.meta.url)),
      },
    ],
  },
});

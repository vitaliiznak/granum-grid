import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [
    { find: 'deepscroll/styles.css', replacement: fileURLToPath(new URL('../deepscroll/src/styles.css', import.meta.url)) },
    { find: /^deepscroll$/, replacement: fileURLToPath(new URL('../deepscroll/src/index.ts', import.meta.url)) },
  ] },
});

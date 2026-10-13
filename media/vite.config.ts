import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { granumGridSource } from '../demo/vite.config';

// Reuse the demo's source aliases; the media app never enters the library package.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: granumGridSource },
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { host: '127.0.0.1', port: 5190, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});

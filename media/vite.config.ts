import { defineConfig, mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import demoConfig from '../demo/vite.config';

// Reuse the demo's source aliases; the media app never enters the library package.
export default mergeConfig(
  demoConfig,
  defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    server: { host: '127.0.0.1', port: 5190, strictPort: true },
    build: { outDir: 'dist', emptyOutDir: true },
  }),
);

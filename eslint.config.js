import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import compat from 'eslint-plugin-compat';

export default defineConfig([
  {
    // Hook rules for every React surface: library, demo, and media studio.
    files: ['granum-grid/src/**/*.{ts,tsx}', 'demo/src/**/*.{ts,tsx}', 'media/src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Library browser APIs against granum-grid/package.json browserslist.
    files: ['granum-grid/src/**/*.{ts,tsx}'],
    plugins: { compat },
    settings: {
      // Also check JavaScript built-ins such as Array.prototype.findLast, not only Web APIs.
      lintAllEsApis: true,
    },
    rules: { 'compat/compat': 'error' },
  },
]);

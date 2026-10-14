import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import compat from 'eslint-plugin-compat';

// Library layers, lowest first: data ← core ← dom ← map ← react. A layer imports only the
// layers below it, and only react/ and the package entries may import React.
const LAYERS = ['data', 'core', 'dom', 'map'];
const layerRules = LAYERS.map((layer, index) => ({
  files: [`granum-grid/src/${layer}/**/*.ts`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              ...LAYERS.slice(index + 1).map((above) => `../${above}/*`),
              '../react/*',
              '../*.js',
              'react',
              'react/*',
              'react-dom',
              'react-dom/*',
            ],
            message: `granum-grid/src/${layer} may import only ${LAYERS.slice(0, index).join(', ') || 'itself'}; layers are data ← core ← dom ← map ← react.`,
          },
        ],
      },
    ],
  },
}));

export default defineConfig([
  {
    // Hook rules for every React surface: library, demo, and media studio.
    files: [
      'granum-grid/src/**/*.{ts,tsx}',
      'packages/*/src/**/*.ts',
      'demo/src/**/*.{ts,tsx}',
      'media/src/**/*.{ts,tsx}',
    ],
    languageOptions: { parser: tseslint.parser },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // The demo and media studio prove what a consumer can build, so they use public entries only.
    files: ['demo/src/**/*.{ts,tsx}', 'media/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/granum-grid/src/**', 'granum-grid/src/**', 'granum-grid/dist/**'],
              message:
                'Import granum-grid, granum-grid/headless, granum-grid/core, or granum-grid/data.',
            },
          ],
        },
      ],
    },
  },
  {
    // Library browser APIs against each package's browserslist.
    files: ['granum-grid/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
    plugins: { compat },
    settings: {
      // Also check JavaScript built-ins such as Array.prototype.findLast, not only Web APIs.
      lintAllEsApis: true,
    },
    rules: { 'compat/compat': 'error' },
  },
  ...layerRules,
]);

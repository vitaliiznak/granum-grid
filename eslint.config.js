import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import compat from 'eslint-plugin-compat';

const REACT = ['react', 'react/*', 'react-dom', 'react-dom/*'];

// @granum/core's layers, lowest first: data ← core ← dom ← map. A layer imports only the
// layers below it, and nothing in @granum/core imports React or a package entry of its own.
const LAYERS = ['data', 'core', 'dom', 'map'];
const layerRules = LAYERS.map((layer, index) => ({
  files: [`packages/core/src/${layer}/**/*.ts`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              ...LAYERS.slice(index + 1).map((above) => `../${above}/*`),
              '../*.js',
              '@granum/*',
              ...REACT,
            ],
            message: `packages/core/src/${layer} may import only ${LAYERS.slice(0, index).join(', ') || 'itself'}; layers are data ← core ← dom ← map, and core has no React.`,
          },
        ],
      },
    ],
  },
}));

export default defineConfig([
  {
    // Hook rules for every React surface: the React package and the demo.
    files: ['packages/*/src/**/*.{ts,tsx}', 'demo/src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // @granum/react reaches core through its package entries, as a consumer would.
    files: ['packages/react/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/core/src/**',
                '../../core/**',
                '@granum/core/src/**',
                '@granum/core/dist/**',
              ],
              message: 'Import @granum/core, /data, /dom, /map, or /internal.',
            },
          ],
        },
      ],
    },
  },
  {
    // The demo proves what a consumer can build, so it uses public entries only.
    files: ['demo/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/packages/*/src/**',
                '@granum/*/src/**',
                '@granum/*/dist/**',
                '@granum/core/internal',
              ],
              message:
                'Import @granum/react, @granum/react/headless, @granum/core, its /data, /dom, or /map entries, or an adapter package.',
            },
          ],
        },
      ],
    },
  },
  {
    // Library browser APIs against each package's browserslist.
    files: ['packages/*/src/**/*.{ts,tsx}'],
    plugins: { compat },
    settings: {
      // Also check JavaScript built-ins such as Array.prototype.findLast, not only Web APIs.
      lintAllEsApis: true,
    },
    rules: { 'compat/compat': 'error' },
  },
  ...layerRules,
]);

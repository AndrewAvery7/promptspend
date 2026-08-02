import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'worker/node_modules',
      'worker/dist',
      // Regenerated from wrangler.jsonc by `wrangler types` on every worker
      // typecheck. Half a megabyte of machine-written declarations, and not
      // ours to lint or to fix.
      'worker/worker-configuration.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // The sync script is a CLI: printing is the point.
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // The service worker runs in its own global scope — `self` and the
    // registration APIs, none of `window` or `document`.
    files: ['public/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.serviceworker },
    },
  },
  {
    // The alerts worker runs on workerd. Its console output is not debug
    // clutter — logs are the only observability a Worker has, and the fan-out
    // counts printed after a notify run are how a delivery problem gets found.
    files: ['worker/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.worker, ...globals.node },
    },
    rules: { 'no-console': 'off' },
  },
);

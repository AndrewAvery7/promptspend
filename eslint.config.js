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
      'api/node_modules',
      'api/dist',
      'mcp/node_modules',
      'mcp/dist',
      'vscode/node_modules',
      'vscode/dist',
      // The Expo app has its own SDK-aware lint configuration and gate. Running
      // the web config over it both duplicates that work and treats generated
      // Metro bundles and Node maintenance scripts as browser source.
      'apps/mobile/**',
      // Wrangler's scratch directory. It holds the bundled output of the last
      // `wrangler dev` — machine-generated, transient, and linting it produced
      // a wall of errors about a file nobody wrote.
      '**/.wrangler',
      // Regenerated from wrangler.jsonc by `wrangler types` on every worker
      // typecheck. Half a megabyte of machine-written declarations, and not
      // ours to lint or to fix.
      'worker/worker-configuration.d.ts',
      'api/worker-configuration.d.ts',
      // Playwright's own output: traces, screenshots and a static HTML report.
      'test-results',
      'playwright-report',
      // Git worktrees, which land here as a complete second copy of the
      // repository nested inside the first. Linting it reports every problem
      // twice and, worse, reports false ones: the path-scoped override that
      // gives the service worker its globals matches `public/sw.js` and not
      // `.claude/worktrees/<branch>/public/sw.js`, so a checked-out branch
      // failed the lint with twenty-one undefined-global errors in a file that
      // is perfectly fine where it actually lives.
      '.claude',
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
    // These are CLIs: printing is the point.
    files: ['scripts/**/*.ts', 'tools/**/*.ts'],
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
    files: ['worker/**/*.ts', 'api/**/*.ts', 'mcp/**/*.ts', 'vscode/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.worker, ...globals.node },
    },
    rules: { 'no-console': 'off' },
  },
);

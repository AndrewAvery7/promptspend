import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages serves the site from /<repo>/ unless a custom domain is configured;
// set BASE_PATH=/ in the workflow when deploying to one. The dev server always
// serves from the root so local URLs stay simple.
const base = process.env.BASE_PATH ?? (process.env.NODE_ENV === 'production' ? '/token-tally/' : '/');

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // Source maps are ~4 MB and publishing them ships the whole codebase twice
    // over — once minified, once not — to every visitor's browser tools. The
    // source is on GitHub for anyone who wants to read it. Set
    // SOURCEMAP=1 locally when you actually need to debug a production build.
    sourcemap: process.env.SOURCEMAP === '1',
    // The tokenizer chunk is deliberately large and deliberately lazy, so the
    // generic warning is noise. `npm run check:budget` enforces the limit that
    // actually matters — the size of the initial payload.
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        // Keep the tokenizer out of the initial bundle — it is only fetched
        // when a visitor pastes text for an OpenAI-family model.
        manualChunks(id) {
          if (id.includes('js-tiktoken')) return 'tokenizer';
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Components and state orchestration were excluded, which meant the
      // coverage number described only the code that was already the most
      // carefully tested. Thresholds are set at roughly today's level so the
      // number can only go up; the engine and pipeline are held much higher
      // because that is where a silent error costs the most.
      include: ['src/lib/**/*.ts', 'src/state/**/*.ts', 'src/components/**/*.tsx', 'scripts/lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 75,
        branches: 70,
        'src/lib/engine/**': { lines: 90, statements: 90, functions: 90, branches: 80 },
        'scripts/lib/**': { lines: 90, statements: 90, functions: 90, branches: 80 },
      },
    },
  },
});

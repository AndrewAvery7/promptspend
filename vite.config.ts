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
    sourcemap: true,
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
      include: ['src/lib/**/*.ts', 'scripts/lib/**/*.ts'],
    },
  },
});

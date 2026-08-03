import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    // Same alias the site uses, pointed one level up. The tests import the real
    // engine on purpose: the claim is that this server cannot disagree with the
    // website, and that is only checkable against the actual implementation.
    alias: { '@': resolve(import.meta.dirname, '../src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

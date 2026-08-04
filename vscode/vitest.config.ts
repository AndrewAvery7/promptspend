import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    // Same alias the site and the MCP server use. The tests import the real
    // catalog and the real engine on purpose: the claim is that this extension
    // cannot disagree with the website, and that is only checkable against the
    // actual implementation.
    alias: { '@': resolve(import.meta.dirname, '../src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Each test file boots its own in-memory PGlite (a few seconds of WASM start-up).
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});

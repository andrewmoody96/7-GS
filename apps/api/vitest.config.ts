import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Each test file boots its own in-memory PGlite (a few seconds of WASM start-up).
    hookTimeout: 120_000,
    testTimeout: 60_000,
    // With TEST_DATABASE_URL every file shares one Postgres database, so run them in turn.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});

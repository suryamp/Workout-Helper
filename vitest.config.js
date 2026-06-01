import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles:  ['./tests/setup.js'],
    // Run test files sequentially so fake-IDB state doesn't bleed across files.
    // Within a file, tests still run in declaration order.
    sequence: { concurrent: false },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/server/**/*.test.ts'],
    testTimeout: 20000
  }
});

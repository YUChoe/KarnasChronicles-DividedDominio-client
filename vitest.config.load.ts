import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/load.test.ts'],
    testTimeout: 120000,
    hookTimeout: 30000,
    teardownTimeout: 30000
  }
});

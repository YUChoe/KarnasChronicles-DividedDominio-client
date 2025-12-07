import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/client/index.html')
      }
    }
  },
  server: {
    port: 5173
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
});

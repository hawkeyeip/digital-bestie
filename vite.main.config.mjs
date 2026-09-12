import { defineConfig } from 'vite';
import path from 'node:path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@services': path.resolve(__dirname, 'src/services'),
    },
  },
  build: {
    rollupOptions: {
      external: ['electron', 'node:fs', 'node:path', 'node:os'],
    },
  },
});

import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Two pages: the landing page at / and the product overview at /support.
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), support: resolve(__dirname, 'support/index.html') },
    },
  },
  // The explorer imports the reference payoff from packages/core.
  server: { port: 5191, fs: { allow: ['..'] } },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    host: 'localhost',
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/f': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    target: ['es2015'],
    minify: 'esbuild',
  },
});

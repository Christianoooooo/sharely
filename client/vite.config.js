import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  server: {
    port: 5173,
    strictPort: true,
    host: isTauri ? '127.0.0.1' : 'localhost',
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/f': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    target: isTauri ? ['chrome105', 'safari13'] : ['es2015'],
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});

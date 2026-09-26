import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: path.resolve(import.meta.dirname, './src/lib'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('srdCompendiumSeed.json')) {
            return 'compendium-data';
          }
          if (id.includes('pdfjs-dist')) {
            return 'pdf-engine';
          }
          if (id.includes('pixi.js') || id.includes('@pixi')) {
            return 'pixi-vendor';
          }
          if (id.includes('/routes/play/') || id.includes('\\routes\\play\\')) {
            return 'route-play';
          }
          if (id.includes('/routes/projector/') || id.includes('\\routes\\projector\\')) {
            return 'route-projector';
          }
          if (id.includes('/routes/mobile/') || id.includes('\\routes\\mobile\\')) {
            return 'route-mobile';
          }
          if (id.includes('node_modules')) {
            if (id.includes('jszip')) return 'jszip-vendor';
            if (id.includes('dexie')) return 'dexie-vendor';
            if (id.includes('@tauri-apps')) return 'tauri-vendor';
            if (id.includes('svelte')) return 'svelte-vendor';
          }
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4242',
        changeOrigin: true,
        timeout: 120000,
        configure: (proxy) => {
          proxy.on('error', (err, _req, _res) => {
            console.warn('[ViteProxy] /api proxy error:', err.message);
          });
        },
      },
      '/ws': {
        target: 'ws://127.0.0.1:4242',
        ws: true,
        timeout: 120000,
        configure: (proxy) => {
          proxy.on('error', (err, _req, _res) => {
            console.warn('[ViteProxy] /ws proxy error:', err.message);
          });
        },
      },
    },
  },
});

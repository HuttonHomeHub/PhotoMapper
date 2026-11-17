import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { hhhThemeInit } from '@hhh/config/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cloudflare Rocket Loader rewrites <script> tags and injects an inline loader to
// run them. Our strict CSP (script-src 'self', no unsafe-inline) blocks that
// inline script, which blanks the SPA behind Cloudflare. `data-cfasync="false"`
// tells Rocket Loader to leave our entry script alone — so it loads normally and
// the CSP stays strict, with no Cloudflare-wide setting change needed.
const cfAsyncFalse = {
  name: 'cf-async-false',
  // 'post': after other plugins have added their tags (e.g. theme-init.js).
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      return html.replace(/<script /g, '<script data-cfasync="false" ');
    },
  },
};

export default defineConfig({
  // hhhThemeInit: loads the design system's theme before first paint (no inline script).
  plugins: [react(), cfAsyncFalse, hhhThemeInit()],
  resolve: {
    alias: {
      'heatmap.js': path.resolve(__dirname, 'src/lib/heatmap-patched.js'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
      // The app bar reads the running version from here.
      '/version': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
  },
  optimizeDeps: {
    include: ['leaflet.markercluster', 'leaflet-heatmap', 'heatmap.js'],
  },
});

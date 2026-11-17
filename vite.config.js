import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cloudflare Rocket Loader rewrites <script> tags and injects an inline loader to
// run them. Our strict CSP (script-src 'self', no unsafe-inline) blocks that
// inline script, which blanks the SPA behind Cloudflare. `data-cfasync="false"`
// tells Rocket Loader to leave our entry script alone — so it loads normally and
// the CSP stays strict, with no Cloudflare-wide setting change needed.
const cfAsyncFalse = {
  name: 'cf-async-false',
  transformIndexHtml(html) {
    return html.replace(/<script /g, '<script data-cfasync="false" ');
  },
};

// The design system's theme-init.js must run before first paint, as a plain same-origin
// script (the CSP allows no inline script). Serve it at /theme-init.js in dev and emit
// it beside index.html in the build, straight from the vendored @hhh/ui.
const themeInitPath = path.resolve(__dirname, 'node_modules/@hhh/ui/theme-init.js');
const themeInit = {
  name: 'hhh-theme-init',
  configureServer(server) {
    server.middlewares.use('/theme-init.js', (_req, res) => {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(readFileSync(themeInitPath));
    });
  },
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'theme-init.js',
      source: readFileSync(themeInitPath, 'utf8'),
    });
  },
};

export default defineConfig({
  plugins: [react(), cfAsyncFalse, themeInit],
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

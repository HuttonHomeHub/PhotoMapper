import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'heatmap.js': path.resolve(__dirname, 'src/lib/heatmap-patched.js')
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001'
    }
  },
  build: {
    outDir: 'dist'
  },
  optimizeDeps: {
    include: ['leaflet.markercluster', 'leaflet-heatmap', 'heatmap.js']
  }
})

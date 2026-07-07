import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy ALL /api/* to the Express backend.
      // SSE (/api/youtube-stream) works automatically — http-proxy passes
      // through the text/event-stream response without buffering when the
      // server calls res.flushHeaders() and sets Cache-Control: no-cache.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Allow <video> elements to load files served by the backend
            proxyRes.headers['cross-origin-resource-policy'] = 'cross-origin';
          });
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})


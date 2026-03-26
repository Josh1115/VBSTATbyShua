import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/VBSTATbyShua/',
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    allowedHosts: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.js'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory-')) return 'charts';
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) return 'export';
          if (id.includes('node_modules/dexie')) return 'dexie';
          if (id.includes('node_modules/react-dom')) return 'react-dom';
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'offline.html'],
      manifest: {
        name: 'VBAPPv.2',
        short_name: 'VBAPPv2',
        description: 'Volleyball stat tracking app',
        theme_color: '#f97316',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/VBSTATbyShua/',
        icons: [
          { src: '/VBSTATbyShua/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/VBSTATbyShua/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/VBSTATbyShua/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/VBSTATbyShua/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        // Take control of all open tabs immediately when a new SW activates.
        // Without this, old code keeps running in open tabs until a manual reload.
        clientsClaim: true,

        // Serve offline.html if navigation fails while offline
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [/^\/api\//],

        // Pre-cache all built assets (content-hashed filenames handle versioning)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
})

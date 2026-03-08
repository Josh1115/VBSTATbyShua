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
        // Serve offline.html if navigation fails while offline
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [/^\/api\//],

        // Cache app shell (JS, CSS, HTML) with CacheFirst
        runtimeCaching: [
          {
            urlPattern: /\.(?:js|css|html)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-shell-v1',
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\.(?:png|svg|ico|woff2?)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-v1',
              expiration: { maxEntries: 40, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],

        // Pre-cache all built assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/connectx-favicon-64.png',
        'icons/connectx-apple-touch-180.png',
        'brand/connectx-logo.webp',
      ],
      manifest: {
        id: '/',
        name: 'ConnectX',
        short_name: 'ConnectX',
        description: 'ConnectX — resilient offline-first hybrid messaging. Stay Connected. Anywhere.',
        theme_color: '#07113f',
        background_color: '#030a30',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        categories: ['social', 'communication', 'utilities'],
        icons: [
          {
            src: '/icons/connectx-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/connectx-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/connectx-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Chats',
            short_name: 'Chats',
            description: 'Open ConnectX conversations',
            url: '/messages',
            icons: [{ src: '/icons/connectx-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'SOS & Location',
            short_name: 'SOS',
            description: 'Open emergency and location tools',
            url: '/sos',
            icons: [{ src: '/icons/connectx-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})

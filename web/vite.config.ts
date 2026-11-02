import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'chrome >= 52', 'safari >= 11'],
      modernPolyfills: true,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Alamida Monitoring',
        short_name: 'Monitoring',
        description:
          'Live-Disposition, Wandmonitor und Kühlraum-Übersicht für Sterbefälle.',
        lang: 'de',
        dir: 'ltr',
        theme_color: '#0a0c10',
        background_color: '#0a0c10',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/wall',
        categories: ['business', 'medical', 'productivity'],
        shortcuts: [
          {
            name: 'Übersicht',
            short_name: 'Übersicht',
            description: 'Kühlraum, Extern und Termine heute',
            url: '/widget/summary',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Kühlraum',
            short_name: 'Kühlraum',
            description: 'Belegung Grafenbach',
            url: '/widget/kuehlraum',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Extern',
            short_name: 'Extern',
            description: 'Fälle außerhalb',
            url: '/widget/extern',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Heute',
            short_name: 'Heute',
            description: 'Termine und Abholungen heute',
            url: '/widget/heute',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Disposition',
            short_name: 'Board',
            description: 'Disposition öffnen',
            url: '/disposition',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,webmanifest}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
});

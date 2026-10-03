import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        id: '/',
        name: '7-Game Series',
        short_name: '7GS',
        description: 'Every week is a best-of-7 playoff series. Win the day by finishing your lineup.',
        theme_color: '#123d2a',
        background_color: '#0c1f16',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['productivity', 'lifestyle', 'health'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell: everything the build emits (the plugin adds the manifest itself),
        // plus the Latin font subsets.
        globPatterns: [
          '**/*.{js,css,html,svg,png}',
          '**/*-latin-wght-normal-*.woff2',
          '**/*-latin-ext-wght-normal-*.woff2',
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/v1\//],
        runtimeCaching: [
          {
            // DATA_MODEL §9: the day's game, the series and the roster stay readable offline.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              url.origin === self.location.origin &&
              /^\/v1\/(?:today|series\/current|tasks|starters)$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: '7gs-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 16, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: '7gs-fonts',
              expiration: { maxEntries: 24, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks cache across app releases.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|cookie)[\\/]/ },
            { name: 'query', test: /node_modules[\\/]@tanstack[\\/]/ },
            { name: 'zod', test: /node_modules[\\/]zod[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/v1': { target: API_TARGET, changeOrigin: true } },
  },
  preview: {
    port: 4173,
    proxy: { '/v1': { target: API_TARGET, changeOrigin: true } },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
});

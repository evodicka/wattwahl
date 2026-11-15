import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { buildId, contentSecurityPolicy } from './build/html';

// base is fixed to "/" because the app is served from the custom domain
// https://wattwahl.evodicka.dev (architecture 7.2). Do not change it.
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    buildId(),
    contentSecurityPolicy(),
    // Precache of every build file, an update prompt instead of a silent
    // update (architecture 8.12). The registration is made by src/pwa.
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Wattwahl',
        short_name: 'Wattwahl',
        description:
          'Vergleich von E-Auto-Angeboten, offline auf diesem Gerät.',
        lang: 'de',
        display: 'standalone',
        start_url: './#/',
        scope: './',
        background_color: '#f5f4f0',
        theme_color: '#0b5f6e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // The app has one page; its routes live in the hash.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // The core worker is a module worker (src/worker), bundled as ES module.
  worker: { format: 'es' },
  // Keep fonts and small files as files: the policy has no `font-src data:`.
  build: { assetsInlineLimit: 0 },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
          exclude: ['src/ui/**'],
          // The property tests (Q4: 100,000 cases) and the Q1 workload run
          // about 4 times slower on a CI runner than on a laptop, and the default
          // of 5 s is not enough there.
          testTimeout: 30_000,
          benchmark: { include: ['src/**/*.bench.ts', 'tests/**/*.bench.ts'] },
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/ui/**/*.test.{ts,tsx}'],
          setupFiles: ['src/ui/__tests__/setup.ts'],
          alias: {
            // The registration module exists only in a build (src/ui/__tests__/registerStub.ts).
            'virtual:pwa-register/react': fileURLToPath(
              new URL('./src/ui/__tests__/registerStub.ts', import.meta.url),
            ),
          },
          benchmark: { include: [] },
        },
      },
    ],
  },
});

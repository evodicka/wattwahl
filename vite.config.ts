import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// base is fixed to "/" because the app is served from the custom domain
// https://wattwahl.evodicka.dev (architecture 7.2). Do not change it.
export default defineConfig({
  base: '/',
  plugins: [react()],
  // The core worker is a module worker (src/worker), bundled as ES module.
  worker: { format: 'es' },
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
          benchmark: { include: [] },
        },
      },
    ],
  },
});

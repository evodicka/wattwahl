import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// base is fixed to "/" because the app is served from the custom domain
// https://wattwahl.evodicka.dev (architecture 7.2). Do not change it.
export default defineConfig({
  base: '/',
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
          exclude: ['src/ui/**'],
          benchmark: { include: ['src/**/*.bench.ts', 'tests/**/*.bench.ts'] },
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/ui/**/*.test.{ts,tsx}'],
          benchmark: { include: [] },
        },
      },
    ],
  },
});

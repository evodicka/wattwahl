import { defineConfig, devices } from '@playwright/test';

// Browser benchmark of S11 (`npm run bench:browser`). Test-only: it serves the
// page in bench/ with the Vite dev server, is not part of the CI pipeline and
// never reaches `dist`. One worker at a time so the runs do not disturb each other.
export default defineConfig({
  testDir: 'bench',
  testMatch: '**/*.browser.ts',
  timeout: 300_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4174' },
  webServer: {
    command: 'npx vite --port 4174 --strictPort',
    url: 'http://localhost:4174/bench/index.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});

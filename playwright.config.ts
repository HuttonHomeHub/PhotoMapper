import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against a running PhotoMapper: the built Docker image, started by
// scripts/e2e.sh on a throwaway volume (BASE_URL points at it). Run through
// scripts/check.sh, locally and in CI; never with browsers installed on CT 106.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e-results',
  fullyParallel: false,
  workers: 1, // the tests share one server and reset its data before each test
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

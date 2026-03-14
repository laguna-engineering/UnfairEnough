import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'], baseURL: 'http://localhost:8081' },
      testDir: './e2e/mobile',
    },
    {
      name: 'TV Host',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:8082' },
      testDir: './e2e/tv-host',
    },
  ],
  webServer: [
    {
      command: 'yarn dev:mobile --web',
      url: 'http://localhost:8081',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'yarn tv web',
      url: 'http://localhost:8082',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

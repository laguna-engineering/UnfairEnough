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
      use: {
        ...devices['Pixel 5'],
        baseURL: 'http://localhost:8081',
        // Pixel 5's built-in viewport is a short 393x727. Override with a
        // 9:19.5 portrait screen, the shape of every phone since ~2020, so
        // screenshots show what players actually hold.
        viewport: { width: 390, height: 844 },
      },
      testDir: './e2e/mobile',
    },
    {
      name: 'TV Host',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8082',
        // The app is built for 1080p TVs; anything smaller reflows into layouts
        // no real device ever shows.
        viewport: { width: 1920, height: 1080 },
      },
      testDir: './e2e/tv-host',
    },
  ],
  webServer: [
    {
      command: 'yarn dev:mobile --web',
      url: 'http://localhost:8081',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Tests assert on English copy. Without this the developer's root .env
      // (DEFAULT_LANG=it, say) decides the language and every assertion misses.
      env: { DEFAULT_LANG: 'en' },
    },
    {
      command: 'yarn tv web',
      url: 'http://localhost:8082',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { DEFAULT_LANG: 'en' },
    },
  ],
});

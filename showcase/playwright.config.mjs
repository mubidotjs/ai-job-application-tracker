import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './browser',
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  use: {
    baseURL: process.env.SHOWCASE_BASE_URL || 'http://127.0.0.1:3102',
    trace: 'retain-on-failure',
    browserName: 'chromium',
  },
  webServer: process.env.SHOWCASE_BASE_URL
    ? undefined
    : {
        command: 'npm run preview',
        url: 'http://127.0.0.1:3102',
        reuseExistingServer: false,
        timeout: 30000,
      },
});

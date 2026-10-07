import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    launchOptions:
      process.platform === 'darwin'
        ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
        : {},
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: 'npx --no-install tsx server/dev.ts',
      url: 'http://127.0.0.1:4318/api/network/health',
      env: { KIN_DATA_DIR: resolve('artifacts', `playwright-relay-${randomUUID()}`) },
      // Never run owner pairing, deletion, or network tests against a personal server.
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npx --no-install vite --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});

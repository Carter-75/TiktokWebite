import { defineConfig, devices } from '@playwright/test';

const DEFAULT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const DEFAULT_COMMAND = process.env.PLAYWRIGHT_START_COMMAND ?? 'npm run dev -- --hostname 127.0.0.1 --port 3000';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { outputFolder: 'test-results/playwright' }], ['list']] : 'list',
  use: {
    baseURL: DEFAULT_BASE_URL,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: DEFAULT_COMMAND,
    url: DEFAULT_BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_E2E: process.env.NEXT_PUBLIC_E2E ?? 'true',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:5175',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 950 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: 'npx tsx tests/browser/fixture-server.ts',
      url: 'http://127.0.0.1:7497/api/auth/status',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5175 --strictPort',
      url: 'http://127.0.0.1:5175',
      env: { PORT: '7497' },
      reuseExistingServer: !process.env.CI,
    },
  ],
});

// Playwright config for tiny-world-builder Chang'an ward sim tests.
// Reuses the existing tools/dev-server.js (npm run dev). Default port 3000.
// Override base URL with TWB_BASE_URL env var if dev-server is on a different port.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 0,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report' }]],
  use: {
    baseURL: process.env.TWB_BASE_URL || 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.TWB_NO_WEBSERVER ? undefined : {
    command: 'node tools/dev-server.js',
    cwd: '../..',
    url: 'http://localhost:3000/tiny-world-builder',
    reuseExistingServer: true,
    timeout: 10_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

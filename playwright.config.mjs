// Playwright config for the console.
//
// The tests start the real server (`tools/serve-console.mjs`) and talk to it over
// loopback, exactly as `make dev` does. No mocks, no fixtures beyond the
// snapshot the contract produced.

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  // Two real servers: the console, and the read API the control-plane route
  // probes. Starting both means the probe is exercised for real instead of
  // being asserted from a mock.
  webServer: [
    {
      command: `node tools/serve-console.mjs ${PORT}`,
      url: `http://127.0.0.1:${PORT}/health`,
      reuseExistingServer: true,
      timeout: 20_000,
    },
    {
      command: 'node tools/api-server.mjs 4174',
      url: 'http://127.0.0.1:4174/health',
      reuseExistingServer: true,
      timeout: 20_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

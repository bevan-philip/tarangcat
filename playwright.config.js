import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:8097',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node build.mjs && node serve.mjs 8097',
    url: 'http://127.0.0.1:8097',
    reuseExistingServer: false,
  },
})

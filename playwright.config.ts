import { defineConfig, devices } from "@playwright/test";
const base = process.env.PHOTONIC_BASE_PATH ?? "";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 2,
  retries: 0,
  maxFailures: 4,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:3000${base}/`,
    acceptDownloads: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium-light", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "chromium-dark", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "firefox-light", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 1000 } } },
    { name: "firefox-dark", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 1000 } } },
    { name: "webkit-light", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 1000 } } },
    { name: "webkit-dark", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile-light", use: { ...devices["iPhone 13"], browserName: "webkit" } },
    { name: "mobile-dark", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  webServer: {
    command: "node scripts/serve.mjs",
    url: `http://127.0.0.1:3000${base}/`,
    reuseExistingServer: !process.env.CI,
  },
});

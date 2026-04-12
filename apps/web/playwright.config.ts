import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Railbird web app E2E and a11y tests.
 *
 * Assumptions:
 * - `next dev` is running on port 3000 (or CI starts it via `webServer`)
 * - Tests mock all API / WebSocket calls — no real backend required
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  timeout: 30_000,
  expect: { timeout: 10_000 },
});

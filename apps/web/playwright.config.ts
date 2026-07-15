import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:5188",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    channel: "chrome"
  },
  webServer: {
    command: "npm run dev",
    cwd: "../..",
    url: "http://127.0.0.1:5188",
    reuseExistingServer: true,
    timeout: 30_000
  }
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:5190",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    channel: "chrome"
  },
  webServer: {
    command: "VITE_PORT=5190 PORT=18081 VITE_WS_URL=ws://127.0.0.1:18081/ws npm run dev",
    cwd: "../..",
    url: "http://127.0.0.1:5190",
    reuseExistingServer: false,
    timeout: 30_000
  }
});

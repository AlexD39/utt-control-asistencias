import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://localhost:3101", trace: "retain-on-failure" },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --port 3101",
    url: "http://localhost:3101/login",
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});

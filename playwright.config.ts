import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets parallel runs use another port.
const port = Number(process.env.E2E_PORT ?? 8765);

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  // One server per run with a fresh database (scripts/e2e-server.ts).
  webServer: {
    command: `bun scripts/e2e-server.ts ${port}`,
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});

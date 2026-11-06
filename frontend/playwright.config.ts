import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "../work/playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: "http://127.0.0.1:5173",
      env: { VITE_ENABLE_UAT_TOOLS: "false" },
      reuseExistingServer: true,
    },
    {
      command: "npm run dev -- --port 5175 --strictPort",
      url: "http://127.0.0.1:5175",
      env: { VITE_ENABLE_UAT_TOOLS: "true" },
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: "normal", testIgnore: "uat-auth.spec.ts" },
    { name: "uat", testMatch: "uat-auth.spec.ts", use: { baseURL: "http://127.0.0.1:5175" } },
  ],
  outputDir: "../work/playwright-results",
});

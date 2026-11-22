import { defineConfig, devices } from "@playwright/test";

const huaweiBrowser =
  "Mozilla/5.0 (Linux; Android 12; HarmonyOS; DBR-W09; HMSCore 6.13.0.302) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/15.0.4.312 Safari/537.36";
const huaweiTablet = {
  userAgent: huaweiBrowser,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  defaultBrowserType: "chromium" as const,
};
const fakeCamera = {
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
};

export default defineConfig({
  testDir: ".",
  testMatch: ["tests-devices/**/*.spec.ts", "tests/towntrack.spec.ts"],
  timeout: 300000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "../work/devices-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
  },
  projects: [
    { name: "ios-iphone-15", use: { ...devices["iPhone 15"] } },
    { name: "android-pixel-7", use: { ...devices["Pixel 7"], ...fakeCamera } },
    {
      name: "huawei-matepad-portrait",
      use: { ...huaweiTablet, viewport: { width: 800, height: 1280 }, ...fakeCamera },
    },
    {
      name: "huawei-matepad-landscape",
      use: { ...huaweiTablet, viewport: { width: 1280, height: 800 }, ...fakeCamera },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
  outputDir: "../work/devices-results",
});

import { test, expect } from "@playwright/test";
import { openReport } from "./product-flow";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const data: Record<string, unknown> = {
      "/api/auth/me": { id: "u", display_name: "ผู้ทดสอบ", role: "CITIZEN" },
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/public/map-config": { provider: "leaflet", publicToken: "" },
      "/api/catalog": {
        categories: [
          { id: "c1", name: "ถนนและทางเท้า", fields: [] },
          { id: "c2", name: "หมวดที่เทศบาลตั้งเอง", fields: [] },
        ],
        departments: [],
      },
      "/api/municipal-center": { latitude: 13.75, longitude: 100.5 },
      "/api/community/complaints": { items: [], top: [], total: 0, stats: {} },
    };
    return route.fulfill({ json: data[path] ?? [] });
  });
});

test("the interface uses the Gov theme only, with no dark mode switch", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".theme-switcher")).toHaveCount(0);
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).not.toBe("rgb(14, 24, 19)");
});

test("phone header keeps language, profile and sign-out on one row", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");
  const controls = page.locator(".account-controls");
  await expect(controls.locator(".language-switcher")).toBeVisible();
  const centres = await controls.locator(".language-switcher, .ant-btn").evaluateAll((nodes) =>
    nodes
      .filter((node) => (node as HTMLElement).offsetParent)
      .map((node) => {
        const box = node.getBoundingClientRect();
        return Math.round(box.top + box.height / 2);
      }),
  );
  expect(centres.length).toBeGreaterThanOrEqual(3);
  expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("login switches language with TH/EN and refuses Thai in email and password", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/public/gov-auth", (route) =>
    route.fulfill({
      json: {
        configured: true,
        mode: "local",
        iamAuthUrl: "https://auth.govcenter.co",
        serviceCode: "ui-test",
        callbackUrl: new URL(route.request().url()).origin + "/auth/callback",
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "English", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "ภาษาไทย", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
  const warning = "ใช้ภาษาอังกฤษ ตัวเลข หรือสัญลักษณ์เท่านั้น ตรวจว่าแป้นพิมพ์ไม่ได้เป็นภาษาไทย";
  await page.getByLabel("อีเมล", { exact: true }).fill("ฟไกฟไกฟไ");
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill("ฟไกฟไกฟไก");
  await expect(page.getByText(warning, { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "สมัครสมาชิก", exact: true }).click();
  await page.getByLabel("ชื่อ-นามสกุล", { exact: true }).fill("สมชาย ใจดี");
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill("ยืนยันไทย");
  await expect(page.getByText(warning, { exact: true })).toHaveCount(1);
});

test("default category names follow the language while custom ones stay as written", async ({
  page,
}) => {
  await page.goto("/");
  await openReport(page);
  const categories = page.locator(".report-categories");
  await expect(categories).toContainText("ถนนและทางเท้า");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(categories).toContainText("Roads and footpaths");
  await expect(categories).toContainText("หมวดที่เทศบาลตั้งเอง");
});

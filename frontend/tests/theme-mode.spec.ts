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

test("dark mode is chosen from the header and survives a reload", async ({ page }) => {
  await page.goto("/");
  const mode = page.getByRole("combobox", { name: "โหมดสี", exact: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await mode.selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const colours = () =>
    page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return [style.backgroundColor, style.color];
    });
  const [background, text] = await colours();
  expect(background).not.toBe(text);
  expect(background).toBe("rgb(14, 24, 19)");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("combobox", { name: "โหมดสี", exact: true }).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("login page switches to dark mode with readable fields", async ({ page }) => {
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
  await page.getByRole("combobox", { name: "โหมดสี", exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const background = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  // Inputs fade between colours, so wait for the dark surface to settle.
  await expect.poll(() => background(".auth-card input[type=email]")).toBe("rgb(22, 34, 28)");
  await expect.poll(() => background(".auth-card .ant-input-password")).toBe("rgb(22, 34, 28)");
  expect(await background(".auth-card .ant-input-password input")).toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: "../work/screenshots/login-dark.png" });
});

test("default category names follow the language while custom ones stay as written", async ({
  page,
}) => {
  await page.goto("/");
  await openReport(page);
  const categories = page.locator(".report-categories");
  await expect(categories).toContainText("ถนนและทางเท้า");
  await page.getByRole("combobox", { name: "Language / ภาษา" }).selectOption("en");
  await expect(categories).toContainText("Roads and footpaths");
  await expect(categories).toContainText("หมวดที่เทศบาลตั้งเอง");
});

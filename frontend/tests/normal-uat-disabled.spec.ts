import { expect, test } from "@playwright/test";
test("normal build defaults to no simulation tools before or after login", async ({ page }) => {
  let signedIn = false;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill({
        status: signedIn ? 200 : 401,
        json: { id: "normal-user", display_name: "Normal person", role: "FIELD" },
      });
    return route.fulfill({
      json:
        path === "/api/privacy"
          ? { acknowledged: true }
          : path === "/api/complaints"
            ? { items: [], total: 0, stats: {} }
            : { categories: [], queues: [] },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ", exact: true })).toBeVisible();
  await expect(page.locator(".uat-auth-tools")).toHaveCount(0);
  signedIn = true;
  await page.reload();
  await expect(page.getByText("Normal person", { exact: true })).toBeVisible();
  await expect(page.locator(".uat-auth-tools")).toHaveCount(0);
});

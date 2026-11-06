import { test, expect } from "@playwright/test";

for (const role of ["OFFICER", "LEADER", "FIELD", "ADMIN"]) {
  for (const width of [390, 1440]) {
    test(`${role} uses ordinary queues without route planning at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        const data: Record<string, unknown> = {
          "/api/auth/me": {
            id: "retirement-test",
            display_name: "ผู้ทดสอบ",
            role,
            department_id: ["LEADER", "FIELD"].includes(role) ? "engineering" : null,
          },
          "/api/privacy": { version: "test", acknowledged: true },
          "/api/catalog": { categories: [], departments: [], queues: [] },
          "/api/complaints": {
            items: [],
            total: 0,
            stats: { total: 0, in_progress: 0, closed: 0, overdue: 0 },
          },
        };
        await route.fulfill({ json: data[path] ?? {} });
      });
      await page.goto("/");
      await expect(page.locator(".staff-workspace")).toBeVisible();
      if (width < 1024)
        await page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
      await expect(
        page.getByRole("menuitem", {
          name: /วางแผนเส้นทาง|รอบงานของฉัน|รอบงานลงพื้นที่/,
        }),
      ).toHaveCount(0);
      await page.getByRole("menuitem", { name: /คิวงาน/ }).click();
      await expect(page.locator(".staff-workspace .queue-panel")).toBeVisible();
      await expect(page.getByRole("button", { name: /โหลดใหม่/ })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (role === "LEADER" && width === 1440)
        await page.screenshot({ path: "../work/screenshots/route-planning-removed.png" });
    });
  }
}

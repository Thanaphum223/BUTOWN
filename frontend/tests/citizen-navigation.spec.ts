import { test, expect } from "@playwright/test";
import { openReport, confirmLocation } from "./product-flow";

for (const width of [320, 440, 1280]) {
  test(`citizen identity and main menu remain usable through report steps at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 13.75, longitude: 100.5 });
    const name = "ประชาชนทดสอบชื่อยาวสำหรับตรวจการแสดงผลบนโทรศัพท์";
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const payload: Record<string, unknown> = {
        "/api/auth/me": { id: "ui-citizen", display_name: name, role: "CITIZEN" },
        "/api/privacy": { version: "test", acknowledged: true },
        "/api/catalog": { categories: [], departments: [] },
        "/api/municipal-center": { latitude: 13.75, longitude: 100.5 },
        "/api/community/complaints": { items: [], total: 0, top: [], statistics: {} },
        "/api/geocoding/reverse": { display_name: "ถนนสำหรับทดสอบเมนู" },
        "/api/complaints/nearby": [],
      };
      await route.fulfill({ json: payload[path] ?? {} });
    });
    await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
    await page.goto("/");
    await expect(page.getByText(`สวัสดี, ${name}`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "ขยายขนาดตัวอักษร", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "ย่อขนาดตัวอักษร", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.getByRole("button", { name: "ย่อขนาดตัวอักษร", exact: true }).click();
    const menu = page.getByRole("navigation", { name: "เมนูประชาชน", exact: true });
    await expect(menu).toBeVisible();
    await openReport(page);
    await expect(page.getByRole("button", { name: "กลับหน้าหลัก", exact: true })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: /แจ้งปัญหา/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await confirmLocation(page, "สถานที่ทดสอบเมนู");
    await expect(menu).toBeVisible();
    await page.getByRole("button", { name: "ย้อนกลับ", exact: true }).click();
    await expect(page.getByLabel("สถานที่ / จุดสังเกต", { exact: true })).toHaveValue(
      "สถานที่ทดสอบเมนู",
    );
    await page.screenshot({ path: `../work/screenshots/gov-report-${width}.png` });
    await menu.getByRole("link", { name: /หน้าหลัก/ }).click();
    await expect(
      page.getByRole("heading", { name: "เรื่องแจ้งในเทศบาล", exact: true }),
    ).toBeVisible();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({ path: `../work/screenshots/gov-home-${width}.png` });
    expect(
      await page.evaluate(() => document.fonts.check('16px "Noto Sans Thai Variable"', "ทดสอบ")),
    ).toBeTruthy();
  });
}

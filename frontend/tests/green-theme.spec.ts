import { test, expect, type Locator, type Page } from "@playwright/test";

async function boundary(page: Page, role?: "ADMIN" | "CITIZEN") {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const payload: Record<string, unknown> = {
      "/api/auth/me": role ? { id: "theme-user", display_name: "ผู้ใช้ตัวอย่าง", role } : null,
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/catalog": { categories: [], departments: [] },
      "/api/municipal-center": { latitude: 13.75, longitude: 100.5 },
      "/api/community/complaints": { items: [], total: 0, top: [], statistics: {} },
      "/api/complaints": {
        items: [],
        total: 0,
        stats: { total: 0, in_progress: 0, closed: 0, overdue: 0 },
      },
      "/api/public/gov-auth": {
        configured: true,
        mode: "local",
        iamAuthUrl: "https://auth.govcenter.co",
        serviceCode: "theme-test",
        callbackUrl: "http://127.0.0.1:5173/auth/callback",
      },
    };
    await route.fulfill({
      status: path === "/api/auth/me" && !role ? 401 : 200,
      json: payload[path] ?? {},
    });
  });
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
}

async function paint(el: Locator, property = "color", backdrop?: number[]) {
  return el.evaluate(
    (node, { prop, backdrop }) => {
      const ctx = document.createElement("canvas").getContext("2d")!;
      if (backdrop) {
        ctx.fillStyle = `rgb(${backdrop.join(",")})`;
        ctx.fillRect(0, 0, 1, 1);
      }
      ctx.fillStyle = getComputedStyle(node).getPropertyValue(prop);
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
    },
    { prop: property, backdrop },
  );
}
async function green(el: Locator, property = "color") {
  const [r, g, b] = await paint(el, property);
  expect(g).toBeGreaterThan(r);
  expect(g).toBeGreaterThan(b);
}
async function readable(el: Locator, background: Locator = el) {
  const luminance = (rgb: number[]) =>
    rgb
      .map((c) => c / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const backdrop = await paint(background, "background-color");
  const values = [luminance(await paint(el, "color", backdrop)), luminance(backdrop)].sort(
    (a, b) => b - a,
  );
  expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
}

test("compact Gov login and signup keep readable green controls and focus", async ({ page }) => {
  await boundary(page);
  await page.goto("/");
  const email = page.getByRole("textbox", { name: "อีเมล", exact: true });
  await email.waitFor();
  await green(page.locator(".auth-card .ant-form-item-label label").first());
  const login = page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true });
  await green(login, "background-color");
  await readable(login);
  await email.focus();
  await green(email, "border-top-color");
  await page.getByRole("button", { name: "สมัครสมาชิก", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "ชื่อ-นามสกุล", exact: true })).toBeVisible();
  await green(
    page.getByRole("button", { name: "สมัครและเข้าสู่ระบบ", exact: true }),
    "background-color",
  );
  await page.screenshot({ animations: "disabled", path: "../work/screenshots/green-register.png" });
});

for (const width of [440, 1280]) {
  test(`staff navigation and header use readable green branding at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await boundary(page, "ADMIN");
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "ภาพรวมการดำเนินงาน", exact: true }),
    ).toBeVisible();
    const header = page.locator(".topbar");
    await green(header, "background-color");
    await readable(page.locator(".header-identity strong"), header);
    await readable(page.locator(".header-identity small"), header);
    await readable(
      page.locator(".staff-overview > .page-heading .ant-typography-secondary"),
      page.locator("body"),
    );
    await green(page.locator(".overview-summary-cards .ant-statistic-content").first());
    await readable(page.getByRole("button", { name: "เปิดคิวงาน", exact: true }));
    if (width >= 1024) {
      await green(page.locator(".staff-shell .sidebar"), "background-color");
      await readable(page.locator(".sidebar .ant-menu-item-selected"));
    } else {
      await page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await green(page.getByRole("dialog").locator(".ant-menu-item-selected"), "color");
      await readable(page.getByRole("dialog").locator(".ant-menu-item-selected"));
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({
      animations: "disabled",
      path: `../work/screenshots/green-staff-${width}.png`,
    });
  });
  test(`citizen navigation and reporting retain the same green identity at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await boundary(page, "CITIZEN");
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "เมนูประชาชน", exact: true });
    await expect(nav).toBeVisible();
    await green(page.locator(".community-home h2"));
    await readable(page.locator(".header-identity strong"), page.locator(".topbar"));
    await readable(page.locator(".header-identity small"), page.locator(".topbar"));
    await nav.getByRole("link", { name: /แจ้งปัญหา/ }).click();
    await green(nav.locator('[aria-current="page"]'));
    await expect(page.getByRole("heading", { name: "เกิดเหตุที่ไหน?", exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({
      animations: "disabled",
      path: `../work/screenshots/green-report-${width}.png`,
    });
  });
}

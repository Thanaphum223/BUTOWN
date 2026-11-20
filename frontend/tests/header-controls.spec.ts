import { expect, test, type Page } from "@playwright/test";

type Account = "nonadmin" | "administrator" | "citizen";
const longName = "ผู้ใช้ทดสอบชื่อยาวสำหรับการจัดวางบัญชี Municipal service account";

async function header(page: Page, account: Account) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const payload: Record<string, unknown> = {
      "/api/auth/me": {
        id: "header-user",
        display_name: longName,
        role: account === "citizen" ? "CITIZEN" : "FIELD",
        account_role: account === "administrator" ? "ADMIN" : undefined,
        department_id: "header-department",
      },
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/catalog": {
        categories: [],
        departments: [
          {
            id: "header-department",
            name: "สำนักช่างและบริการเทศบาล Department of municipal engineering services",
          },
        ],
        queues: [],
      },
      "/api/municipal-center": { latitude: 13.75, longitude: 100.5 },
      "/api/community/complaints": { items: [], total: 0, top: [], statistics: {} },
      "/api/complaints": {
        items: [],
        total: 0,
        stats: { total: 0, in_progress: 0, closed: 0, overdue: 0 },
      },
    };
    await route.fulfill({ json: payload[path] ?? {} });
  });
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".topbar")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function fitsHeader(page: Page, language: "th" | "en") {
  const topbar = page.locator(".topbar");
  const logout = topbar.getByRole("button", {
    name: language === "th" ? "ออกจากระบบ" : "Sign out",
    exact: true,
  });
  await expect(logout).toBeVisible();
  await expect(
    topbar.getByRole("button", {
      name: language === "th" ? "ข้อมูล Gov Center" : "Gov Center profile",
      exact: true,
    }),
  ).toBeVisible();
  const bounds = await topbar.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const boxes = Array.from(
      node.querySelectorAll(
        ":scope > button, .header-identity, .account-controls > .ant-space-item",
      ),
    )
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .map(({ left, right, top, bottom }) => ({ left, right, top, bottom }));
    return {
      left: rect.left + parseFloat(style.paddingLeft),
      right: rect.right - parseFloat(style.paddingRight),
      top: rect.top,
      bottom: rect.bottom,
      headerRight: rect.right,
      boxes,
    };
  });
  const logoutBox = (await logout.boundingBox())!;
  expect(Math.abs(logoutBox.x + logoutBox.width - bounds.right)).toBeLessThanOrEqual(1);
  expect(bounds.headerRight).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  for (const box of bounds.boxes) {
    expect(box.left).toBeGreaterThanOrEqual(bounds.left - 1);
    expect(box.right).toBeLessThanOrEqual(bounds.right + 1);
    expect(box.top).toBeGreaterThanOrEqual(bounds.top);
    expect(box.bottom).toBeLessThanOrEqual(bounds.bottom);
  }
  for (let i = 0; i < bounds.boxes.length; i++)
    for (const other of bounds.boxes.slice(i + 1)) {
      const box = bounds.boxes[i];
      const overlapX = Math.min(box.right, other.right) - Math.max(box.left, other.left);
      const overlapY = Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top);
      expect(overlapX > 1 && overlapY > 1).toBe(false);
    }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [390, 768, 1024, 1470])
  for (const account of ["nonadmin", "administrator", "citizen"] as const)
    test(`${account} header controls reach the right gutter in both languages at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await header(page, account);
      if (account === "citizen")
        await expect(
          page.getByRole("button", { name: /ขยายขนาดตัวอักษร|ย่อขนาดตัวอักษร|text size/i }),
        ).toHaveCount(0);
      for (const language of ["th", "en"] as const) {
        await page.locator(`.topbar .language-switcher button[lang="${language}"]`).click();
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        if (account === "administrator" && width < 992 && language === "th")
          await page.getByRole("button", { name: "สลับบทบาท", exact: true }).click();
        await fitsHeader(page, language);
        if (account === "administrator")
          for (const control of await page.locator(".admin-role-controls .ant-select").all())
            await expect(control).toBeInViewport();
      }
    });

test("TH/EN language toggle is readable with visible keyboard focus", async ({ page }) => {
  await header(page, "nonadmin");
  const english = page.locator('.topbar .language-switcher button[lang="en"]');
  await english.click();
  await expect(english).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await english.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(english).toBeFocused();
  const paint = await page.locator(".topbar .language-switcher").evaluate((group) => {
    const rgb = (color: string) =>
      color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
    const [thai, active] = [...group.querySelectorAll("button")].map((b) => getComputedStyle(b));
    return {
      group: rgb(getComputedStyle(group).backgroundColor),
      activeBackground: rgb(active.backgroundColor),
      activeText: rgb(active.color),
      idleText: rgb(thai.color),
      outline: rgb(active.outlineColor),
      outlineWidth: parseFloat(active.outlineWidth),
      header: rgb(getComputedStyle(group.closest(".topbar")!).backgroundColor),
      height: group.getBoundingClientRect().height,
    };
  });
  const contrast = (first: number[], second: number[]) => {
    const luminance = (rgb: number[]) =>
      rgb
        .map((value) => value / 255)
        .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  };
  expect(contrast(paint.activeText, paint.activeBackground)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(paint.idleText, paint.group)).toBeGreaterThanOrEqual(4.5);
  expect(paint.height).toBeGreaterThanOrEqual(44);
  expect(paint.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(contrast(paint.outline, paint.header)).toBeGreaterThanOrEqual(3);
});

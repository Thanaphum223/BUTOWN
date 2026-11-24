import { test, expect, type Locator } from "@playwright/test";
import { openReport, confirmLocation } from "./product-flow";

async function readableHover(button: Locator) {
  await button.hover();
  await button.evaluate(async (el) => {
    await Promise.all(
      [...el.getAnimations(), ...(el.parentElement?.getAnimations() ?? [])].map((a) =>
        a.finished.catch(() => {}),
      ),
    );
  });
  const [background, foreground] = await button.evaluate((el) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 1, 1);
    const parents: Element[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) parents.unshift(node);
    for (const node of parents) {
      ctx.fillStyle = getComputedStyle(node).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
    }
    const background = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
    ctx.fillStyle = getComputedStyle(el).color;
    ctx.fillRect(0, 0, 1, 1);
    return [background, Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3)];
  });
  const luminance = (rgb: number[]) =>
    rgb
      .map((c) => c / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const values = [luminance(background), luminance(foreground)].sort((a, b) => b - a);
  expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
}

for (const width of [320, 440, 1280]) {
  test(`citizen identity and main menu remain usable through report steps at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 13.75, longitude: 100.5 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
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
        "/api/nearby": [],
      };
      await route.fulfill({ json: payload[path] ?? {} });
    });
    await page.route("https://tile.openstreetmap.org/**", (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
    await page.goto("/");
    await expect(page.getByText(`สวัสดี, ${name}`, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /ขยายขนาดตัวอักษร|ย่อขนาดตัวอักษร/ }),
    ).toHaveCount(2);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    const menu = page.getByRole("navigation", { name: "เมนูประชาชน", exact: true });
    await expect(menu).toBeVisible();
    await readableHover(
      page
        .getByLabel("พื้นที่ค้นหาปัญหา", { exact: true })
        .getByText("ทั้งเทศบาล", { exact: true }),
    );
    await openReport(page);
    await expect(page.getByRole("button", { name: "กลับหน้าหลัก", exact: true })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: /แจ้งปัญหา/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.getByLabel("ค้นหาชื่อสถานที่ หรือพิกัด", { exact: true }).fill("ถนนทดสอบ");
    await readableHover(page.getByRole("button", { name: "ค้นหา", exact: true }));
    await confirmLocation(page, "สถานที่ทดสอบเมนู");
    await readableHover(
      page
        .getByRole("region", { name: "ประเภทปัญหา", exact: true })
        .getByRole("button", { name: "ค้นหา", exact: true }),
    );
    await expect(menu).toBeVisible();
    await readableHover(page.getByRole("button", { name: "ย้อนกลับ", exact: true }));
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
    expect(pageErrors).toEqual([]);
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({ path: `../work/screenshots/gov-home-${width}.png` });
    expect(
      await page.evaluate(() => document.fonts.check('16px "Noto Sans Thai Variable"', "ทดสอบ")),
    ).toBeTruthy();
  });
}

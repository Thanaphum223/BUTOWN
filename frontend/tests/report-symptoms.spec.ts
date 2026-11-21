import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { confirmLocation, openReport, photo } from "./product-flow";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/complaints" && request.method() === "POST")
      return route.fulfill({ json: { id: "11111111-2222-3333-4444-555555555555" } });
    const data: Record<string, unknown> = {
      "/api/auth/me": { id: "u", display_name: "ผู้ทดสอบ", role: "CITIZEN" },
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/public/map-config": { provider: "leaflet", publicToken: "" },
      "/api/catalog": {
        categories: [{ id: "c1", name: "ถนนและทางเท้า", fields: "[]" }],
        departments: [],
      },
      "/api/auth/gov-profile": { profile: { email: "reporter@example.test" } },
      "/api/municipal-center": { latitude: 13.75, longitude: 100.5 },
      "/api/community/complaints": { items: [], top: [], total: 0, stats: {} },
    };
    return route.fulfill({ json: data[path] ?? [] });
  });
});

for (const width of [390, 1280]) {
  test(`citizens report by tapping symptoms, with title and details optional, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await openReport(page);
    await confirmLocation(page, "หน้าตลาด");
    await page.getByRole("button", { name: /ถนนและทางเท้า/ }).click();
    const symptoms = page.locator(".symptom-picker");
    await expect(symptoms).toBeVisible();
    await symptoms.getByText("ถนนเป็นหลุม", { exact: true }).click();
    await symptoms.getByText("เกิดซ้ำบ่อย", { exact: true }).click();
    await expect(symptoms.locator(".ant-tag-checkable-checked")).toHaveCount(2);
    await expect(page.getByLabel("หัวข้อปัญหา (ไม่บังคับ)", { exact: true })).toBeVisible();
    await expect(page.getByLabel("รายละเอียดอื่น ๆ (ไม่บังคับ)", { exact: true })).toBeEmpty();
    await expect(
      page.getByText("ข้อมูลส่วนตัวของคุณจะไม่ถูกเผยแพร่", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".media-privacy-note")).toBeVisible();
    await expect(page.getByRole("button", { name: /ถ่ายวิดีโอ/ })).toBeVisible();
    await expect(page.getByText(/\/ 300 MB/)).toBeVisible();
    await page.locator('input[type="file"][multiple]').setInputFiles(photo("site.png"));

    const sent = page.waitForRequest(
      (r) => new URL(r.url()).pathname === "/api/complaints" && r.method() === "POST",
    );
    await page.getByRole("button", { name: "ส่งคำร้อง", exact: true }).click();
    const body = (await sent).postDataBuffer()!.toString("utf8");
    const json = JSON.parse(body.slice(body.indexOf("{"), body.indexOf("}\r\n") + 1));
    expect(json.title).toBe("ถนนและทางเท้า");
    expect(json.description).toBe("ถนนเป็นหลุม, เกิดซ้ำบ่อย");
    await expect(
      page.getByRole("heading", { name: "บันทึกคำร้องแล้ว", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test("an oversized file is refused before upload with how far over the limit it is", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await openReport(page);
  await confirmLocation(page, "หน้าตลาด");
  await page.getByRole("button", { name: /ถนนและทางเท้า/ }).click();
  const file = testInfo.outputPath("long.mp4");
  const handle = fs.openSync(file, "w");
  fs.writeSync(handle, Buffer.from("000000186674797069736f6d0000020069736f6d6d703432", "hex"));
  fs.ftruncateSync(handle, 101_000_000);
  fs.closeSync(handle);
  await page.locator('input[type="file"][multiple]').setInputFiles(file);
  await expect(page.getByText(/เกินเพดานไฟล์ละ 100 MB อยู่ 1\.0 MB/)).toBeVisible();
  await expect(page.getByText("long.mp4", { exact: true })).toHaveCount(0);
});

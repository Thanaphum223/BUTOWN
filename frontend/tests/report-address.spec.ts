import { test, expect } from "@playwright/test";
import { signIn, openReport, confirmLocation } from "./product-flow";

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 13.751234, longitude: 100.501234 });
});

test("failed reverse lookup leaves coordinates below and asks for a readable address", async ({
  page,
}) => {
  await page.route("**/api/geocoding/reverse?**", (route) =>
    route.fulfill({ status: 503, json: { message: "Provider unavailable" } }),
  );
  await signIn(page);
  await openReport(page);
  await expect(
    page.getByText("ค้นหาที่อยู่ไม่สำเร็จ กรุณาระบุสถานที่หรือจุดสังเกตเอง", { exact: true }),
  ).toBeVisible();
  const address = page.getByLabel("สถานที่ / จุดสังเกต", { exact: true });
  await expect(address).toBeEmpty();
  await page.getByText("ดูหรือแก้ไขพิกัด GPS", { exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "ละติจูด", exact: true })).toHaveValue(
    "13.751234",
  );
  await expect(page.getByRole("spinbutton", { name: "ลองจิจูด", exact: true })).toHaveValue(
    "100.501234",
  );
  await confirmLocation(page, "หน้าตลาด ถนนทดสอบ");
});

test("empty reverse lookup can be retried to obtain a readable address", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/geocoding/reverse?**", (route) =>
    route.fulfill({
      json: ++attempts === 1 ? {} : { display_name: "ถนนทดสอบ ตำบลทดสอบ จังหวัดนนทบุรี" },
    }),
  );
  await signIn(page);
  await openReport(page);
  await expect(
    page.getByText("ไม่พบชื่อสถานที่ตรงจุดนี้ กรุณากรอกสถานที่หรือจุดสังเกตเอง", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("สถานที่ / จุดสังเกต", { exact: true })).toBeEmpty();
  await page.getByRole("button", { name: "ค้นหาที่อยู่อีกครั้ง", exact: true }).click();
  await expect(page.getByLabel("สถานที่ / จุดสังเกต", { exact: true })).toHaveValue(
    "ถนนทดสอบ ตำบลทดสอบ จังหวัดนนทบุรี",
  );
});

test("late reverse lookup never replaces a manually edited location", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const requested = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route("**/api/geocoding/reverse?**", async (route) => {
    arrived();
    await gate;
    await route.fulfill({ json: { display_name: "ชื่อจากบริการแผนที่ที่มาทีหลัง" } });
  });
  await signIn(page);
  await openReport(page);
  await requested;
  const address = page.getByLabel("สถานที่ / จุดสังเกต", { exact: true });
  await address.fill("หน้าร้านที่ผู้แจ้งระบุเอง");
  const response = page.waitForResponse((r) => r.url().includes("/api/geocoding/reverse?"));
  release();
  await response;
  await expect(address).toHaveValue("หน้าร้านที่ผู้แจ้งระบุเอง");
  await confirmLocation(page);
});

test("changing the point discards an older address response", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const firstRequested = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let settled!: () => void;
  const oldResponseSettled = new Promise<void>((resolve) => {
    settled = resolve;
  });
  await page.route("**/api/geocoding/reverse?**", async (route) => {
    const latitude = new URL(route.request().url()).searchParams.get("latitude");
    if (latitude === "13.751234") {
      arrived();
      await gate;
      try {
        await route.fulfill({ json: { display_name: "ที่อยู่ของจุดเก่า" } });
      } catch {
        // Changing the point cancels the obsolete request.
      } finally {
        settled();
      }
    } else {
      await route.fulfill({ json: { display_name: "ที่อยู่ของจุดใหม่" } });
    }
  });
  await signIn(page);
  await openReport(page);
  await firstRequested;
  await page.getByText("ดูหรือแก้ไขพิกัด GPS", { exact: true }).click();
  await page.getByRole("spinbutton", { name: "ละติจูด", exact: true }).fill("13.76");
  const address = page.getByLabel("สถานที่ / จุดสังเกต", { exact: true });
  await expect(address).toBeEmpty();
  await expect(address).toHaveValue("ที่อยู่ของจุดใหม่");
  release();
  await oldResponseSettled;
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(address).toHaveValue("ที่อยู่ของจุดใหม่");
});

test("refreshing the same GPS point keeps a readable location", async ({ page }) => {
  await page.route("**/api/geocoding/reverse?**", (route) =>
    route.fulfill({ json: { display_name: "ถนนทดสอบจาก GPS" } }),
  );
  await signIn(page);
  await openReport(page);
  const address = page.getByLabel("สถานที่ / จุดสังเกต", { exact: true });
  await expect(address).toHaveValue("ถนนทดสอบจาก GPS");
  const refreshed = page.waitForResponse((r) => r.url().includes("/api/geocoding/reverse?"), {
    timeout: 5000,
  });
  await page.getByRole("button", { name: /ตำแหน่งของฉัน$/ }).click();
  await (await refreshed).finished();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(address).toHaveValue("ถนนทดสอบจาก GPS");
});

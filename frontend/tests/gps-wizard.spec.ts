import { test, expect } from "@playwright/test";
import { signIn, openReport, confirmLocation, fillReport, submitReport } from "./product-flow";
test("first visit asks GPS once and prefills wizard, preserves manual address, shows receipt", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 13.751234, longitude: 100.501234 });
  await page.addInitScript(() => {
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    (window as any).gpsCalls = 0;
    navigator.geolocation.getCurrentPosition = ((...args: any[]) => {
      (window as any).gpsCalls++;
      return (original as any)(...args);
    }) as any;
  });
  // Only external reverse geocoding is fixed; saving uses the real backend.
  await page.route("**/api/geocoding/reverse?**", (route) =>
    route.fulfill({ json: { display_name: "ตำแหน่ง GPS ทดสอบ" } }),
  );
  await signIn(page);
  await expect.poll(() => page.evaluate(() => (window as any).gpsCalls)).toBe(1);
  await openReport(page);
  await expect(page.getByLabel("สถานที่ / จุดสังเกต", { exact: true })).toHaveValue(
    "ตำแหน่ง GPS ทดสอบ",
  );
  await page.getByText("ดูหรือแก้ไขพิกัด GPS", { exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "ละติจูด", exact: true })).toHaveValue(
    "13.751234",
  );
  await expect(page.getByRole("spinbutton", { name: "ลองจิจูด", exact: true })).toHaveValue(
    "100.501234",
  );
  const address = "ที่อยู่ที่ผู้ใช้ตรวจสอบแล้ว";
  await confirmLocation(page, address);
  const title = "ทดสอบ GPS " + Date.now();
  await fillReport(page, title, "รายละเอียดการแจ้งปัญหา");
  await page.getByLabel("ชื่อ–นามสกุล (ไม่บังคับ)", { exact: true }).fill("ผู้แจ้งทดสอบ");
  await page.getByLabel("เบอร์ติดต่อ (ไม่บังคับ)", { exact: true }).fill("0812345678");
  await page.getByRole("button", { name: "ย้อนกลับ", exact: true }).click();
  await expect(page.getByLabel("สถานที่ / จุดสังเกต", { exact: true })).toHaveValue(address);
  await confirmLocation(page, address);
  await expect(page.getByLabel("หัวข้อปัญหา", { exact: true })).toHaveValue(title);
  await expect(page.getByText("initial-evidence.pdf", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).gpsCalls)).toBe(1);
  const id = await submitReport(page);
  await expect(page.locator(".receipt-card")).toContainText(address);
  const saved = await (await page.request.get("/api/complaints/" + id)).json();
  expect(saved.complaint.address).toBe(address);
  expect(Number(saved.complaint.latitude)).toBe(13.751234);
  expect(Number(saved.complaint.longitude)).toBe(100.501234);
});
test("denied GPS allows manual location and preserves wizard form", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(_ok: any, fail: any) {
          setTimeout(() => fail({ code: 1 }), 0);
        },
      },
    });
  });
  await signIn(page);
  await openReport(page);
  await expect(page.getByText(/ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง/)).toBeVisible();
  const address = "กรอกที่อยู่โดยไม่ใช้ GPS";
  await confirmLocation(page, address);
  await fillReport(page, "ไม่ใช้ GPS " + Date.now(), "รายละเอียดแบบกรอกเอง");
  await page.getByRole("button", { name: "ย้อนกลับ", exact: true }).click();
  await expect(page.getByLabel("สถานที่ / จุดสังเกต", { exact: true })).toHaveValue(address);
  await confirmLocation(page, address);
  const id = await submitReport(page);
  const saved = await (await page.request.get("/api/complaints/" + id)).json();
  expect(saved.complaint.address).toBe(address);
  expect(saved.complaint.latitude).toBeNull();
  expect(saved.complaint.longitude).toBeNull();
});

import { waitForLoginSlot } from "./login-rate";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
const credentials = process.env.TT_DEMO_PASSWORD
  ? { DEMO_PASSWORD: process.env.TT_DEMO_PASSWORD }
  : JSON.parse(fs.readFileSync("../work/local-env.json", "utf8"));
async function login(page: any) {
  await waitForLoginSlot();
  await page.goto("/");
  await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("citizen");
  await page
    .getByLabel("รหัสผ่าน", { exact: true })
    .fill(credentials.DEMO_PASSWORD);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ภาพรวมการดำเนินงาน", exact: true }),
  ).toBeVisible();
}
test("first visit asks GPS once and prefills wizard, preserves manual address, shows receipt", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 13.751234, longitude: 100.501234 });
  await page.addInitScript(() => {
    const original = navigator.geolocation.getCurrentPosition.bind(
      navigator.geolocation,
    );
    (window as any).gpsCalls = 0;
    navigator.geolocation.getCurrentPosition = ((...args: any[]) => {
      (window as any).gpsCalls++;
      return (original as any)(...args);
    }) as any;
  });
  await login(page);
  await expect(page.locator(".map-caption")).toContainText("13.75123");
  await page.getByRole("button", { name: /แจ้งปัญหา/ }).click();
  await expect(
    page.getByRole("heading", { name: "พบปัญหาอะไร?", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../work/screenshots/wizard-step1.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /ถนนและทางเท้า/ }).click();
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await expect(
    page.getByLabel("สถานที่ / จุดสังเกต", { exact: true }),
  ).toHaveValue("พิกัด 13.751234, 100.501234");
  await page.getByText("ดูหรือแก้ไขพิกัด GPS", { exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "ละติจูด", exact: true }),
  ).toHaveValue("13.751234");
  expect(await page.evaluate(() => (window as any).gpsCalls)).toBe(1);
  await page.screenshot({
    path: "../work/screenshots/wizard-step2.png",
    fullPage: true,
  });
  await page
    .getByLabel("สถานที่ / จุดสังเกต", { exact: true })
    .fill("ที่อยู่ที่ผู้ใช้ตรวจสอบแล้ว");
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await page
    .getByLabel("ชื่อ–นามสกุล (ไม่บังคับ)", { exact: true })
    .fill("ผู้แจ้งทดสอบ");
  await page
    .getByLabel("เบอร์ติดต่อ (ไม่บังคับ)", { exact: true })
    .fill("0812345678");
  await page
    .getByLabel("หัวข้อปัญหา", { exact: true })
    .fill("ทดสอบ GPS " + Date.now());
  await page
    .getByLabel("รายละเอียด", { exact: true })
    .fill("รายละเอียดการแจ้งปัญหา");
  await page.screenshot({
    path: "../work/screenshots/wizard-step3.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "ย้อนกลับ", exact: true }).click();
  await expect(
    page.getByLabel("สถานที่ / จุดสังเกต", { exact: true }),
  ).toHaveValue("ที่อยู่ที่ผู้ใช้ตรวจสอบแล้ว");
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await page.getByRole("button", { name: "ส่งคำร้อง", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "บันทึกคำร้องแล้ว", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../work/screenshots/wizard-receipt.png",
    fullPage: true,
  });
});
test("denied GPS allows manual location and preserves wizard form", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(_ok: any, fail: any) {
          setTimeout(() => fail({ code: 1 }), 0);
        },
      },
    });
  });
  await login(page);
  await page.getByRole("button", { name: /แจ้งปัญหา/ }).click();
  await page.getByRole("button", { name: /ถนนและทางเท้า/ }).click();
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await expect(page.getByText(/ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง/)).toBeVisible();
  await page
    .getByLabel("สถานที่ / จุดสังเกต", { exact: true })
    .fill("กรอกที่อยู่โดยไม่ใช้ GPS");
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "เล่าให้เราทราบ", exact: true }),
  ).toBeVisible();
});

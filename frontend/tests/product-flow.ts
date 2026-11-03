import { expect, type Page } from "@playwright/test";
import { waitForLoginSlot } from "./login-rate";

export function accountPassword(role: string) {
  const name = role === "admin" ? "TT_BOOTSTRAP_PASSWORD" : "TT_DEMO_PASSWORD";
  const password = process.env[name];
  if (!password) throw new Error(`Set ${name} to the isolated test account password`);
  return password;
}
export async function signIn(page: Page, role = "citizen", password = accountPassword(role)) {
  await waitForLoginSlot();
  await page.goto("/");
  await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill(role);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  if (role === "citizen") {
    const consent = page.getByRole("button", {
      name: "รับทราบประกาศ",
      exact: true,
    });
    const home = page.getByRole("heading", {
      name: "ปัญหาในระยะ 5 กม.",
      exact: true,
    });
    await expect(consent.or(home)).toBeVisible();
    if (await consent.isVisible()) await consent.click();
    await expect(home).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", {
        name: role === "field" ? "งานลงพื้นที่ของฉัน" : "ภาพรวมการดำเนินงาน",
        exact: true,
      }),
    ).toBeVisible();
  }
}
export async function openReport(page: Page) {
  await page.getByRole("link", { name: /แจ้งปัญหา/ }).click();
  await expect(page.getByRole("heading", { name: "เกิดเหตุที่ไหน?", exact: true })).toBeVisible();
}
export async function confirmLocation(page: Page, address?: string) {
  if (address) await page.getByLabel("สถานที่ / จุดสังเกต", { exact: true }).fill(address);
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "ยืนยันตำแหน่งจุดเกิดเหตุ" });
  await expect(dialog).toBeVisible();
  if (address) await expect(dialog).toContainText(address);
  await dialog.getByRole("button", { name: "ยืนยันตำแหน่ง", exact: true }).click();
  await expect(page.getByRole("heading", { name: "รายละเอียดปัญหา", exact: true })).toBeVisible();
}
export const photo = (name: string) => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
});
export const pdfEvidence = (name: string) => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4 test evidence"),
});
export async function fillReport(page: Page, title: string, description: string) {
  await page.getByRole("button", { name: /ถนนและทางเท้า/ }).click();
  await page.getByLabel("หัวข้อปัญหา", { exact: true }).fill(title);
  await page.getByLabel("รายละเอียด", { exact: true }).fill(description);
  await page.locator("input[type=file]").setInputFiles(pdfEvidence("initial-evidence.pdf"));
}
export async function submitReport(page: Page) {
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/complaints") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "ส่งคำร้อง", exact: true }).click();
  const response = await saved;
  expect(response.ok(), await response.text()).toBeTruthy();
  const { id } = await response.json();
  await expect(page.getByRole("heading", { name: "บันทึกคำร้องแล้ว", exact: true })).toBeVisible();
  return id as string;
}
export async function createReport(
  page: Page,
  title: string,
  description: string,
  address: string,
) {
  await openReport(page);
  await confirmLocation(page, address);
  await fillReport(page, title, description);
  const id = await submitReport(page);
  await page.getByRole("button", { name: "ติดตามเรื่องนี้", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  return id;
}

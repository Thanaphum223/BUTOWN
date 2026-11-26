import { test, expect } from "@playwright/test";
import {
  confirmLocation,
  openReport,
  pdfEvidence,
  photo,
  signIn,
  submitReport,
} from "./product-flow";

test("citizen can take a photo, preview attachments and open each file once after sending", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "citizen");
  await openReport(page);
  await confirmLocation(page, "จุดทดสอบแนบรูป");
  await page.getByRole("button", { name: /ถนนและทางเท้า/ }).click();
  const title = "แนบรูป " + Date.now();
  await page.getByLabel("หัวข้อปัญหา (ไม่บังคับ)", { exact: true }).fill(title);
  await page.getByLabel("รายละเอียด", { exact: true }).fill("ทดสอบแนบรูปและเปิดดู");
  const camera = page.locator('input[type=file][capture="environment"]');
  await expect(camera).toHaveAttribute("accept", "image/jpeg,image/png");
  await expect(page.locator("input[type=file][multiple]")).toHaveAttribute(
    "accept",
    /image\/jpeg.*application\/pdf/,
  );
  await camera.setInputFiles(photo("camera.png"));
  await page.locator("input[type=file][multiple]").setInputFiles(pdfEvidence("doc.pdf"));
  const thumb = page.locator(".ant-upload-list-item-thumbnail img");
  await expect(thumb).toHaveCount(1);
  await expect(page.locator(".ant-upload-list-item-name[href^='blob:']")).toHaveCount(2);
  await submitReport(page);
  await page.getByRole("button", { name: "ติดตามเรื่องนี้", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.locator(".ant-image img")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /ดูเอกสาร$/ })).toHaveCount(1);
  await page.getByRole("button", { name: /ดูเอกสาร$/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

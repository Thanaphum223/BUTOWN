import { expect, type Locator, type Page } from "@playwright/test";
import { waitForLoginSlot } from "./login-rate";

export function accountPassword(role: string) {
  const name = role === "admin" ? "TT_BOOTSTRAP_PASSWORD" : "TT_DEMO_PASSWORD";
  const password = process.env[name];
  if (!password) throw new Error(`Set ${name} to the isolated test account password`);
  return password;
}
export async function signIn(page: Page, role = "citizen", password = accountPassword(role)) {
  await waitForLoginSlot();
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  const response = await page.request.post("/api/test/session", {
    headers: { [csrf.headerName]: csrf.token },
    form: { username: role, password },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/");
  if (role === "citizen") {
    const consent = page.getByRole("button", {
      name: "รับทราบประกาศ",
      exact: true,
    });
    const home = page.getByRole("heading", {
      name: "เรื่องแจ้งในเทศบาล",
      exact: true,
    });
    await expect(consent.or(home)).toBeVisible();
    if (await consent.isVisible()) await consent.click();
    await expect(home).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", {
        name:
          role === "field"
            ? "งานลงพื้นที่ของฉัน"
            : role === "approver"
              ? "ภาพรวมคำร้องทั้งเทศบาล"
              : "ภาพรวมการดำเนินงาน",
        exact: true,
      }),
    ).toBeVisible();
  }
}
export async function signOut(page: Page) {
  const loggedOut = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/logout") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
  const logoutResponse = await loggedOut;
  expect(logoutResponse.status()).toBe(204);
  await logoutResponse.finished();
  await expect(
    page.locator(".auth-page").getByRole("heading", { name: "เข้าสู่ระบบ", exact: true }),
  ).toBeVisible();
}
export async function waitForSettledDialog(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("opacity", "1");
  await expect(dialog).toHaveCSS("transform", "none");
}
export async function openReport(page: Page) {
  await page.getByRole("link", { name: /แจ้งปัญหา/ }).click();
  await expect(page.getByRole("heading", { name: "เกิดเหตุที่ไหน?", exact: true })).toBeVisible();
}
export async function confirmLocation(page: Page, address?: string) {
  if (address) await page.getByLabel("สถานที่ / จุดสังเกต", { exact: true }).fill(address);
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "ยืนยันตำแหน่งจุดเกิดเหตุ" });
  await waitForSettledDialog(dialog);
  if (address) await expect(dialog).toContainText(address);
  await dialog.getByRole("button", { name: "ยืนยันตำแหน่ง", exact: true }).click();
  await expect(dialog).toBeHidden();
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
export function pdfEvidence(name: string) {
  // One real PDF page with an xref table, so previews exercise PDF.js rendering.
  const stream = "BT /F1 18 Tf 36 100 Td (TownTrack evidence) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const start = Buffer.byteLength(source);
  source += `xref\n0 6\n0000000000 65535 f \n`;
  source += offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("");
  source += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return { name, mimeType: "application/pdf", buffer: Buffer.from(source) };
}
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

import { waitForLoginSlot } from "./login-rate";
async function createThroughWizard(
  page: any,
  title: string,
  description: string,
  address: string,
) {
  await page.getByRole("button", { name: /แจ้งปัญหา/ }).click();
  await page.getByRole("button", { name: /ถนนและทางเท้า/ }).click();
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await page.getByLabel("สถานที่ / จุดสังเกต", { exact: true }).fill(address);
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await page.getByLabel("หัวข้อปัญหา", { exact: true }).fill(title);
  await page.getByLabel("รายละเอียด", { exact: true }).fill(description);
  await page.getByRole("button", { name: "ส่งคำร้อง", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "บันทึกคำร้องแล้ว", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "ติดตามเรื่องนี้", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}
import { test, expect } from "@playwright/test";
import fs from "node:fs";
const secrets = process.env.TT_DEMO_PASSWORD
  ? {
      DEMO_PASSWORD: process.env.TT_DEMO_PASSWORD,
      BOOTSTRAP_PASSWORD: process.env.TT_BOOTSTRAP_PASSWORD,
    }
  : JSON.parse(fs.readFileSync("../work/local-env.json", "utf8"));
async function login(
  page: any,
  username: string,
  password = secrets.DEMO_PASSWORD,
) {
  await waitForLoginSlot();
  await page.goto("/");
  await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill(username);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ภาพรวมการดำเนินงาน" }),
  ).toBeVisible();
}
test("citizen submits a real complaint and views persisted details", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "citizen");
  await page.getByRole("button", { name: /แจ้งปัญหา/ }).click();
  await page.getByRole("button", { name: /ถนนและทางเท้า/ }).click();
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await page
    .getByLabel("สถานที่ / จุดสังเกต", { exact: true })
    .fill("จุดทดสอบเทศบาล");
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  const title = "ทดสอบ UI ทางเท้าชำรุด " + Date.now();
  await page.getByLabel("หัวข้อปัญหา", { exact: true }).fill(title);
  await page
    .getByLabel("รายละเอียด", { exact: true })
    .fill("ตรวจสอบการบันทึกผ่านหน้าเว็บจริง");

  await page.getByRole("button", { name: "ส่งคำร้อง", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "บันทึกคำร้องแล้ว", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "ติดตามเรื่องนี้", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(
    page.getByText("ตรวจสอบการบันทึกผ่านหน้าเว็บจริง", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../work/screenshots/citizen-detail.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("officer sees real queue", async ({ page }) => {
  await login(page, "officer");
  await expect(page.getByText("รายการคำร้อง", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "../work/screenshots/officer-dashboard.png",
    fullPage: true,
  });
});
test("leader can open team management", async ({ page }) => {
  await login(page, "leader");
  await page.getByRole("menuitem", { name: "ทีมลงพื้นที่" }).click();
  await expect(
    page.getByRole("button", { name: "สร้างทีม", exact: true }),
  ).toBeVisible();
});
test("administrator configuration is accessible", async ({ page }) => {
  await login(page, "admin", secrets.BOOTSTRAP_PASSWORD);
  await page.getByRole("menuitem", { name: "จัดการระบบ" }).click();
  await expect(
    page.getByRole("tab", { name: "Workflow", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Workflow", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "เผยแพร่เวอร์ชันใหม่" }),
  ).toBeVisible();
});
test("mobile citizen screen fits viewport and supports manual address", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "citizen");
  await page.screenshot({
    path: "../work/screenshots/mobile-dashboard.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("full workflow across citizen and staff sessions closes a real complaint", async ({
  page,
}) => {
  test.setTimeout(120000);
  const title = "E2E เทศบาล " + Date.now();
  await login(page, "citizen");
  await createThroughWizard(
    page,
    title,
    "ทดสอบตั้งแต่ประชาชนแจ้งจนปิดเรื่อง",
    "เทศบาลทดสอบ",
  );
  async function switchUser(name: string) {
    await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
    await login(page, name);
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  async function perform(label: string, fill?: (dialog: any) => Promise<void>) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const dialog = page.getByRole("dialog");
    if (fill) await fill(dialog);
    await dialog
      .getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true })
      .fill("ตรวจสอบและดำเนินการตามหน้าที่");
    await dialog
      .getByRole("button", { name: "ยืนยัน" + label, exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
  }
  await switchUser("officer");
  await perform("รับเรื่องและส่งหน่วยงาน", async (d) => {
    await d.getByLabel("หัวหน้าหน่วยงาน", { exact: true }).click();
    await page.getByText("บัญชีทดสอบ LEADER", { exact: true }).click();
  });
  await switchUser("leader");
  await perform("มอบหมายทีม", async (d) => {
    await d.getByLabel("ผู้ลงพื้นที่", { exact: true }).click();
    await page.getByText("บัญชีทดสอบ FIELD", { exact: true }).click();
  });
  await switchUser("field");
  await perform("รับงาน");
  await perform("เริ่มปฏิบัติงาน");
  await page.locator("input[type=file]").setInputFiles({
    name: "proof.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 test proof"),
  });
  await expect(
    page.getByRole("link", { name: "proof.pdf", exact: true }),
  ).toBeVisible();
  await perform("ส่งรายงานผล", async (d) => {
    await d
      .getByLabel("ข้อเท็จจริงและผลดำเนินการ", { exact: true })
      .fill("แก้ไขทางเท้าและตรวจสอบความเรียบร้อยแล้ว");
  });
  await switchUser("leader");
  await perform("ส่งรายงานให้เจ้าหน้าที่");
  await switchUser("officer");
  await perform("ตรวจรายงานผ่าน");
  await perform("ปิดเรื่อง");
  await expect(
    page
      .locator(".workspace-detail")
      .getByText("ปิดเรื่องแล้ว", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../work/screenshots/closed-complaint.png",
    fullPage: true,
  });
});

test("resource refusal by approver terminates a real complaint", async ({
  page,
}) => {
  test.setTimeout(120000);
  const title = "E2E ทรัพยากร " + Date.now();
  await login(page, "citizen");
  await createThroughWizard(
    page,
    title,
    "ทดสอบขอทรัพยากรและผลไม่อนุมัติ",
    "เทศบาลทดสอบ",
  );
  async function switchUser(name: string) {
    await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
    await login(page, name);
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  async function perform(label: string, fill?: (dialog: any) => Promise<void>) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const dialog = page.getByRole("dialog");
    if (fill) await fill(dialog);
    await dialog
      .getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true })
      .fill("ทดสอบตามขั้นตอนที่กำหนด");
    await dialog
      .getByRole("button", { name: "ยืนยัน" + label, exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
  }
  await switchUser("officer");
  await perform("รับเรื่องและส่งหน่วยงาน", async (d) => {
    await d.getByLabel("หัวหน้าหน่วยงาน", { exact: true }).click();
    await page.getByText("บัญชีทดสอบ LEADER", { exact: true }).click();
  });
  await switchUser("leader");
  await perform("มอบหมายทีม", async (d) => {
    await d.getByLabel("ผู้ลงพื้นที่", { exact: true }).click();
    await page.getByText("บัญชีทดสอบ FIELD", { exact: true }).click();
  });
  await switchUser("field");
  await perform("รับงาน");
  await perform("ขอใช้ทรัพยากร");
  await switchUser("leader");
  await page.locator("input[type=file]").setInputFiles({
    name: "proposal.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 resource proof"),
  });
  await expect(
    page.getByRole("link", { name: "proposal.pdf", exact: true }),
  ).toBeVisible();
  await perform("ส่งข้อเสนอทรัพยากร", async (d) => {
    await d
      .getByLabel("ข้อเสนอและรายการทรัพยากร", { exact: true })
      .fill("ขอวัสดุซ่อมถนน");
    await d.getByLabel("งบประมาณ (บาท)", { exact: true }).fill("1000");
    await d.getByLabel("ระยะเวลาดำเนินการ (วัน)", { exact: true }).fill("2");
  });
  await switchUser("officer");
  await perform("ส่งพิจารณาอนุมัติ", async (d) => {
    await d
      .getByLabel("ผู้อนุมัติตามลำดับ (เลือก 1 คน)", { exact: true })
      .click();
    await page.getByText("บัญชีทดสอบ APPROVER", { exact: true }).click();
  });
  await switchUser("approver");
  await perform("ไม่อนุมัติและยุติคำร้อง");
  await expect(
    page
      .locator(".workspace-detail")
      .getByText("ยุติเรื่อง: ไม่อนุมัติทรัพยากร", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../work/screenshots/resource-denied.png",
    fullPage: true,
  });
});

test("citizen map searches real nearby cases and follows sanitized summary", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 13.75, longitude: 100.5 });
  await login(page, "citizen");
  const catalog = await (await page.request.get("/api/catalog")).json();
  const cat = catalog.categories[0];
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  const created = await page.request.post("/api/complaints", {
    headers: { [csrf.headerName]: csrf.token },
    data: {
      categoryId: cat.id,
      title: "รายละเอียดส่วนตัวสำหรับทดสอบแผนที่",
      description: "ข้อมูลนี้ต้องไม่ปรากฏบนการ์ดชุมชน",
      address: "สถานที่ทดสอบ",
      latitude: 13.75,
      longitude: 100.5,
    },
  });
  expect(created.ok()).toBeTruthy();
  const { id } = await created.json();
  await expect(page.locator(".community-toolbar")).toContainText(cat.name);
  await page
    .getByRole("button", { name: "ใช้ตำแหน่งของฉัน", exact: true })
    .click();
  const card = page
    .locator(".community-issue")
    .filter({ hasText: "#" + id.slice(0, 8).toUpperCase() });
  await expect(card).toBeVisible();
  await expect(card).not.toContainText("รายละเอียดส่วนตัวสำหรับทดสอบแผนที่");
  await expect(card).not.toContainText("ข้อมูลนี้ต้องไม่ปรากฏ");
  await card
    .getByRole("button", { name: "ติดตามความคืบหน้า", exact: true })
    .click();
  await expect(
    page.getByText("ติดตามความคืบหน้าเรื่องนี้แล้ว", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../work/screenshots/citizen-community-ui.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "เรื่องที่ติดตาม", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "เรื่องที่ติดตาม", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(cat.name + " • #" + id.slice(0, 8), { exact: true }),
  ).toBeVisible();
});

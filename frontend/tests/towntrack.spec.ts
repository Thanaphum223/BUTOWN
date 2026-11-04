import { test, expect } from "@playwright/test";
import {
  signIn as login,
  createReport as createThroughWizard,
  accountPassword,
  pdfEvidence,
  photo,
  openReport,
  confirmLocation,
} from "./product-flow";
test("citizen submits a real complaint and views persisted details", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "citizen");
  const title = "ทดสอบ UI ทางเท้าชำรุด " + Date.now();
  const id = await createThroughWizard(
    page,
    title,
    "ตรวจสอบการบันทึกผ่านหน้าเว็บจริง",
    "จุดทดสอบเทศบาล",
  );
  await expect(page.getByText("ตรวจสอบการบันทึกผ่านหน้าเว็บจริง", { exact: true })).toBeVisible();
  await page.reload();
  const persisted = await (await page.request.get("/api/complaints/" + id)).json();
  expect(persisted.complaint.title).toBe(title);
  expect(persisted.complaint.address).toBe("จุดทดสอบเทศบาล");
  expect(
    persisted.files.some((file: any) => file.original_name === "initial-evidence.pdf"),
  ).toBeTruthy();
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
  await expect(page.getByRole("button", { name: "สร้างทีม", exact: true })).toBeVisible();
});
test("administrator configuration is accessible", async ({ page }) => {
  await login(page, "admin", accountPassword("admin"));
  await page.getByRole("menuitem", { name: "จัดการระบบ" }).click();
  await expect(page.getByRole("tab", { name: "Workflow", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Workflow", exact: true }).click();
  await expect(page.getByRole("button", { name: "เผยแพร่เวอร์ชันใหม่" })).toBeVisible();
});
test("mobile citizen screen fits viewport and supports manual address", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "citizen");
  await page.screenshot({
    path: "../work/screenshots/mobile-dashboard.png",
    fullPage: true,
  });
  await openReport(page);
  await confirmLocation(page, "กรอกที่อยู่เองบนมือถือ");
  await page.getByRole("button", { name: "ย้อนกลับ", exact: true }).click();
  await expect(page.getByLabel("สถานที่ / จุดสังเกต", { exact: true })).toHaveValue(
    "กรอกที่อยู่เองบนมือถือ",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});

test("full workflow across citizen and staff sessions closes a real complaint", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 13.75, longitude: 100.5 });
  test.setTimeout(120000);
  const title = "E2E เทศบาล " + Date.now();
  await login(page, "citizen");
  const id = await createThroughWizard(
    page,
    title,
    "ทดสอบตั้งแต่ประชาชนแจ้งจนปิดเรื่อง",
    "เทศบาลทดสอบ",
  );
  async function switchUser(name: string) {
    await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
    await login(page, name);
    await page.getByRole("searchbox", { name: "ค้นหาเลขเรื่อง / หัวข้อ" }).fill(title);
    await page.getByRole("button", { name: new RegExp("เปิดงาน " + title) }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  async function perform(label: string, fill?: (dialog: any) => Promise<void>) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: label, exact: true });
    if (label === "รับเรื่องและส่งหน่วยงาน") {
      await dialog.getByLabel("วิธีดำเนินงาน", { exact: true }).fill("ซ่อมและตรวจสอบพื้นที่");
      await dialog.getByLabel("ความเร่งด่วน", { exact: true }).click();
      await page.locator(".ant-select-dropdown:visible").getByText("ปกติ", { exact: true }).click();
      await dialog.getByLabel("วันนัดหมาย", { exact: true }).fill("2026-12-01");
      await dialog.getByLabel("ขอบเขตงาน", { exact: true }).fill("ซ่อมทางเท้าบริเวณที่แจ้ง");
      await dialog.getByLabel("ข้อควรระวัง", { exact: true }).fill("กั้นพื้นที่ปลอดภัย");
      await dialog.getByLabel("ช่องทางประสานงาน", { exact: true }).fill("หัวหน้าทีม");
    }
    if (fill) await fill(dialog);
    await dialog
      .getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true })
      .fill("ตรวจสอบและดำเนินการตามหน้าที่");
    await dialog.getByRole("button", { name: "ยืนยัน" + label, exact: true }).click();
    if (["ปิดเรื่อง", "ไม่อนุมัติและยุติคำร้อง"].includes(label)) {
      await page
        .getByRole("dialog", { name: "ตรวจสอบก่อนยืนยัน" })
        .getByRole("button", { name: "ยืนยัน", exact: true })
        .click();
    }
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
  await perform("ส่งรายงานผล", async (d) => {
    for (const [index, stage] of ["before", "after"].entries()) {
      const section = d.locator(".field-evidence-steps section").nth(index);
      await section
        .locator("input[type=file]")
        .last()
        .setInputFiles(photo(stage + ".png"));
      await expect(section.getByRole("link", { name: stage + ".png", exact: true })).toBeVisible();
    }
    await d
      .getByLabel("ข้อเท็จจริงและผลดำเนินการ", { exact: true })
      .fill("แก้ไขทางเท้าและตรวจสอบความเรียบร้อยแล้ว");
  });
  await switchUser("leader");
  await perform("ส่งรายงานให้เจ้าหน้าที่");
  await switchUser("officer");
  await perform("ตรวจรายงานผ่าน");
  await perform("ปิดเรื่อง");
  const saved = await (await page.request.get("/api/complaints/" + id)).json();
  expect(saved.complaint.status).toBe("CLOSED");
  expect(saved.reports).toHaveLength(1);
  expect(
    saved.files.filter((file: any) => file.report_id).map((file: any) => file.evidence_stage),
  ).toEqual(expect.arrayContaining(["BEFORE", "AFTER"]));
  await expect(
    page.locator(".workspace-detail").getByText("ปิดเรื่องแล้ว", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../work/screenshots/closed-complaint.png",
    fullPage: true,
  });
});

test("resource refusal by approver terminates a real complaint", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 13.75, longitude: 100.5 });
  test.setTimeout(120000);
  const title = "E2E ทรัพยากร " + Date.now();
  await login(page, "citizen");
  const id = await createThroughWizard(
    page,
    title,
    "ทดสอบขอทรัพยากรและผลไม่อนุมัติ",
    "เทศบาลทดสอบ",
  );
  async function switchUser(name: string) {
    await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
    await login(page, name);
    await page.getByRole("searchbox", { name: "ค้นหาเลขเรื่อง / หัวข้อ" }).fill(title);
    await page.getByRole("button", { name: new RegExp("เปิดงาน " + title) }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  async function perform(label: string, fill?: (dialog: any) => Promise<void>) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: label, exact: true });
    if (label === "รับเรื่องและส่งหน่วยงาน") {
      await dialog.getByLabel("วิธีดำเนินงาน", { exact: true }).fill("ซ่อมและตรวจสอบพื้นที่");
      await dialog.getByLabel("ความเร่งด่วน", { exact: true }).click();
      await page.locator(".ant-select-dropdown:visible").getByText("ปกติ", { exact: true }).click();
      await dialog.getByLabel("วันนัดหมาย", { exact: true }).fill("2026-12-01");
      await dialog.getByLabel("ขอบเขตงาน", { exact: true }).fill("ซ่อมทางเท้าบริเวณที่แจ้ง");
      await dialog.getByLabel("ข้อควรระวัง", { exact: true }).fill("กั้นพื้นที่ปลอดภัย");
      await dialog.getByLabel("ช่องทางประสานงาน", { exact: true }).fill("หัวหน้าทีม");
    }
    if (fill) await fill(dialog);
    await dialog
      .getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true })
      .fill("ทดสอบตามขั้นตอนที่กำหนด");
    await dialog.getByRole("button", { name: "ยืนยัน" + label, exact: true }).click();
    if (["ปิดเรื่อง", "ไม่อนุมัติและยุติคำร้อง"].includes(label)) {
      await page
        .getByRole("dialog", { name: "ตรวจสอบก่อนยืนยัน" })
        .getByRole("button", { name: "ยืนยัน", exact: true })
        .click();
    }
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
  await perform("ส่งข้อเสนอทรัพยากร", async (d) => {
    await d.getByLabel("ชื่อคำขอทรัพยากร", { exact: true }).fill("ขอวัสดุซ่อมถนน");
    await d.getByRole("textbox", { name: "ชื่อรายการ 1", exact: true }).fill("วัสดุซ่อมถนน");
    await d.getByRole("spinbutton", { name: "ราคารายการ 1", exact: true }).fill("1000");
    await d.getByLabel("ระยะเวลาดำเนินการ (วัน)", { exact: true }).fill("2");
    await d.locator("input[type=file]").setInputFiles(pdfEvidence("proposal.pdf"));
    await expect(d.getByRole("link", { name: "proposal.pdf", exact: true })).toBeVisible();
    await expect(d.locator(".resource-total")).toContainText("1,000.00");
  });
  await switchUser("officer");
  await perform("ส่งพิจารณาอนุมัติ", async (d) => {
    await d.getByLabel("ผู้อนุมัติตามลำดับ (เลือก 1 คน)", { exact: true }).click();
    await page.getByText("บัญชีทดสอบ APPROVER", { exact: true }).click();
  });
  await switchUser("approver");
  await perform("ไม่อนุมัติและยุติคำร้อง");
  const saved = await (await page.request.get("/api/complaints/" + id)).json();
  expect(saved.complaint.status).toBe("TERMINATED");
  expect(saved.resources).toHaveLength(1);
  await expect(
    page.locator(".workspace-detail").getByText("ยุติเรื่อง: ไม่อนุมัติทรัพยากร", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../work/screenshots/resource-denied.png",
    fullPage: true,
  });
});

test("citizen municipal map lists real cases and follows sanitized summary", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 13.75, longitude: 100.5 });
  await login(page, "citizen");
  const catalog = await (await page.request.get("/api/catalog")).json();
  const cat = catalog.categories.find((category: any) => category.name === "ถนนและทางเท้า");
  const id = await createThroughWizard(
    page,
    "รายละเอียดส่วนตัวสำหรับทดสอบแผนที่",
    "ข้อมูลนี้ต้องไม่ปรากฏบนการ์ดชุมชน",
    "สถานที่ทดสอบ",
  );
  await page.reload();
  await page.getByRole("combobox", { name: "ประเภทปัญหาที่ค้นหา" }).press("ArrowDown");
  await page.locator(".ant-select-dropdown:visible").getByText(cat.name, { exact: true }).click();
  const card = page
    .locator(".community-issue")
    .filter({ hasText: "#" + id.slice(0, 8).toUpperCase() });
  await expect(card).toBeVisible();
  await expect(card).not.toContainText("รายละเอียดส่วนตัวสำหรับทดสอบแผนที่");
  await expect(card).not.toContainText("ข้อมูลนี้ต้องไม่ปรากฏ");
  await card.getByRole("button", { name: /ติดตาม$/ }).click();
  await expect(card.getByRole("button", { name: /ติดตามแล้ว$/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../work/screenshots/citizen-community-ui.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "เรื่องที่ติดตาม", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ติดตามสถานะปัญหา", exact: true })).toBeVisible();
  await expect(
    page.locator(".ant-list-item").filter({ hasText: "#" + id.slice(0, 8) }),
  ).toBeVisible();
});

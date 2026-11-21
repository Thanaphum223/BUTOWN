import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  signIn as login,
  signOut as logout,
  waitForSettledDialog,
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
  await page.getByRole("button", { name: "เปิดคิวงาน", exact: true }).click();
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

test("full approved resource workflow across all municipal and field roles closes a real complaint", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 13.75, longitude: 100.5 });
  test.setTimeout(240000);
  page.setDefaultTimeout(15000);
  const title = "E2E เทศบาล " + Date.now();
  await login(page, "citizen");
  const id = await createThroughWizard(
    page,
    title,
    "ทดสอบตั้งแต่ประชาชนแจ้งจนปิดเรื่อง",
    "เทศบาลทดสอบ",
  );
  async function switchUser(name: string) {
    await logout(page);
    await login(page, name);
    if (name === "approver")
      await page.getByRole("button", { name: "เปิดคิวงานอนุมัติ", exact: true }).click();
    else await page.getByRole("button", { name: "เปิดคิวงาน", exact: true }).click();
    await page.getByRole("searchbox", { name: "ค้นหาเลขเรื่อง / หัวข้อ" }).fill(title);
    await page.getByRole("button", { name: new RegExp("เปิดงาน " + title) }).click();
    await expect(
      page.locator(".workspace-detail").getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  async function perform(label: string, fill?: (dialog: any) => Promise<void>) {
    const buttonLabel = label.startsWith("ไม่อนุมัติงบประมาณเฉพาะกิจ") ? "ไม่อนุมัติ" : label;
    await page.getByRole("button", { name: buttonLabel, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: label, exact: true });
    await waitForSettledDialog(dialog);
    if (label === "รับเรื่องและส่งหน่วยงาน") {
      await dialog.getByLabel("วิธีดำเนินงาน", { exact: true }).fill("ซ่อมและตรวจสอบพื้นที่");
      await dialog.getByLabel("ความเร่งด่วน", { exact: true }).click();
      await page.locator(".ant-select-dropdown:visible").getByText("ปกติ", { exact: true }).click();
      await dialog.getByLabel("ขอบเขตงาน", { exact: true }).fill("ซ่อมทางเท้าบริเวณที่แจ้ง");
      await dialog.getByLabel("ข้อควรระวัง", { exact: true }).fill("กั้นพื้นที่ปลอดภัย");
      await dialog.getByLabel("ช่องทางประสานงาน", { exact: true }).fill("หัวหน้าทีม");
    }
    if (label.startsWith("เริ่มปฏิบัติงานซ่อมแซม")) {
      await dialog.locator("input[type=file][capture]").setInputFiles(photo("start.png"));
      await expect(dialog.getByRole("link", { name: "start.png", exact: true })).toBeVisible();
    }
    if (label === "ส่งเอกสารประเมินทรัพยากร/ของบจากหน้างาน") {
      await dialog.getByLabel("ชื่อรายการที่ขอ 1", { exact: true }).fill("ปูนซ่อมทางเท้า");
      await dialog.getByLabel("จำนวนรายการ 1", { exact: true }).fill("3");
      await dialog.getByLabel("หน่วยรายการ 1", { exact: true }).fill("ถุง");
    }
    if (fill) await fill(dialog);
    const reason = dialog.getByLabel(
      label === "อนุมัติ" ? "เหตุผลอื่น ๆ (กรอกเพิ่มเองได้)" : "เหตุผล / บันทึกการดำเนินการ",
      { exact: true },
    );
    if (label === "อนุมัติ")
      await dialog.getByText("เอกสารและหลักฐานประกอบครบถ้วน", { exact: true }).click();
    if (
      ![
        "กดรับงานและลงพื้นที่สำรวจ",
        "เริ่มปฏิบัติงานซ่อมแซม (ใช้วัสดุ/อุปกรณ์ปกติ)",
        "เริ่มปฏิบัติงานซ่อมแซม (ใช้ทรัพยากรที่ได้รับอนุมัติ)",
        "ส่งข้อเสนอทรัพยากร",
        "ส่งรายงานผล",
      ].includes(label)
    )
      await reason.fill("ตรวจสอบและดำเนินการตามหน้าที่");
    const completed = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/complaints/${id}/actions`) &&
        response.request().method() === "POST",
      { timeout: 30000 },
    );
    await dialog.getByRole("button", { name: "ยืนยัน" + label, exact: true }).click();
    if (
      [
        "ปิดเรื่อง",
        "อนุมัติ",
        "ไม่อนุมัติงบประมาณเฉพาะกิจ (ยุติใบงานซ่อมด่วนเพื่อนำเข้าแผนฯ / ประสานหน่วยงานภายนอก)",
      ].includes(label)
    ) {
      const confirmation = page.getByRole("dialog", {
        name: "ตรวจสอบก่อนยืนยัน",
        exact: true,
      });
      await waitForSettledDialog(confirmation);
      await confirmation.getByRole("button", { name: "ยืนยัน", exact: true }).click();
    }
    const response = await completed;
    expect(response.ok(), await response.text()).toBeTruthy();
    await expect(dialog).not.toBeVisible({ timeout: 15000 });
  }
  await switchUser("officer");
  await perform("รับเรื่องและส่งหน่วยงาน", async (d) => {
    await d.getByLabel("หัวหน้าหน่วยงาน", { exact: true }).fill("บัญชีทดสอบ LEADER");
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("บัญชีทดสอบ LEADER", { exact: true })
      .click();
  });
  await switchUser("leader");
  await perform("มอบหมายทีม", async (d) => {
    await d.getByLabel("ค้นหาทีมหรือผู้ลงพื้นที่", { exact: true }).fill("FIELD");
    await d.getByRole("checkbox", { name: "บัญชีทดสอบ FIELD", exact: true }).check();
  });
  await switchUser("field");
  await perform("กดรับงานและลงพื้นที่สำรวจ");
  await perform("ส่งเอกสารประเมินทรัพยากร/ของบจากหน้างาน");
  await switchUser("leader");
  await perform("ส่งข้อเสนอทรัพยากร", async (d) => {
    await d.getByLabel("ชื่อคำขอทรัพยากร", { exact: true }).fill("ขอวัสดุซ่อมทางเท้า");
    await expect(d.getByRole("textbox", { name: "ชื่อรายการ 1", exact: true })).toHaveValue(
      "ปูนซ่อมทางเท้า",
    );
    await d.getByRole("spinbutton", { name: "จำนวนรายการ 1", exact: true }).fill("4");
    await d.getByRole("spinbutton", { name: "ราคารายการ 1", exact: true }).fill("2500");
    await d.getByLabel("ระยะเวลาดำเนินการ (วัน)", { exact: true }).fill("2");
    await d
      .locator("input[type=file]:not([capture])")
      .setInputFiles(pdfEvidence("approved-proposal.pdf"));
    await expect(d.getByRole("link", { name: "approved-proposal.pdf", exact: true })).toBeVisible();
  });
  await switchUser("officer");
  expect((await (await page.request.get("/api/auth/me")).json()).department_id).toBeNull();
  await perform("เอกสารครบถ้วนตามระเบียบสารบรรณ - ส่งต่อผู้มีอำนาจ", async (d) => {
    await chooseApprover(page, d);
  });
  await expect(page.getByRole("alert").filter({ hasText: "บัญชีทดสอบ APPROVER" })).toContainText(
    "รออนุมัติโดย",
  );
  await switchUser("admin");
  await page
    .getByRole("combobox", { name: "สลับบทบาทผู้ดูแลระบบ", exact: true })
    .press("ArrowDown");
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("ผู้อนุมัติ", { exact: true })
    .click();
  await page.getByRole("button", { name: "เปิดคิวงานอนุมัติ", exact: true }).click();
  await expect(page.getByText("งานอนุมัติทั้งหมดในเทศบาล", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "รอพิจารณาทรัพยากร", exact: true }).click();
  await page.getByRole("searchbox", { name: "ค้นหาเลขเรื่อง / หัวข้อ" }).fill(title);
  await page.getByRole("button", { name: new RegExp("เปิดงาน " + title) }).click();
  await expect(page.getByRole("alert").filter({ hasText: "บัญชีทดสอบ APPROVER" })).toBeVisible();
  await expect(page.getByRole("button", { name: "อนุมัติ", exact: true })).toHaveCount(0);
  await switchUser("approver");
  await expect(page.getByText(/งานที่ส่งถึงบัญชี.*บัญชีทดสอบ APPROVER/)).toHaveCount(0);
  expect((await (await page.request.get("/api/auth/me")).json()).department_id).toBeNull();
  await page.getByRole("button", { name: /ดูเอกสาร/ }).click();
  const proposalPdf = page.getByRole("dialog", { name: "approved-proposal.pdf", exact: true });
  await expect(proposalPdf.locator("canvas")).toBeVisible();
  await expect
    .poll(() =>
      proposalPdf.locator("canvas").evaluate((canvas) => (canvas as HTMLCanvasElement).width),
    )
    .toBeGreaterThan(0);
  await page.screenshot({ path: "../work/screenshots/journey-proposal-pdf.png", fullPage: true });
  await proposalPdf.getByRole("button", { name: "Close", exact: true }).click();
  await page.screenshot({ path: "../work/screenshots/journey-approval.png", fullPage: true });
  await perform("อนุมัติ");
  await switchUser("field");
  await perform("เริ่มปฏิบัติงานซ่อมแซม (ใช้ทรัพยากรที่ได้รับอนุมัติ)");
  await perform("ส่งรายงานผล", async (d) => {
    const steps = d.locator(".field-evidence-steps section");
    await expect(steps.nth(0)).toContainText("ถ่ายไว้ตอนเริ่มปฏิบัติงานแล้ว 1 รูป");
    await steps.nth(1).locator("input[type=file]").last().setInputFiles(photo("after.png"));
    await expect(steps.nth(1).getByRole("link", { name: "after.png", exact: true })).toBeVisible();
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
  expect(saved.resources).toHaveLength(1);
  expect(saved.resources[0].status).toBe("APPROVED");
  expect(saved.history.map((event: any) => event.action)).toEqual(
    expect.arrayContaining([
      "CREATE",
      "TRIAGE",
      "ASSIGN",
      "ACCEPT",
      "REQUEST_RESOURCE",
      "PROPOSE",
      "SEND_APPROVAL",
      "APPROVE",
      "START",
      "REPORT",
      "FORWARD_REPORT",
      "VERIFY",
      "CLOSE",
    ]),
  );
  await test.info().attach("persisted-journey", {
    body: JSON.stringify(
      {
        complaintId: id,
        status: saved.complaint.status,
        history: saved.history.map((event: any) => ({
          action: event.action,
          to_status: event.to_status,
        })),
        resourceStatus: saved.resources[0].status,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(
    saved.files.filter((file: any) => file.report_id).map((file: any) => file.evidence_stage),
  ).toEqual(["AFTER"]);
  expect(
    saved.files
      .filter((file: any) => file.work_order_id === saved.reports[0].work_order_id)
      .map((file: any) => file.evidence_stage),
  ).toEqual(["BEFORE"]);
  await expect(
    page.locator(".workspace-detail").getByText("ปิดเรื่องแล้ว", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../work/screenshots/closed-complaint.png",
    fullPage: true,
  });
  await logout(page);
  await login(page, "citizen");
  await page.getByRole("link", { name: /ติดตามสถานะ/ }).click();
  const tracked = page
    .locator(".ant-list-item")
    .filter({ hasText: "#" + id.slice(0, 8).toUpperCase() });
  await expect(tracked).toContainText("ปิดเรื่องแล้ว");
  await tracked.getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(
    page.locator(".page-heading").getByText("ปิดเรื่องแล้ว", { exact: true }),
  ).toBeVisible();
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
    await logout(page);
    await login(page, name);
    if (name === "approver")
      await page.getByRole("button", { name: "เปิดคิวงานอนุมัติ", exact: true }).click();
    else await page.getByRole("button", { name: "เปิดคิวงาน", exact: true }).click();
    await page.getByRole("searchbox", { name: "ค้นหาเลขเรื่อง / หัวข้อ" }).fill(title);
    await page.getByRole("button", { name: new RegExp("เปิดงาน " + title) }).click();
    await expect(
      page.locator(".workspace-detail").getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  async function perform(label: string, fill?: (dialog: any) => Promise<void>) {
    const buttonLabel = label.startsWith("ไม่อนุมัติงบประมาณเฉพาะกิจ") ? "ไม่อนุมัติ" : label;
    await page.getByRole("button", { name: buttonLabel, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: label, exact: true });
    await waitForSettledDialog(dialog);
    if (label === "รับเรื่องและส่งหน่วยงาน") {
      await dialog.getByLabel("วิธีดำเนินงาน", { exact: true }).fill("ซ่อมและตรวจสอบพื้นที่");
      await dialog.getByLabel("ความเร่งด่วน", { exact: true }).click();
      await page.locator(".ant-select-dropdown:visible").getByText("ปกติ", { exact: true }).click();
      await dialog.getByLabel("ขอบเขตงาน", { exact: true }).fill("ซ่อมทางเท้าบริเวณที่แจ้ง");
      await dialog.getByLabel("ข้อควรระวัง", { exact: true }).fill("กั้นพื้นที่ปลอดภัย");
      await dialog.getByLabel("ช่องทางประสานงาน", { exact: true }).fill("หัวหน้าทีม");
    }
    if (label.startsWith("เริ่มปฏิบัติงานซ่อมแซม")) {
      await dialog.locator("input[type=file][capture]").setInputFiles(photo("start.png"));
      await expect(dialog.getByRole("link", { name: "start.png", exact: true })).toBeVisible();
    }
    if (label === "ส่งเอกสารประเมินทรัพยากร/ของบจากหน้างาน") {
      await dialog.getByLabel("ชื่อรายการที่ขอ 1", { exact: true }).fill("ปูนซ่อมทางเท้า");
      await dialog.getByLabel("จำนวนรายการ 1", { exact: true }).fill("3");
      await dialog.getByLabel("หน่วยรายการ 1", { exact: true }).fill("ถุง");
    }
    if (fill) await fill(dialog);
    const reason = dialog.getByLabel(
      label === "อนุมัติ" ? "เหตุผลอื่น ๆ (กรอกเพิ่มเองได้)" : "เหตุผล / บันทึกการดำเนินการ",
      { exact: true },
    );
    if (label === "อนุมัติ")
      await dialog.getByText("เอกสารและหลักฐานประกอบครบถ้วน", { exact: true }).click();
    if (
      ![
        "กดรับงานและลงพื้นที่สำรวจ",
        "เริ่มปฏิบัติงานซ่อมแซม (ใช้วัสดุ/อุปกรณ์ปกติ)",
        "เริ่มปฏิบัติงานซ่อมแซม (ใช้ทรัพยากรที่ได้รับอนุมัติ)",
        "ส่งข้อเสนอทรัพยากร",
        "ส่งรายงานผล",
      ].includes(label)
    )
      await reason.fill("ทดสอบตามขั้นตอนที่กำหนด");
    await dialog.getByRole("button", { name: "ยืนยัน" + label, exact: true }).click();
    if (
      [
        "ปิดเรื่อง",
        "อนุมัติ",
        "ไม่อนุมัติงบประมาณเฉพาะกิจ (ยุติใบงานซ่อมด่วนเพื่อนำเข้าแผนฯ / ประสานหน่วยงานภายนอก)",
      ].includes(label)
    ) {
      const confirmation = page.getByRole("dialog", {
        name: "ตรวจสอบก่อนยืนยัน",
        exact: true,
      });
      await waitForSettledDialog(confirmation);
      await confirmation.getByRole("button", { name: "ยืนยัน", exact: true }).click();
    }
    await expect(dialog).not.toBeVisible();
  }
  await switchUser("officer");
  await perform("รับเรื่องและส่งหน่วยงาน", async (d) => {
    await d.getByLabel("หัวหน้าหน่วยงาน", { exact: true }).fill("บัญชีทดสอบ LEADER");
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("บัญชีทดสอบ LEADER", { exact: true })
      .click();
  });
  await switchUser("leader");
  await perform("มอบหมายทีม", async (d) => {
    await d.getByLabel("ค้นหาทีมหรือผู้ลงพื้นที่", { exact: true }).fill("FIELD");
    await d.getByRole("checkbox", { name: "บัญชีทดสอบ FIELD", exact: true }).check();
  });
  await switchUser("field");
  await perform("กดรับงานและลงพื้นที่สำรวจ");
  await perform("ส่งเอกสารประเมินทรัพยากร/ของบจากหน้างาน");
  await switchUser("leader");
  await perform("ส่งข้อเสนอทรัพยากร", async (d) => {
    await d.getByLabel("ชื่อคำขอทรัพยากร", { exact: true }).fill("ขอวัสดุซ่อมถนน");
    await d.getByRole("spinbutton", { name: "ราคารายการ 1", exact: true }).fill("1000");
    await d.getByLabel("ระยะเวลาดำเนินการ (วัน)", { exact: true }).fill("2");
    await d.locator("input[type=file]:not([capture])").setInputFiles(pdfEvidence("proposal.pdf"));
    await expect(d.getByRole("link", { name: "proposal.pdf", exact: true })).toBeVisible();
    await expect(d.locator(".resource-total")).toContainText("1,000.00");
  });
  await switchUser("officer");
  await perform("เอกสารครบถ้วนตามระเบียบสารบรรณ - ส่งต่อผู้มีอำนาจ", async (d) => {
    await chooseApprover(page, d);
  });
  await switchUser("approver");
  await perform(
    "ไม่อนุมัติงบประมาณเฉพาะกิจ (ยุติใบงานซ่อมด่วนเพื่อนำเข้าแผนฯ / ประสานหน่วยงานภายนอก)",
  );
  const saved = await (await page.request.get("/api/complaints/" + id)).json();
  expect(saved.complaint.status).toBe("TERMINATED");
  expect(saved.resources).toHaveLength(1);
  await expect(
    page.locator(".workspace-detail").getByText("ยุติเรื่องตามผลพิจารณา", { exact: true }),
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
  // Filing a report follows it, so the reporter's own card is already marked as followed.
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
  await expect(page.getByRole("heading", { name: "ติดตามสถานะ", exact: true })).toBeVisible();
  await expect(
    page.locator(".ant-list-item").filter({ hasText: "#" + id.slice(0, 8).toUpperCase() }),
  ).toBeVisible();
});

// The officer's usual approver is preselected after the first time; otherwise pick them.
async function chooseApprover(page: Page, d: Locator) {
  const chosen = d.locator(".ant-select-selection-item").filter({ hasText: "บัญชีทดสอบ APPROVER" });
  if (await chosen.count()) return;
  const approver = d.getByLabel("ผู้อนุมัติตามลำดับ (เลือก 1 คน)", { exact: true });
  await approver.click();
  await approver.fill("บัญชีทดสอบ APPROVER");
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText(/^บัญชีทดสอบ APPROVER/)
    .click();
}

import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  accountPassword,
  confirmLocation,
  openReport,
  pdfEvidence,
  photo,
  signIn,
  signOut,
  submitReport,
  waitForSettledDialog,
} from "../tests/product-flow";

async function fits(page: Page, where: string) {
  const sizes = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    view: window.innerWidth,
  }));
  expect(sizes.scroll, `${where}: page wider than screen`).toBeLessThanOrEqual(sizes.view + 1);
}
async function dialogFits(page: Page, dialog: Locator, where: string) {
  const box = (await dialog.boundingBox())!;
  const width = await page.evaluate(() => window.innerWidth);
  expect(box.x, `${where}: dialog starts off screen`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${where}: dialog ends off screen`).toBeLessThanOrEqual(width + 1);
}
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `../work/devices-screens/${test.info().project.name}/${name}.png`,
    fullPage: true,
  });
}
async function menu(page: Page, name: string) {
  const opener = page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true });
  if (await opener.isVisible()) {
    await opener.tap();
    await page.locator(".ant-drawer").getByRole("menuitem", { name }).tap();
  } else await page.getByRole("menuitem", { name }).tap();
}

// Playwright's WebKit has no fake camera, so iPhone runs get a moving canvas as the camera.
function canvasCamera() {
  const fake = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    let frame = 0;
    setInterval(() => {
      ctx.fillStyle = `hsl(${(frame++ * 9) % 360} 70% 50%)`;
      ctx.fillRect(0, 0, 320, 240);
    }, 33);
    const stream = canvas.captureStream(30);
    try {
      const audio = new AudioContext();
      const tone = audio.createOscillator();
      const out = audio.createMediaStreamDestination();
      tone.connect(out);
      tone.start();
      out.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    } catch {
      /* video only */
    }
    return stream;
  };
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = fake;
  else Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: fake } });
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("citizen reports with symptom buttons and an in-app video, saved on the real server", async ({
  page,
  browserName,
}) => {
  const errors = watchErrors(page);
  if (browserName === "webkit") await page.addInitScript(canvasCamera);
  else await page.context().grantPermissions(["camera", "microphone"]);
  await signIn(page, "citizen");
  await fits(page, "citizen home");
  await openReport(page);
  await confirmLocation(page, "ทดสอบอุปกรณ์ " + test.info().project.name);
  await page.getByRole("button", { name: /ถนนและทางเท้า/ }).tap();
  const symptoms = page.locator(".symptom-picker");
  await symptoms.getByText("ถนนเป็นหลุม", { exact: true }).tap();
  await symptoms.getByText("เกิดซ้ำบ่อย", { exact: true }).tap();
  await expect(symptoms.locator(".ant-tag-checkable-checked")).toHaveCount(2);
  await expect(page.locator(".media-privacy-note")).toBeVisible();
  await expect(page.getByText("ข้อมูลส่วนตัวของคุณจะไม่ถูกเผยแพร่", { exact: true })).toBeVisible();
  await fits(page, "report form");

  await page.getByRole("button", { name: /ถ่ายวิดีโอ/ }).tap();
  const recorder = page.getByRole("dialog").filter({ has: page.locator(".video-recorder-view") });
  await waitForSettledDialog(recorder);
  await dialogFits(page, recorder, "video recorder");
  await recorder.getByRole("button", { name: "เริ่มบันทึก" }).tap();
  await expect(recorder.getByRole("status")).toContainText("เหลืออีก");
  await page.waitForTimeout(3000);
  await recorder.getByRole("button", { name: "หยุดบันทึก" }).tap();
  await expect(recorder.getByRole("status")).toContainText("MB");
  await shot(page, "video-recorded");
  await recorder.getByRole("button", { name: "ใช้วิดีโอนี้" }).tap();
  await expect(recorder).toBeHidden();
  await expect(page.getByText(/^video-.+\.(mp4|webm)$/)).toBeVisible();
  await shot(page, "report-ready");

  const id = await submitReport(page);
  const saved = await (await page.request.get("/api/complaints/" + id)).json();
  expect(saved.complaint.title).toBe("ถนนและทางเท้า");
  expect(saved.complaint.description).toBe("ถนนเป็นหลุม, เกิดซ้ำบ่อย");
  expect(saved.files.map((file: any) => file.original_name)).toEqual([
    expect.stringMatching(/^video-.+\.(mp4|webm)$/),
  ]);
  await fits(page, "report saved");
  expect(errors).toEqual([]);
});

test("stock register, workload, SLA extension and stock issue/return work on this device", async ({
  page,
}) => {
  const errors = watchErrors(page);
  page.setDefaultTimeout(20000);
  const stamp = Date.now();
  const itemName = `เทปกั้นเขต ${stamp}`;
  const title = `ทดสอบอุปกรณ์ ${test.info().project.name} ${stamp}`;

  // Stock keeper adds an item through the stock page.
  await signIn(page, "admin", accountPassword("admin"));
  await menu(page, "คลังวัสดุ");
  await expect(page.getByRole("heading", { name: "คลังวัสดุ / ทรัพยากร" })).toBeVisible();
  await page.getByRole("button", { name: "เพิ่มวัสดุใหม่" }).tap();
  const create = page.getByRole("dialog", { name: "เพิ่มวัสดุใหม่" });
  await waitForSettledDialog(create);
  await dialogFits(page, create, "new stock item");
  await create.getByLabel("ชื่อวัสดุ", { exact: true }).fill(itemName);
  await create.getByLabel("หน่วย", { exact: true }).fill("ม้วน");
  await create.getByLabel("ยอดยกมา / รับเข้าครั้งแรก (ไม่บังคับ)", { exact: true }).fill("10");
  const note = create.getByLabel(/หลักฐานการรับเข้า|หมายเหตุ/);
  if (await note.count()) await note.first().fill("ใบส่งของทดสอบ " + stamp);
  await create.getByRole("button", { name: "บันทึก" }).tap();
  await expect(create).toBeHidden();
  await expect(page.locator(".inventory-page")).toContainText(itemName);
  await fits(page, "stock page");
  await shot(page, "inventory");
  await signOut(page);

  // A citizen case to work on, created directly so this test focuses on staff screens.
  await signIn(page, "citizen");
  const catalog = await (await page.request.get("/api/catalog")).json();
  const road = catalog.categories.find((c: any) => c.name === "ถนนและทางเท้า");
  const centre = await (await page.request.get("/api/municipal-center")).json();
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  const created = await page.request.post("/api/complaints", {
    headers: { [csrf.headerName]: csrf.token },
    multipart: {
      complaint: {
        name: "complaint.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            categoryId: road.id,
            title,
            description: "ถนนเป็นหลุม",
            address: "จุดทดสอบอุปกรณ์",
            latitude: centre.latitude,
            longitude: centre.longitude,
            answers: {},
          }),
        ),
      },
      files: pdfEvidence("device-evidence.pdf"),
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { id } = await created.json();
  await signOut(page);

  async function openCase(role: string) {
    await signIn(page, role, role === "admin" ? accountPassword("admin") : undefined);
    await page.getByRole("button", { name: "เปิดคิวงาน", exact: true }).tap();
    await page.getByRole("searchbox", { name: "ค้นหาเลขเรื่อง / หัวข้อ" }).fill(title);
    await page.getByRole("button", { name: new RegExp("เปิดงาน " + title) }).tap();
    await expect(
      page.locator(".workspace-detail").getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await fits(page, role + " case detail");
  }
  async function act(label: string, fill?: (dialog: Locator) => Promise<void>, reason = true) {
    await page.getByRole("button", { name: label, exact: true }).tap();
    const dialog = page.getByRole("dialog", { name: label, exact: true });
    await waitForSettledDialog(dialog);
    await dialogFits(page, dialog, label);
    if (fill) await fill(dialog);
    if (reason)
      await dialog
        .getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true })
        .fill("ทดสอบบนอุปกรณ์");
    const done = page.waitForResponse(
      (r) => r.url().endsWith(`/api/complaints/${id}/actions`) && r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "ยืนยัน" + label, exact: true }).tap();
    const response = await done;
    expect(response.ok(), await response.text()).toBeTruthy();
    await expect(dialog).toBeHidden();
  }

  await openCase("officer");
  const sla = page.locator(".sla-panel");
  await expect(sla).toContainText("กำหนดแก้ไขแล้วเสร็จ");
  await expect(sla).toContainText("แจ้งความคืบหน้าให้ผู้แจ้งภายใน");
  await act("รับเรื่องและส่งหน่วยงาน", async (d) => {
    await d.getByLabel("วิธีดำเนินงาน", { exact: true }).fill("ซ่อมและตรวจสอบพื้นที่");
    await d.getByLabel("ความเร่งด่วน", { exact: true }).click();
    await page.locator(".ant-select-dropdown:visible").getByText("ปกติ", { exact: true }).click();
    await d.getByLabel("ขอบเขตงาน", { exact: true }).fill("ซ่อมทางเท้า");
    await d.getByLabel("ข้อควรระวัง", { exact: true }).fill("กั้นพื้นที่");
    await d.getByLabel("ช่องทางประสานงาน", { exact: true }).fill("หัวหน้าทีม");
    await d.getByLabel("หัวหน้าหน่วยงาน", { exact: true }).fill("บัญชีทดสอบ LEADER");
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("บัญชีทดสอบ LEADER", { exact: true })
      .click();
  });
  await signOut(page);

  const slaCalls: string[] = [];
  page.on("response", (r) => r.url().includes("/sla") && slaCalls.push(`${r.status()}`));
  page.on("requestfailed", (r) => r.url().includes("/sla") && slaCalls.push("failed"));
  await openCase("leader");
  await expect(sla, "SLA calls: " + slaCalls.join(",")).toContainText("กำหนดแก้ไขแล้วเสร็จ");
  await sla.getByRole("button", { name: "ขอขยายเวลา" }).tap();
  const extend = page.getByRole("dialog", { name: "ขอขยายระยะเวลาดำเนินการ" });
  await waitForSettledDialog(extend);
  await dialogFits(page, extend, "SLA extension request");
  await extend.getByText("15 วัน", { exact: true }).tap();
  await extend.getByText("รอวัสดุหรืองบประมาณ", { exact: true }).tap();
  await extend.getByRole("button", { name: "ยืนยัน" }).tap();
  await expect(extend).toBeHidden();
  await expect(sla).toContainText("รอพิจารณา");
  await expect(sla).toContainText("ขอเพิ่ม 15 วัน");
  await act("มอบหมายทีม", async (d) => {
    await d.getByLabel("ค้นหาทีมหรือผู้ลงพื้นที่", { exact: true }).fill("FIELD");
    const person = d.locator(".assignment-person").filter({ hasText: "บัญชีทดสอบ FIELD" });
    await expect(person).toContainText(/ว่าง|งานค้าง|งานมาก/);
    await shot(page, "assign-workload");
    await d.getByRole("checkbox", { name: "บัญชีทดสอบ FIELD", exact: true }).check();
  });
  await signOut(page);

  // The case is now with the field team, so the officer reaches it from the notification.
  await signIn(page, "officer");
  await menu(page, "การแจ้งเตือน");
  await page
    .locator(".ant-list-item")
    .filter({ hasText: "หัวหน้าขอขยายระยะเวลาดำเนินการ" })
    .first()
    .getByRole("button", { name: "ดูคำร้อง", exact: true })
    .tap();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await fits(page, "officer case from notification");
  await sla.getByRole("button", { name: "อนุมัติ", exact: true }).tap();
  const decide = page.getByRole("dialog", { name: "อนุมัติการขยายเวลา" });
  await waitForSettledDialog(decide);
  await decide.getByText("เหตุผลเพียงพอ", { exact: true }).tap();
  await decide.getByRole("button", { name: "ยืนยัน" }).tap();
  await expect(decide).toBeHidden();
  await expect(sla).toContainText("อนุมัติแล้ว");
  await shot(page, "sla-approved");
  await signOut(page);

  await openCase("field");
  await act("กดรับงานและลงพื้นที่สำรวจ", undefined, false);
  await act(
    "เริ่มปฏิบัติงานซ่อมแซม (ใช้วัสดุ/อุปกรณ์ปกติ)",
    async (d) => {
      await d.locator("input[type=file][capture]").setInputFiles(photo("start.png"));
      await expect(d.getByRole("link", { name: "start.png", exact: true })).toBeVisible();
      await d.getByRole("button", { name: "เพิ่มวัสดุจากคลัง" }).tap();
      await d.getByRole("combobox", { name: "วัสดุรายการที่ 1" }).click();
      await page.keyboard.type(String(stamp));
      await page
        .locator(".ant-select-dropdown:visible")
        .getByText(new RegExp("^" + itemName))
        .click();
      await d.getByRole("spinbutton", { name: "จำนวนที่เบิก 1" }).fill("3");
      await shot(page, "start-with-stock");
    },
    false,
  );
  await act(
    "ส่งรายงานผล",
    async (d) => {
      const steps = d.locator(".field-evidence-steps section");
      await steps.nth(1).locator("input[type=file]").last().setInputFiles(photo("after.png"));
      await expect(
        steps.nth(1).getByRole("link", { name: "after.png", exact: true }),
      ).toBeVisible();
      await d.getByLabel("ข้อเท็จจริงและผลดำเนินการ", { exact: true }).fill("ซ่อมเสร็จแล้ว");
      await d.getByRole("spinbutton", { name: `จำนวนที่คืน ${itemName}` }).fill("1");
      await shot(page, "report-with-return");
    },
    false,
  );
  await signOut(page);

  await openCase("leader");
  const usage = page.locator(".stock-usage");
  await expect(usage).toContainText(itemName);
  const row = usage.locator("tr").filter({ hasText: itemName });
  await expect(row.locator("td").nth(1)).toContainText("3");
  await expect(row.locator("td").nth(2)).toContainText("1");
  await expect(row.locator("td").nth(3)).toContainText("2");
  await shot(page, "stock-usage");
  const stock = await (await page.request.get("/api/stock")).json();
  const item = (Array.isArray(stock) ? stock : stock.items).find((x: any) => x.name === itemName);
  expect(Number(item.on_hand)).toBe(8);
  const detail = await (await page.request.get("/api/complaints/" + id)).json();
  expect(detail.history.map((e: any) => e.action)).toEqual(
    expect.arrayContaining(["TRIAGE", "ASSIGN", "ACCEPT", "START", "REPORT"]),
  );
  expect(errors).toEqual([]);
});

import { expect, test, type Page } from "@playwright/test";
import { signIn, pdfEvidence, photo } from "./product-flow";
async function write(page: Page, path: string, body: unknown) {
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  const response = await page.request.post("/api" + path, {
    headers: { [csrf.headerName]: csrf.token },
    data: body,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("real five-case route assigns one team atomically and field submits PDF and valid video evidence", async ({
  page,
}) => {
  test.setTimeout(240000);
  expect(new URL(test.info().project.use.baseURL || "").hostname).toBe("127.0.0.1");
  const stamp = Date.now(),
    title = "รอบเส้นทางจริง " + stamp;
  await signIn(page, "citizen");
  const catalog = await (await page.request.get("/api/catalog")).json();
  const category = catalog.categories.find((c: any) => c.name === "ถนนและทางเท้า");
  expect(category).toBeTruthy();
  const fields = JSON.parse(category.fields || "[]"),
    answers = Object.fromEntries(
      fields.filter((f: any) => f.required).map((f: any) => [f.key, "ข้อมูลทดสอบเส้นทาง"]),
    );
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const csrf = await (await page.request.get("/api/auth/csrf")).json();
    const response = await page.request.post("/api/complaints", {
      headers: { [csrf.headerName]: csrf.token },
      multipart: {
        complaint: {
          name: "complaint.json",
          mimeType: "application/json",
          buffer: Buffer.from(
            JSON.stringify({
              categoryId: category.id,
              title: `${title} จุด ${i + 1}`,
              description: "ข้อมูลทดสอบรอบงานในฐานข้อมูลแยก",
              address: `ถนนทดสอบเส้นทาง จุด ${i + 1}`,
              latitude: 13.75 + i * 0.001,
              longitude: 100.5 + i * 0.001,
              answers,
              contactName: "ผู้ทดสอบ",
              contactPhone: "0000000000",
            }),
          ),
        },
        files: pdfEvidence("route-initial.pdf"),
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    ids.push((await response.json()).id);
  }
  await signIn(page, "officer");
  const initial = await (await page.request.get("/api/complaints/" + ids[0])).json();
  const department = initial.complaint.department_id;
  const heads = await (
    await page.request.get("/api/people?role=LEADER&departmentId=" + department)
  ).json();
  const head = heads.find((p: any) => p.display_name === "บัญชีทดสอบ LEADER");
  expect(head).toBeTruthy();
  for (const id of ids)
    await write(page, `/complaints/${id}/actions`, {
      action: "TRIAGE",
      version: 0,
      leaderId: head.id,
      workScope: "ซ่อมจุดทดสอบ",
      reason: "จัดกลุ่มทดสอบในฐานข้อมูลแยก",
    });
  await page.getByRole("menuitem", { name: /วางแผนเส้นทาง/ }).click();
  for (let i = 0; i < 5; i++)
    await page
      .getByRole("checkbox", { name: `เลือกงาน ${title} จุด ${i + 1}`, exact: true })
      .check();
  await page.getByRole("spinbutton", { name: "ละติจูดจุดเริ่ม", exact: true }).fill("13.749");
  await page.getByRole("spinbutton", { name: "ลองจิจูดจุดเริ่ม", exact: true }).fill("100.499");
  const calculation = page.waitForResponse(
    (r) => r.url().endsWith("/api/route-plans/calculate") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "คำนวณเส้นทาง", exact: true }).click();
  const calculated = await calculation;
  expect(calculated.ok(), await calculated.text()).toBe(true);
  const draft = await calculated.json();
  expect(draft.stops).toHaveLength(5);
  await page.getByLabel("ชื่อรอบงาน", { exact: true }).fill(title);
  await page.getByRole("button", { name: "เสนอรอบให้หัวหน้า", exact: true }).click();
  await expect(page.getByText("รอหัวหน้ายืนยันทีม", { exact: true }).first()).toBeVisible();
  await signIn(page, "leader");
  const fieldsPeople = await (
    await page.request.get("/api/people?role=FIELD&departmentId=" + department)
  ).json();
  const member = fieldsPeople.find((p: any) => p.display_name === "บัญชีทดสอบ FIELD");
  expect(member).toBeTruthy();
  const team = await write(page, "/teams", {
    name: "ทีมเส้นทางจริง " + stamp,
    memberIds: [member.id],
    representativeId: member.id,
  });
  await page.getByRole("menuitem", { name: /วางแผนเส้นทาง/ }).click();
  await page.getByRole("button", { name: `เปิดรอบ ${title}`, exact: true }).click();
  await page.getByRole("combobox", { name: "ทีมลงพื้นที่สำหรับรอบนี้", exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText(new RegExp("ทีมเส้นทางจริง " + stamp))
    .click();
  const confirmation = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/route-plans/${draft.id}/confirm`) && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "ยืนยันมอบหมายทั้งรอบ", exact: true }).click();
  const confirmedResponse = await confirmation;
  expect(confirmedResponse.ok(), await confirmedResponse.text()).toBe(true);
  const confirmed = await confirmedResponse.json();
  expect(confirmed.team_id).toBe(team.id);
  expect(confirmed.stops.every((s: any) => s.work_order_id && s.work_status === "ASSIGNED")).toBe(
    true,
  );
  await signIn(page, "field");
  await page.getByRole("menuitem", { name: /รอบงานของฉัน/ }).click();
  await page.getByRole("button", { name: `เปิดรอบ ${title}`, exact: true }).click();
  const first = confirmed.stops[0];
  await page.getByRole("button", { name: `เปิดงาน ${first.title}`, exact: true }).click();
  for (const label of ["รับงาน", "เริ่มปฏิบัติงาน"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: label, exact: true });
    await expect(dialog.getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true })).toHaveCount(0);
    const action = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/complaints/${first.complaint_id}/actions`) &&
        r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "ยืนยัน" + label, exact: true }).click();
    expect((await action).ok()).toBe(true);
    await expect(dialog).not.toBeVisible();
  }
  await page.getByRole("button", { name: "ส่งรายงานผล", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "ส่งรายงานผล", exact: true });
  await dialog
    .getByLabel("ข้อเท็จจริงและผลดำเนินการ", { exact: true })
    .fill("ทำงานจุดแรกในรอบเสร็จ พร้อมเอกสารและวิดีโอประกอบ");
  for (const [i, stage] of ["before", "after"].entries()) {
    const section = dialog.locator(".field-evidence-steps section").nth(i);
    await section
      .locator("input[type=file]")
      .last()
      .setInputFiles(photo(stage + ".png"));
    await expect(section.getByRole("link", { name: stage + ".png", exact: true })).toBeVisible();
  }
  await dialog.locator("summary", { hasText: "วิดีโอหรือเอกสารประกอบเพิ่มเติม" }).click();
  const extra = dialog.locator("details.additional-evidence");
  await extra.locator("input[type=file]").setInputFiles(pdfEvidence("route-extra.pdf"));
  await expect(extra.getByRole("status")).toContainText("แนบไฟล์แล้ว: route-extra.pdf");
  const video = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 100;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#1e7d55";
    context.fillRect(0, 0, 160, 100);
    const stream = canvas.captureStream(5),
      recorder = new MediaRecorder(stream, { mimeType: "video/webm" }),
      chunks: BlobPart[] = [];
    const result = new Promise<number[]>((resolve, reject) => {
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onerror = () => reject(new Error("Cannot create test video"));
      recorder.onstop = async () =>
        resolve(
          Array.from(new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer())),
        );
    });
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 800));
    context.fillStyle = "#fff";
    context.fillRect(10, 10, 30, 30);
    await new Promise((resolve) => setTimeout(resolve, 300));
    recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
    return result;
  });
  await extra.locator("input[type=file]").setInputFiles({
    name: "route-extra.webm",
    mimeType: "video/webm",
    buffer: Buffer.from(video),
  });
  await expect(extra.getByRole("status")).toContainText("แนบไฟล์แล้ว: route-extra.webm");
  const report = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/complaints/${first.complaint_id}/actions`) &&
      r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "ยืนยันส่งรายงานผล", exact: true }).click();
  const reported = await report;
  expect(reported.ok(), await reported.text()).toBe(true);
  await expect(dialog).not.toBeVisible();
  const persisted = await (await page.request.get("/api/complaints/" + first.complaint_id)).json();
  for (const name of ["route-extra.pdf", "route-extra.webm"])
    expect(persisted.files.find((f: any) => f.original_name === name).report_id).toBeTruthy();
  const round = await (await page.request.get("/api/route-plans/" + draft.id)).json();
  expect(round.stops.filter((s: any) => s.complaint_status === "ASSIGNED")).toHaveLength(4);
  await page.screenshot({ path: "../work/screenshots/route-field-evidence.png", fullPage: true });
});

import { switchLanguage } from "./language-control";
import { test, expect, type Page } from "@playwright/test";
import { photo, waitForSettledDialog } from "./product-flow";

async function workspace(page: Page, role: string, status: string, actions: string[]) {
  const complaint = {
    id: "operational-case",
    title: "Original title",
    category_name: "รายละเอียด",
    address: "Original address",
    description: "Original description",
    status,
    version: 7,
    votes: 0,
    department_id: "engineering",
    answers: "{}",
    assignment_details: JSON.stringify({ appointment: "2026-12-12", urgency: "PRIORITY" }),
    form_schema: "[]",
    due_at: "2026-12-20T00:00:00Z",
  };
  const data: any = {
    complaint,
    actions: actions.map((action) => ({ action })),
    history: [{ action: "ACCEPT", reason: "รายละเอียด", created_at: "2026-11-05T00:00:00Z" }],
    files: [],
    resources: [],
    reports: [],
    reviews: [],
    workOrders: [],
    approvals: [],
    transfers: [],
    approvalStages: 1,
  };
  const writes: { body: any; key: string | undefined }[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/files") && route.request().method() === "POST") {
      const body = route.request().postDataBuffer()!.toString();
      const file = {
        id: "evidence-" + data.files.length,
        original_name: body.match(/filename="([^"]+)"/)?.[1],
        content_type: "image/png",
        evidence_stage: body.match(/name="evidenceStage"\r\n\r\n([^\r]+)/)?.[1],
        uploaded_by: "operator",
        size_bytes: 100,
      };
      data.files.push(file);
      return route.fulfill({ json: { id: file.id } });
    }
    if (path.endsWith("/actions")) {
      writes.push({
        body: route.request().postDataJSON(),
        key: route.request().headers()["idempotency-key"],
      });
      return route.fulfill({ json: {} });
    }
    const responses: Record<string, unknown> = {
      "/api/auth/me": {
        id: "operator",
        role,
        display_name: "Original person",
        department_id: "engineering",
      },
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { acknowledged: true, version: "test" },
      "/api/catalog": {
        categories: [],
        departments: [{ id: "engineering", name: "รายละเอียด" }],
        queues: [],
      },
      "/api/complaints": {
        items: [complaint],
        total: 1,
        stats: { total: 1, in_progress: 1, closed: 0, overdue: 0 },
      },
      "/api/complaints/operational-case": data,
      "/api/teams": [],
      "/api/people": [],
    };
    return route.fulfill({ json: responses[path] ?? {} });
  });
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  if (role === "APPROVER")
    await page.getByRole("button", { name: "เปิดคิวงานอนุมัติ", exact: true }).click();
  else await page.getByRole("button", { name: "เปิดคิวงาน", exact: true }).click();
  await page.getByRole("button", { name: /(?:เปิดงาน|Open task) Original title/ }).click();
  return { data, writes };
}
async function switchEnglish(page: Page) {
  await switchLanguage(page, "en");
}

test("decline requires a reason and preserves DECLINE/version/idempotency; ACCEPT and START omit reason", async ({
  page,
}) => {
  const { writes } = await workspace(page, "FIELD", "ASSIGNED", ["ACCEPT", "DECLINE", "START"]);
  await page.getByRole("button", { name: "กดปฏิเสธงาน", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^ยืนยัน/ }).click();
  await expect(dialog.getByText("กรุณาระบุเหตุผลให้ครบถ้วน", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
  await dialog
    .getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true })
    .fill("Original decline reason");
  await dialog.getByRole("button", { name: /^ยืนยัน/ }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toEqual({
    action: "DECLINE",
    version: 7,
    reason: "Original decline reason",
  });
  expect(writes[0].key).toMatch(/^[\w-]{36}$/);
  await page.getByRole("button", { name: /(?:เปิดงาน|Open task) Original title/ }).click();
  for (const name of [
    "กดรับงานและลงพื้นที่สำรวจ",
    "เริ่มปฏิบัติงานซ่อมแซม (ใช้วัสดุ/อุปกรณ์ปกติ)",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    await dialog.getByRole("button", { name: /^ยืนยัน/ }).click();
    await expect(dialog).toHaveCount(0);
  }
  expect(writes.slice(1).map((w) => w.body)).toEqual([
    { action: "ACCEPT", version: 7 },
    { action: "START", version: 7 },
  ]);
});

test("denial preset fills once and preserves manual edits and existing DENY payload in header English", async ({
  page,
}) => {
  const { writes } = await workspace(page, "APPROVER", "RESOURCE_APPROVAL", ["DENY"]);
  await switchEnglish(page);
  await page.getByRole("button", { name: "Denied", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Confirm / }).click();
  await expect(dialog.getByText("Provide a complete reason", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
  await dialog.getByRole("button", { name: /^Exceeds the normal maintenance budget/ }).click();
  const reason = dialog.getByRole("textbox");
  await expect(reason).toHaveValue(/Exceeds the normal maintenance budget/);
  await reason.fill("รายละเอียด edited by approver");
  await expect(dialog.locator(".language-switcher")).toHaveCount(0);
  await expect(reason).toHaveValue("รายละเอียด edited by approver");
  await dialog.getByRole("button", { name: /^Confirm / }).click();
  const confirm = page.getByRole("dialog").last();
  await expect(confirm).toContainText("ends in TownTrack");
  await expect(confirm.locator(".language-switcher")).toHaveCount(0);
  await expect(confirm).toContainText("รายละเอียด edited by approver");
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toEqual({
    action: "DENY",
    version: 7,
    reason: "รายละเอียด edited by approver",
  });
  expect(writes[0].key).toMatch(/^[\w-]{36}$/);
});

test("resource form follows header language and preserves editable rows and source department data", async ({
  page,
}) => {
  await workspace(page, "LEADER", "RESOURCE_DRAFT", ["PROPOSE"]);
  await switchEnglish(page);
  await page.getByRole("button", { name: "Submit resource proposal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Resource request title", { exact: true }).fill("Original proposal");
  await dialog.getByRole("textbox", { name: "Item name 1", exact: true }).fill("Original sand");
  await dialog.getByRole("spinbutton", { name: "Item price 1", exact: true }).fill("125");
  await dialog.getByRole("button", { name: /Add item$/ }).click();
  await dialog.getByRole("textbox", { name: "Item name 2", exact: true }).fill("Original cement");
  await expect(dialog.locator(".language-switcher")).toHaveCount(0);
  await expect(dialog.getByLabel("Resource request title", { exact: true })).toHaveValue(
    "Original proposal",
  );
  await expect(dialog.getByRole("textbox", { name: "Item name 1", exact: true })).toHaveValue(
    "Original sand",
  );
  await expect(dialog.getByRole("spinbutton", { name: "Item price 1", exact: true })).toHaveValue(
    "125.00",
  );
  await expect(dialog.getByRole("textbox", { name: "Item name 2", exact: true })).toHaveValue(
    "Original cement",
  );
  await expect(dialog.getByLabel("Requesting department", { exact: true })).toHaveValue(
    "รายละเอียด",
  );
});

for (const width of [390, 768, 1280]) {
  for (const language of ["th", "en"]) {
    test(`operational review and denial draft fit header language ${language} at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await workspace(page, "APPROVER", "RESOURCE_APPROVAL", ["DENY", "APPROVE"]);
      await switchLanguage(page, language);
      await page
        .getByRole("button", {
          name: language === "th" ? "ไม่อนุมัติ" : "Denied",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("button", {
          name:
            language === "th"
              ? /^เกินวงเงินซ่อมบำรุงปกติ/
              : /^Exceeds the normal maintenance budget/,
        })
        .click();
      await dialog.getByRole("textbox").fill("Original reason edited at mobile width");
      await expect(dialog.locator(".language-switcher")).toHaveCount(0);
      await expect(dialog.getByRole("textbox")).toHaveValue(
        "Original reason edited at mobile width",
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await dialog.getByRole("textbox").scrollIntoViewIfNeeded();
      const reasonBox = await dialog.getByRole("textbox").boundingBox();
      const submitBox = await dialog.locator('button[type="submit"]').boundingBox();
      expect(submitBox!.y).toBeGreaterThanOrEqual(reasonBox!.y + reasonBox!.height);
      await page.screenshot({
        path: `../work/task3/operational-denial-${language}-${width}.png`,
        fullPage: true,
      });
    });
  }
}

test("report uses header language and retains text, before/after evidence and the REPORT contract", async ({
  page,
}) => {
  const { writes } = await workspace(page, "FIELD", "IN_PROGRESS", ["REPORT"]);
  await switchEnglish(page);
  await page.getByRole("button", { name: "Submit work report", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Findings and work results", { exact: true })
    .fill("Original findings and work results");
  const sections = dialog.locator(".field-evidence-steps section");
  await sections
    .nth(0)
    .locator('input[type="file"]')
    .first()
    .setInputFiles(photo("original-before.png"));
  await expect(
    sections.nth(0).getByRole("link", { name: "original-before.png", exact: true }),
  ).toBeVisible();
  await sections
    .nth(1)
    .locator('input[type="file"]')
    .first()
    .setInputFiles(photo("original-after.png"));
  await expect(
    sections.nth(1).getByRole("link", { name: "original-after.png", exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".language-switcher")).toHaveCount(0);
  await expect(dialog.getByLabel("Findings and work results", { exact: true })).toHaveValue(
    "Original findings and work results",
  );
  await expect(
    dialog.getByRole("link", { name: "original-before.png", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("link", { name: "original-after.png", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: /^Confirm / }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toEqual({
    action: "REPORT",
    version: 7,
    content: "Original findings and work results",
  });
});

test("local workflow conflict is translated while the unsent reason and request contract remain intact", async ({
  page,
}) => {
  await workspace(page, "FIELD", "ASSIGNED", ["DECLINE"]);
  await switchEnglish(page);
  await page.getByRole("button", { name: "Decline assignment", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่");
  await expect(dialog.locator(".language-switcher")).toHaveCount(0);
  const attempts: any[] = [];
  await page.route("**/api/complaints/operational-case/actions", (route) => {
    attempts.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, json: { message: "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่" } });
  });
  await dialog.getByRole("button", { name: /^Confirm / }).click();
  await expect(
    page.getByText("The data has changed. Please reload.", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveValue("ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่");
  expect(attempts).toEqual([
    { action: "DECLINE", version: 7, reason: "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่" },
  ]);
});

test("publication overlay uses header language and keeps selected evidence and consent without publishing", async ({
  page,
}) => {
  const { data, writes } = await workspace(page, "OFFICER", "RESOLVED", []);
  data.files.push({
    id: "source-image",
    original_name: "Original evidence.png",
    content_type: "image/png",
    uploaded_by: "operator",
    size_bytes: 100,
  });
  await page.reload();
  await page.getByRole("button", { name: "เปิดคิวงาน", exact: true }).click();
  await page.getByRole("button", { name: /(?:เปิดงาน|Open task) Original title/ }).click();
  await page.locator("summary").filter({ hasText: "ข้อมูลคำร้อง เอกสาร และรายงานทั้งหมด" }).click();
  await switchEnglish(page);
  await page.getByRole("button", { name: "Share a copy", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await waitForSettledDialog(dialog);
  await dialog.locator('input[type="file"]').setInputFiles(photo("Original cleaned copy.png"));
  await dialog.getByRole("checkbox").check();
  await expect(dialog.locator(".language-switcher")).toHaveCount(0);
  await expect(dialog).toContainText("Original evidence.png");
  await expect(dialog).toContainText("Original cleaned copy.png");
  await expect(dialog.getByRole("checkbox")).toBeChecked();
  expect(writes).toEqual([]);
});

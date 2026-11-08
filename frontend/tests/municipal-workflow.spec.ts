import { test, expect, type Page } from "@playwright/test";
import { pdfEvidence } from "./product-flow";

async function workspace(
  page: Page,
  role: string,
  status: string,
  actions: string[],
  historical = false,
  prepare?: (data: any) => void,
) {
  const complaint = {
    id: "municipal-case",
    title: "งานเทศบาลทดสอบ",
    address: "จุดทดสอบ",
    description: "รายละเอียด",
    status,
    version: 1,
    department_id: "engineering",
    answers: "{}",
    assignment_details: "{}",
    form_schema: "[]",
    due_at: "2026-12-01T00:00:00Z",
  };
  const files: any[] = [];
  const resources =
    role === "LEADER" && status === "RESOURCE_DRAFT"
      ? [{ id: "resource", status: "DRAFT", revisions: "[]" }]
      : [];
  const payload: any = {
    complaint,
    actions: actions.map((action) => ({ action })),
    history: [],
    files,
    resources,
    reports: [],
    reviews: [],
    readOnlyHistory: historical,
    limitedHistory: historical,
    workOrders: historical
      ? [
          {
            id: "old-order",
            status: "DECLINED",
            reason: "รถของทีมไม่พร้อม",
            created_at: "2026-11-05T01:00:00Z",
          },
        ]
      : [],
    approvals: [],
    approvalStages: 1,
    transfers:
      status === "TRANSFER_PENDING"
        ? [
            {
              id: "transfer",
              state: "PENDING",
              source_department_name: "กองช่าง",
              target_department_name: "กองสาธารณสุข",
              target_department_id: "health",
              reason: "ขอให้รับช่วงงานระบายน้ำ",
            },
          ]
        : [],
    writes: [],
    requests: [],
  };
  prepare?.(payload);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    payload.requests.push(route.request().url());
    if (path.endsWith("/actions") && route.request().method() === "POST") {
      payload.writes.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: complaint.id, status: "TRANSFER_PENDING", version: 2 } });
    }
    if (path.endsWith("/files") && route.request().method() === "POST") {
      files.push({
        id: "file-" + files.length,
        original_name: "extra.pdf",
        content_type: "application/pdf",
        evidence_stage: "GENERAL",
        uploaded_by: "test-user",
        size_bytes: 100,
      });
      return route.fulfill({ json: { id: files.at(-1).id } });
    }
    const responses: Record<string, unknown> = {
      "/api/auth/me": {
        id: "test-user",
        role,
        display_name: "ผู้ทดสอบ",
        department_id: ["LEADER", "FIELD"].includes(role) ? "engineering" : null,
      },
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/catalog": {
        categories: [],
        queues:
          role === "OFFICER"
            ? [
                { value: "intake", label: "รอรับเรื่อง" },
                { value: "handoff", label: "ส่งต่อ / จ่ายงานใหม่" },
                { value: "resources", label: "ตรวจคำขอทรัพยากร" },
                { value: "reports", label: "ตรวจรายงาน / ปิดเรื่อง" },
              ]
            : [],
        departments: [
          { id: "engineering", name: "กองช่าง" },
          { id: "health", name: "กองสาธารณสุข" },
        ],
      },
      "/api/complaints": {
        items: [complaint],
        total: 1,
        stats: { total: 1, in_progress: 1, closed: 0, overdue: 0 },
      },
      "/api/complaints/municipal-case": payload,
      "/api/teams": [],
      "/api/people": [
        { id: "health-leader", display_name: "หัวหน้ากองสาธารณสุข", department_id: "health" },
      ],
    };
    return route.fulfill({ json: responses[path] ?? {} });
  });
  await page.goto("/");
  if (historical) await page.getByRole("menuitem", { name: /ประวัติงาน/ }).click();
  await page.getByRole("button", { name: /เปิดงาน งานเทศบาลทดสอบ/ }).click();
  return payload;
}

test("accept and start do not ask for a reason while decline still requires one", async ({
  page,
}) => {
  await workspace(page, "FIELD", "ASSIGNED", ["ACCEPT", "DECLINE"]);
  await page.getByRole("button", { name: "กดรับงานและลงพื้นที่สำรวจ", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "กดรับงานและลงพื้นที่สำรวจ", exact: true });
  await expect(dialog.getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "กดปฏิเสธงาน", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "กดปฏิเสธงาน", exact: true });
  await dialog.getByRole("button", { name: "ยืนยันกดปฏิเสธงาน", exact: true }).click();
  await expect(dialog.getByText(/กรุณาระบุเหตุผล/)).toBeVisible();
});

test("first resource row cannot be removed and empty resource panel explains pending proposal", async ({
  page,
}) => {
  await workspace(page, "LEADER", "RESOURCE_DRAFT", ["PROPOSE"]);
  const panel = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "คำขอทรัพยากรและเอกสารประกอบ" }) });
  await expect(panel).toContainText("ยังไม่มีข้อเสนอทรัพยากร");
  await page.getByRole("button", { name: "ส่งข้อเสนอทรัพยากร", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "ส่งข้อเสนอทรัพยากร", exact: true });
  await expect(dialog.getByRole("button", { name: "ลบ", exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true })).toHaveCount(0);
});

test("supplementary report PDF visibly persists and confirms successful upload", async ({
  page,
}) => {
  await workspace(page, "FIELD", "IN_PROGRESS", ["REPORT"]);
  await page.getByRole("button", { name: "ส่งรายงานผล", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "ส่งรายงานผล", exact: true });
  const extra = dialog.locator(".additional-evidence");
  await expect(extra.getByRole("heading")).toBeVisible();
  await extra.locator("input[type=file]").setInputFiles(pdfEvidence("extra.pdf"));
  await expect(extra.getByRole("status")).toContainText("แนบไฟล์แล้ว");
  await expect(extra.getByRole("link", { name: "extra.pdf", exact: true })).toBeVisible();
});

test("the initial resource row stays present and price input rejects letters", async ({ page }) => {
  await workspace(page, "LEADER", "RESOURCE_DRAFT", ["PROPOSE"]);
  await page.getByRole("button", { name: "ส่งข้อเสนอทรัพยากร", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "ส่งข้อเสนอทรัพยากร", exact: true });
  await expect(dialog.getByRole("button", { name: "ลบรายการ 1", exact: true })).toHaveCount(0);
  const price = dialog.getByRole("spinbutton", { name: "ราคารายการ 1", exact: true });
  await price.pressSequentially("abc");
  await expect(price).toHaveValue("");
});

test("leader can render a valid proposal PDF and distinguish broken documents", async ({
  page,
}) => {
  const data = await workspace(page, "LEADER", "RESOURCE_CHECK", []);
  const sample = pdfEvidence("mock-proposal.pdf").buffer;
  const file = {
    id: "sample-pdf",
    original_name: "mock-proposal.pdf",
    content_type: "application/pdf",
    size_bytes: sample.length,
    resource_id: "resource",
    resource_revision_id: "revision",
  };
  data.files.push(file);
  data.resources.push({
    id: "resource",
    revisions: JSON.stringify([
      { id: "revision", revision: 1, proposal: "Proposal", amount: 100, duration_days: 1 },
    ]),
  });
  await page.route("**/api/files/sample-pdf", (route) =>
    route.fulfill({ contentType: "application/pdf", body: sample }),
  );
  await page
    .getByRole("button", { name: /โหลดใหม่/ })
    .last()
    .click();
  await expect(page.locator(".resource-review-card")).toContainText("Proposal");
  await page
    .getByRole("button", { name: /ดูเอกสาร/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "mock-proposal.pdf", exact: true });
  await expect(dialog.locator("canvas")).toBeVisible();
  await expect(dialog.getByText(/หน้า 1 \/ /)).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.route("**/api/files/sample-pdf", (route) =>
    route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4 invalid" }),
  );
  await page
    .getByRole("button", { name: /ดูเอกสาร/ })
    .first()
    .click();
  await expect(dialog).toContainText("ข้อมูลเอกสารเสียหาย");
});

test("officer filters show the four work groups that require officer action", async ({ page }) => {
  await workspace(page, "OFFICER", "NEW", ["TRIAGE"]);
  await expect(
    page.getByRole("button", { name: "ส่งต่อ / จ่ายงานใหม่", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "รออนุมัติ", exact: true })).toHaveCount(0);
});

test("leader requests another department with a note and officer selects that department's head", async ({
  page,
}) => {
  const request = await workspace(page, "LEADER", "LEADER_REVIEW", ["REQUEST_TRANSFER"]);
  await page.getByRole("button", { name: "ส่งต่อหน่วยงานอื่น", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "ส่งต่อหน่วยงานอื่น", exact: true });
  await dialog.getByLabel("หน่วยงานที่จะรับช่วงต่อ", { exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("กองสาธารณสุข", { exact: true })
    .click();
  await dialog
    .getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true })
    .fill("งานถนนเสร็จแล้ว ให้กองสาธารณสุขเก็บเศษขยะต่อ");
  await dialog.getByRole("button", { name: "ยืนยันส่งต่อหน่วยงานอื่น", exact: true }).click();
  await expect.poll(() => request.writes.length).toBe(1);
  expect(request.writes[0].targetDepartmentId).toBe("health");
  page = await page.context().newPage();
  const dispatch = await workspace(page, "OFFICER", "TRANSFER_PENDING", [
    "TRANSFER_DEPARTMENT",
    "RETURN_TRANSFER",
  ]);
  await page.getByRole("button", { name: "จ่ายงานให้หน่วยงานถัดไป", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "จ่ายงานให้หน่วยงานถัดไป", exact: true });
  await expect(dialog.getByLabel("หน่วยงานที่จะรับช่วงต่อ", { exact: true })).toBeDisabled();
  await dialog.getByLabel("หัวหน้าหน่วยงานที่รับช่วงต่อ", { exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("หัวหน้ากองสาธารณสุข", { exact: true })
    .click();
  await dialog
    .getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true })
    .fill("ตรวจแล้ว มอบหมายกองสาธารณสุขรับช่วงต่อ");
  await dialog.getByRole("button", { name: "ยืนยันจ่ายงานให้หน่วยงานถัดไป", exact: true }).click();
  await expect.poll(() => dispatch.writes.length).toBe(1);
  expect(dispatch.writes[0].leaderId).toBe("health-leader");
  expect(dispatch.writes[0].targetDepartmentId).toBe("health");
});

test("declined team member history shows its stored reason and stays read only", async ({
  page,
}) => {
  const data = await workspace(page, "FIELD", "TRIAGED", [], true);
  await expect(page.getByRole("heading", { name: "เหตุผลส่งคืนงาน", exact: true })).toBeVisible();
  await expect(page.getByText("รถของทีมไม่พร้อม", { exact: true }).first()).toBeVisible();
  expect(
    data.requests.some((url: string) =>
      url.includes("/api/complaints/municipal-case?historyOnly=true"),
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "กดรับงานและลงพื้นที่สำรวจ", exact: true }),
  ).toHaveCount(0);
});

test("current approver can still open its resource section from read only history", async ({
  page,
}) => {
  await workspace(page, "APPROVER", "TERMINATED", [], true, (data) => {
    data.limitedHistory = false;
    data.workOrders = [];
    data.resources = [
      {
        id: "resource",
        revisions: JSON.stringify([
          {
            id: "revision",
            revision: 1,
            proposal: "Original reviewed proposal",
            amount: 100,
            duration_days: 1,
          },
        ]),
      },
    ];
  });
  const summary = page.locator("summary", { hasText: "คำขอทรัพยากรและเอกสารประกอบ" });
  await expect(summary).toBeVisible();
  await summary.click();
  await expect(page.getByText("Original reviewed proposal", { exact: true })).toBeVisible();
});

for (const role of ["OFFICER", "FIELD"]) {
  test(`read only history hides evidence mutations for current ${role}`, async ({ page }) => {
    await workspace(page, role, role === "FIELD" ? "IN_PROGRESS" : "CLOSED", [], true, (data) => {
      data.limitedHistory = false;
      data.files.push(
        { id: "source", original_name: "before.png", content_type: "image/png", size_bytes: 100 },
        {
          id: "copy",
          original_name: "public.png",
          content_type: "image/png",
          size_bytes: 100,
          public_copy_of: "source",
          public_approved: true,
        },
      );
    });
    await expect(page.getByText(/ไม่สามารถดำเนินการจากหน้านี้/)).toBeVisible();
    await page.locator("summary", { hasText: "ข้อมูลคำร้อง เอกสาร และรายงานทั้งหมด" }).click();
    await expect(page.locator(".evidence-upload")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "เผยแพร่สำเนา", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "หยุดเผยแพร่", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /ดาวน์โหลด$/ })).toHaveCount(2);
  });
}

test("community modal shows receiving department while a handoff is underway", async ({ page }) => {
  const item = {
    id: "public-transfer",
    category_name: "ถนนและทางเท้า",
    status: "TRIAGED",
    transfer_department_name: "กองสาธารณสุข",
    created_at: "2026-11-05T01:00:00Z",
    votes: 0,
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const payload: Record<string, unknown> = {
      "/api/auth/me": { id: "citizen", role: "CITIZEN", display_name: "ผู้ทดสอบ" },
      "/api/privacy": { acknowledged: true, version: "test" },
      "/api/catalog": { categories: [], departments: [] },
      "/api/municipal-center": { latitude: 13.75, longitude: 100.5 },
      "/api/community/complaints": { items: [item], top: [], total: 1, stats: {} },
      "/api/community/complaints/public-transfer": { complaint: item, media: [], history: [] },
    };
    await route.fulfill({ json: payload[path] ?? {} });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "รายละเอียดปัญหา", exact: true });
  await expect(dialog).toContainText("กำลังดำเนินการ · ส่งต่อให้หน่วยงาน กองสาธารณสุข รับช่วงต่อ");
});

test("returning a misassigned job leaves detail before its leader access is removed", async ({
  page,
}) => {
  await workspace(page, "LEADER", "TRIAGED", ["RETURN_ASSIGNMENT"]);
  let staleReads = 0;
  let submitted = false;
  await page.route("**/api/complaints/municipal-case", (route) => {
    staleReads++;
    return route.fulfill({ status: 403, json: { message: "ไม่มีสิทธิ์ดำเนินการ" } });
  });
  await page.route("**/api/complaints/municipal-case/actions", (route) => {
    submitted = true;
    return route.fulfill({
      json: { id: "municipal-case", status: "DEPARTMENT_RETURNED", version: 2 },
    });
  });
  await page.getByRole("button", { name: "ส่งคืนงานที่จ่ายผิด", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true })
    .fill("งานนี้เป็นงานกองสาธารณสุข");
  await dialog.getByRole("button", { name: "ยืนยันส่งคืนงานที่จ่ายผิด", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /เปิดงาน งานเทศบาลทดสอบ/ })).toBeVisible({
    timeout: 2000,
  });
  expect(submitted).toBe(true);
  expect(staleReads).toBe(0);
});

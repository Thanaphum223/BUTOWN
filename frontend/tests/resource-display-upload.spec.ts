import { test, expect, type Page } from "@playwright/test";

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
        original_name:
          /filename="([^"]+)"/.exec(route.request().postDataBuffer()?.toString() || "")?.[1] ||
          "document.jpg",
        content_type:
          /Content-Type: (image\/(?:jpeg|png)|application\/pdf)/i.exec(
            route.request().postDataBuffer()?.toString() || "",
          )?.[1] || "image/jpeg",
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

test("draft request shows the field necessity and requester before a proposal exists", async ({
  page,
}) => {
  await workspace(page, "LEADER", "RESOURCE_DRAFT", ["PROPOSE"], false, (data) => {
    Object.assign(data.resources[0], {
      necessity: "ต้องใช้เครื่องสูบน้ำสองเครื่อง",
      requester_name: "สมชาย ทีมภาคสนาม",
      created_at: "2026-11-08T01:00:00Z",
    });
  });
  const panel = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "คำขอทรัพยากรและเอกสารประกอบ" }) });
  await expect(panel).toContainText("ต้องใช้เครื่องสูบน้ำสองเครื่อง");
  await expect(panel).toContainText("สมชาย ทีมภาคสนาม");
  await expect(panel).toContainText("ร่างข้อเสนอ");
});

for (const [name, mimeType, header] of [
  ["camera.jpg", "image/jpeg", [255, 216, 255, 1]],
  ["scan.png", "image/png", [137, 80, 78, 71, 13, 10, 26, 10, 0]],
] as const) {
  test(`proposal accepts a small ${mimeType} document and offers camera capture`, async ({
    page,
  }) => {
    await workspace(page, "LEADER", "RESOURCE_DRAFT", ["PROPOSE"]);
    await page.getByRole("button", { name: "ส่งข้อเสนอทรัพยากร", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "ส่งข้อเสนอทรัพยากร", exact: true });
    await expect(dialog.locator('input[type=file][capture="environment"]')).toHaveCount(1);
    await dialog
      .locator("input[type=file]")
      .last()
      .setInputFiles({ name, mimeType, buffer: Buffer.from(header) });
    await expect(dialog.getByRole("status")).toContainText("แนบไฟล์แล้ว");
    await expect(dialog.getByRole("link", { name, exact: true })).toBeVisible();
  });
}

test("proposal distinguishes unsupported document type from a document above 15 MB", async ({
  page,
}) => {
  await workspace(page, "LEADER", "RESOURCE_DRAFT", ["PROPOSE"]);
  await page.getByRole("button", { name: "ส่งข้อเสนอทรัพยากร", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "ส่งข้อเสนอทรัพยากร", exact: true });
  const input = dialog.locator("input[type=file]").last();
  await input.setInputFiles({
    name: "movie.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("small"),
  });
  await expect(dialog.getByRole("alert")).toContainText("รองรับเอกสาร PDF หรือรูปภาพ PNG/JPEG");
  await expect(dialog.getByRole("alert")).not.toContainText("15 MB");
  await input.setInputFiles({
    name: "large.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(15_000_001, 1),
  });
  await expect(dialog.getByRole("alert")).toContainText("ไฟล์เอกสารแต่ละไฟล์ต้องไม่เกิน 15 MB");
});

test("submitted proposal retains the original field request necessity and requester", async ({
  page,
}) => {
  await workspace(page, "LEADER", "RESOURCE_DRAFT", ["PROPOSE"], false, (data) => {
    Object.assign(data.resources[0], {
      necessity: "ต้องใช้เครื่องสูบน้ำสองเครื่อง",
      requester_name: "สมชาย ทีมภาคสนาม",
      created_at: "2026-11-08T01:00:00Z",
      revisions: JSON.stringify([
        {
          id: "revision-1",
          revision: 1,
          proposal: "จัดซื้ออุปกรณ์สูบน้ำ",
          amount: 1000,
          duration_days: 2,
          created_at: "2026-11-08T02:00:00Z",
        },
      ]),
    });
  });
  const panel = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "คำขอทรัพยากรและเอกสารประกอบ" }) });
  await expect(panel).toContainText("จัดซื้ออุปกรณ์สูบน้ำ");
  await expect(panel).toContainText("ต้องใช้เครื่องสูบน้ำสองเครื่อง");
  await expect(panel).toContainText("สมชาย ทีมภาคสนาม");
});

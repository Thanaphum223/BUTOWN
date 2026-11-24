import { test, expect, type Page } from "@playwright/test";
import { createReport, signIn, signOut } from "./product-flow";

type D = Record<string, any>;
const caseId = "compliance-case";
const complaint = {
  id: caseId,
  reporter_id: "reporter",
  title: "งานตรวจข้อกำหนด",
  description: "รายละเอียดงาน",
  address: "จุดตรวจ",
  category_name: "ถนน",
  department_id: "engineering",
  version: 1,
  votes: 0,
  due_at: "2030-01-01T00:00:00Z",
  created_at: "2026-11-01T00:00:00Z",
  assignment_details: "{}",
  answers: "{}",
  form_schema: "[]",
};
const issue = {
  id: "issue-1",
  name: "ปูนซีเมนต์",
  unit: "ถุง",
  quantity: 2,
  complaint_id: caseId,
  created_at: "2026-11-01T00:00:00Z",
  actor_name: "ช่างเอ",
  leader_verified_at: null,
  keeper_verified_at: null,
  verify_as: "LEADER",
};

async function boundary(page: Page, role: string, status: string, extra: D = {}) {
  const posts: { path: string; body: any }[] = [];
  const reads: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") {
      posts.push({ path, body: route.request().postDataJSON() });
      return route.fulfill({ json: { id: "saved" } });
    }
    reads.push(path);
    const data: D = {
      "/api/auth/me": {
        id: "operator",
        display_name: "ผู้ทดสอบ",
        role,
        department_id: ["LEADER", "FIELD"].includes(role) ? "engineering" : null,
      },
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { version: "test", text: "", acknowledged: true },
      "/api/municipal-center": { latitude: 13.75, longitude: 100.5 },
      "/api/catalog": {
        categories: [],
        departments: [{ id: "engineering", name: "กองช่าง" }],
        queues: [],
      },
      "/api/complaints": {
        items: [{ ...complaint, status, can_open: true }],
        total: 1,
        stats: { total: 1, in_progress: 1, closed: 0, overdue: 0 },
      },
      ["/api/complaints/" + caseId]: {
        complaint: { ...complaint, status },
        actions: [],
        history: [],
        files: [],
        resources: [],
        reports: [],
        reviews: [],
        workOrders: [],
        approvals: [],
        transfers: [],
        approvalStages: 1,
      },
      [`/api/complaints/${caseId}/messages`]: [],
      [`/api/complaints/${caseId}/sla`]: {},
      ...extra,
    };
    return route.fulfill({ json: data[path] ?? { items: [], total: 0, stats: {} } });
  });
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  return { posts, reads };
}
async function openCase(page: Page, role: string) {
  await page
    .getByRole("button", {
      name: role === "APPROVER" ? "เปิดคิวงานอนุมัติ" : "เปิดคิวงาน",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: /เปิดงาน งานตรวจข้อกำหนด/ }).click();
}
const withActions = (status: string, ...actions: string[]) => ({
  ["/api/complaints/" + caseId]: {
    complaint: { ...complaint, status },
    actions: actions.map((action) => ({ action })),
    history: [],
    files: [],
    resources: [],
    reports: [],
    reviews: [],
    workOrders: [],
    approvals: [],
    transfers: [],
    approvalStages: 1,
  },
});
async function fits(page: Page) {
  // Naming the widest elements makes an overflow failure actionable.
  const wide = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= limit) return [];
    return [...document.querySelectorAll("body *")]
      .filter((node) => node.getBoundingClientRect().right > limit + 1)
      .map((node) => `${node.tagName}.${node.className} ${node.getBoundingClientRect().right}`)
      .slice(0, 20);
  });
  expect(wide).toEqual([]);
}

for (const role of ["CITIZEN", "LEADER"])
  test(`${role} can change the text size in three steps and it is remembered`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boundary(page, role, "TRIAGED");
    const larger = page.getByRole("button", { name: "ขยายขนาดตัวอักษร", exact: true });
    const smaller = page.getByRole("button", { name: "ย่อขนาดตัวอักษร", exact: true });
    const size = () =>
      page
        .locator(".header-identity strong")
        .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    await expect(smaller).toBeDisabled();
    const base = await size();
    await larger.click();
    expect(await size()).toBeCloseTo(base * 1.125, 1);
    await larger.click();
    expect(await size()).toBeCloseTo(base * 1.25, 1);
    await expect(larger).toBeDisabled();
    await fits(page);
    await page.reload();
    await expect(larger).toBeDisabled();
    expect(await size()).toBeCloseTo(base * 1.25, 1);
    await page.locator('.language-switcher button[lang="en"]').click();
    await expect(page.getByRole("button", { name: "Reduce text size", exact: true })).toBeVisible();
    await fits(page);
  });

test("stock page shows type, reservation, confirmation and CSV export on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { posts } = await boundary(page, "OFFICER", "TRIAGED", {
    "/api/stock": {
      keeper: true,
      canVerify: true,
      items: [
        {
          id: "drill",
          name: "สว่าน",
          unit: "ตัว",
          item_type: "EQUIPMENT",
          active: true,
          on_hand: 10,
          reserved: 3,
          available: 7,
          in_use: 2,
        },
      ],
    },
    "/api/stock/pending-verifications": [{ ...issue, verify_as: "KEEPER" }],
  });
  await page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
  await page.locator(".ant-drawer").getByRole("menuitem", { name: "คลังวัสดุ" }).click();
  const row = page.locator(".inventory-page tbody tr").filter({ hasText: "สว่าน" });
  await expect(row).toContainText("ครุภัณฑ์");
  const cells = row.locator("td");
  for (const [index, value] of ["10 ตัว", "3 ตัว", "7 ตัว", "2 ตัว", "12 ตัว"].entries())
    await expect(cells.nth(index + 1)).toHaveText(value);
  await expect(page.getByRole("link", { name: "ส่งออกรายงานคลัง (CSV)" })).toHaveAttribute(
    "href",
    "/api/stock/export.csv",
  );
  await fits(page);
  const pending = page.locator(".stock-verifications");
  await expect(pending).toContainText("รอหัวหน้ารับรอง");
  await expect(pending).toContainText("รอผู้ดูแลคลังรับรอง");
  await pending.getByRole("button", { name: "รับรองการเบิกหน้างาน" }).click();
  const dialog = page.getByRole("dialog", { name: "รับรองการเบิกหน้างาน" });
  await dialog.getByLabel("หมายเหตุ (ไม่บังคับ)").fill("ตรวจแล้ว");
  await dialog.getByRole("button", { name: "ยืนยัน" }).click();
  await expect
    .poll(() => posts.find((p) => p.path === "/api/stock/movements/issue-1/verify")?.body)
    .toEqual({ note: "ตรวจแล้ว" });
  await page.getByRole("button", { name: "เพิ่มวัสดุใหม่" }).click();
  const create = page.getByRole("dialog", { name: "เพิ่มวัสดุใหม่" });
  await create.getByText("ครุภัณฑ์", { exact: true }).click();
  await create.getByLabel("ชื่อวัสดุ", { exact: true }).fill("เลื่อย");
  await create.getByLabel("หน่วย", { exact: true }).fill("ตัว");
  await create.getByRole("button", { name: "บันทึก" }).click();
  await expect
    .poll(() => posts.find((p) => p.path === "/api/stock")?.body)
    .toMatchObject({ itemType: "EQUIPMENT", name: "เลื่อย" });
});

test("leader confirms an on-site issue from the case", async ({ page }) => {
  const { posts } = await boundary(page, "LEADER", "LEADER_REVIEW", {
    ["/api/stock/complaints/" + caseId]: [
      {
        stock_item_id: "cement",
        work_order_id: "w",
        name: "ปูนซีเมนต์",
        unit: "ถุง",
        issued: 2,
        returned: 0,
        used: 2,
      },
    ],
    [`/api/stock/complaints/${caseId}/verifications`]: [issue],
  });
  await openCase(page, "LEADER");
  await page.getByText("ข้อมูลคำร้อง เอกสาร และรายงานทั้งหมด").click();
  await page.getByRole("button", { name: "รับรองการเบิกหน้างาน" }).click();
  await page
    .getByRole("dialog", { name: "รับรองการเบิกหน้างาน" })
    .getByRole("button", { name: "ยืนยัน" })
    .click();
  await expect
    .poll(() => posts.some((p) => p.path === "/api/stock/movements/issue-1/verify"))
    .toBe(true);
});

test("reporting preselects the full return of equipment with a warning", async ({ page }) => {
  const line = { work_order_id: "w", unit: "ตัว", issued: 2, returned: 0, used: 2 };
  const extra = withActions("IN_PROGRESS", "REPORT") as D;
  extra["/api/complaints/" + caseId].workOrders = [
    { id: "w", status: "IN_PROGRESS", handed_off: false },
  ];
  await boundary(page, "FIELD", "IN_PROGRESS", {
    ...extra,
    ["/api/stock/complaints/" + caseId]: [
      { ...line, stock_item_id: "drill", name: "สว่าน", item_type: "EQUIPMENT" },
      { ...line, stock_item_id: "sand", name: "ทราย", item_type: "CONSUMABLE" },
    ],
  });
  await openCase(page, "FIELD");
  await page.getByRole("button", { name: "ส่งรายงานผล", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/รายการครุภัณฑ์ต้องนำส่งคืนคลังให้ครบ/)).toBeVisible();
  await expect(dialog.getByRole("spinbutton", { name: "จำนวนที่คืน สว่าน" })).toHaveValue("2.00");
  await expect(dialog.getByRole("spinbutton", { name: "จำนวนที่คืน ทราย" })).toHaveValue("0.00");
});

const sla = (values: D) => ({
  [`/api/complaints/${caseId}/sla`]: {
    due_at: complaint.due_at,
    progress_due_at: complaint.due_at,
    progress_days: 15,
    open: true,
    maxExtensions: 2,
    remainingExtensions: 2,
    extensions: [],
    ...values,
  },
});
test("leader asks for 3, 5, 7 or 15 days until both requests are used", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { posts } = await boundary(
    page,
    "LEADER",
    "TRIAGED",
    sla({ canRequest: true, remainingExtensions: 1 }),
  );
  await openCase(page, "LEADER");
  const panel = page.locator(".sla-panel");
  await expect(panel).toContainText("ขอขยายเวลาไปแล้ว 1/2 ครั้ง");
  await fits(page);
  await panel.getByRole("button", { name: "ขอขยายเวลา" }).click();
  const dialog = page.getByRole("dialog", { name: "ขอขยายระยะเวลาดำเนินการ" });
  await expect(dialog.locator(".symptom-options").first().locator(".ant-tag")).toHaveText([
    "3 วัน",
    "5 วัน",
    "7 วัน",
    "15 วัน",
  ]);
  await expect(dialog).toContainText("ผู้อนุมัติจะพิจารณา");
  await dialog.getByText("5 วัน", { exact: true }).click();
  await dialog.getByText("รอวัสดุหรืองบประมาณ", { exact: true }).click();
  await dialog.getByRole("button", { name: "ยืนยัน" }).click();
  await expect
    .poll(() => posts.find((p) => p.path.endsWith("/sla-extensions"))?.body)
    .toEqual({ days: 5, reason: "รอวัสดุหรืองบประมาณ" });
});
test("no further extension can be requested after two", async ({ page }) => {
  await boundary(page, "LEADER", "TRIAGED", sla({ canRequest: true, remainingExtensions: 0 }));
  await openCase(page, "LEADER");
  await expect(page.locator(".sla-panel")).toContainText("ขอขยายเวลาไปแล้ว 2/2 ครั้ง");
  await expect(page.getByRole("button", { name: "ขอขยายเวลา", exact: true })).toHaveCount(0);
});
test("approver decides a pending extension", async ({ page }) => {
  const pending = {
    id: "ext",
    status: "PENDING",
    days: 5,
    reason: "รอวัสดุ",
    requested_by_name: "หัวหน้า",
    previous_due_at: complaint.due_at,
    requested_due_at: complaint.due_at,
  };
  const { posts } = await boundary(
    page,
    "APPROVER",
    "TRIAGED",
    sla({ canDecide: true, remainingExtensions: 1, extensions: [pending] }),
  );
  await openCase(page, "APPROVER");
  await page.locator(".sla-panel").getByRole("button", { name: "อนุมัติ", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "อนุมัติการขยายเวลา" });
  await dialog.getByText("เหตุผลเพียงพอ", { exact: true }).click();
  await dialog.getByRole("button", { name: "ยืนยัน" }).click();
  await expect
    .poll(() => posts.find((p) => p.path.endsWith("/ext/decision"))?.body)
    .toEqual({ approve: true, reason: "เหตุผลเพียงพอ" });
});

for (const [role, status, action, preset] of [
  ["OFFICER", "NEW", "REJECT", "ไม่อยู่ในอำนาจหน้าที่ของเทศบาล"],
  ["FIELD", "ASSIGNED", "DECLINE", "งานเกินขีดความสามารถของทีม"],
  ["LEADER", "LEADER_REVIEW", "RETURN_FIELD", "สรุปผลการปฏิบัติงานไม่ครบถ้วน"],
  ["OFFICER", "OFFICER_REVIEW", "RETURN_LEADER", "รายละเอียดสรุปผลไม่ครบถ้วน"],
  ["OFFICER", "RESOURCE_CHECK", "RETURN_RESOURCE", "ข้อมูลความจำเป็นไม่เพียงพอ"],
  ["OFFICER", "RESOLVED", "CLOSE", "แจ้งผลการดำเนินการและหลักฐานให้ประชาชนทราบแล้ว"],
  ["APPROVER", "RESOURCE_APPROVAL", "APPROVE", "เป็นไปตามระเบียบพัสดุฯ พ.ศ. 2560"],
])
  test(`${action} can be submitted with a preset reason only`, async ({ page }) => {
    const { posts } = await boundary(page, role, status, withActions(status, action));
    await openCase(page, role);
    await page.locator(".split-action-dock").getByRole("button").first().click();
    const dialog = page
      .locator(".workflow-modal[role=dialog], .workflow-modal [role=dialog]")
      .first();
    await dialog.getByText(preset, { exact: true }).click();
    await dialog.locator("button[type=submit]").click();
    const confirm = page.locator(".ant-modal-confirm").getByRole("button", { name: "ยืนยัน" });
    if (["REJECT", "CLOSE", "APPROVE"].includes(action)) await confirm.click();
    await expect
      .poll(() => posts.find((p) => p.path.endsWith("/actions"))?.body)
      .toMatchObject({ action, reason: preset });
  });

test("approvers show their position and are preselected when there is no history", async ({
  page,
}) => {
  await boundary(page, "OFFICER", "RESOURCE_CHECK", {
    ...withActions("RESOURCE_CHECK", "SEND_APPROVAL"),
    "/api/people": [
      { id: "a", display_name: "นายสมชาย ใจดี", gov_role: "MUNICIPAL_CLERK" },
      { id: "b", display_name: "นายอื่น", gov_role: null },
    ],
  });
  await openCase(page, "OFFICER");
  await page.locator(".split-action-dock").getByRole("button").first().click();
  const dialog = page
    .locator(".workflow-modal[role=dialog], .workflow-modal [role=dialog]")
    .first();
  await expect(dialog.locator(".ant-select-selection-item")).toHaveText([
    "นายสมชาย ใจดี — ปลัดเทศบาล",
  ]);
  await expect(dialog).toContainText("เปลี่ยนเป็นผู้อนุมัติคนอื่นได้เสมอ");
});

for (const [role, existing, owner, blocked] of [
  ["FIELD", 299_999_990, "reporter", ""],
  ["FIELD", 299_999_990, "other-staff", "เกินเพดาน 300 MB"],
  ["CITIZEN", 299_999_990, "operator", "เกินเพดาน 300 MB"],
] as const)
  test(`${role} upload beside ${owner} files of ${existing} bytes: ${blocked || "allowed"}`, async ({
    page,
  }) => {
    const status = role === "FIELD" ? "IN_PROGRESS" : "NEW";
    const extra = withActions(status, ...(role === "FIELD" ? ["REPORT"] : [])) as D;
    extra["/api/complaints/" + caseId].files = [
      {
        id: "citizen-video",
        original_name: "report.mp4",
        content_type: "video/mp4",
        size_bytes: existing,
        uploaded_by: owner,
      },
    ];
    extra["/api/citizen/tracking"] = { items: [{ ...complaint, status }], total: 1 };
    await boundary(page, role, status, extra);
    let uploads = 0;
    await page.route(`**/api/complaints/${caseId}/files`, (route) => {
      uploads++;
      return route.fulfill({ json: { id: "saved" } });
    });
    const file = { name: "after.png", mimeType: "image/png", buffer: Buffer.alloc(20, 1) };
    if (role === "FIELD") {
      await openCase(page, role);
      await page.getByRole("button", { name: "ส่งรายงานผล", exact: true }).click();
      await page
        .getByRole("dialog")
        .locator(".field-evidence-steps section")
        .nth(1)
        .locator("input[type=file]")
        .first()
        .setInputFiles(file);
    } else {
      await page.getByRole("link", { name: /ติดตามสถานะ/ }).click();
      await page.getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
      await page.locator(".evidence-upload input[type=file]").first().setInputFiles(file);
    }
    if (blocked) {
      await expect(page.getByText(blocked).first()).toBeVisible();
      expect(uploads).toBe(0);
    } else await expect.poll(() => uploads).toBe(1);
  });

test("the finance director cannot be the final approver above 500,000 baht", async ({ page }) => {
  const extra = withActions("RESOURCE_CHECK", "SEND_APPROVAL") as D;
  const detail = extra["/api/complaints/" + caseId];
  detail.resources = [
    {
      id: "r",
      status: "CHECK",
      requested_items: "[]",
      revisions: JSON.stringify([{ revision: 1, amount: 50_000_000.01, line_items: [] }]),
    },
  ];
  const { posts } = await boundary(page, "OFFICER", "RESOURCE_CHECK", {
    ...extra,
    "/api/people": [
      { id: "a", display_name: "สมชาย ใจดี", gov_role: "FINANCE_DIRECTOR" },
      { id: "b", display_name: "สมหญิง ใจดี", gov_role: "MAYOR" },
    ],
  });
  await openCase(page, "OFFICER");
  await page.locator(".split-action-dock").getByRole("button").first().click();
  const dialog = page
    .locator(".workflow-modal[role=dialog], .workflow-modal [role=dialog]")
    .first();
  const chosen = dialog.locator(".ant-select-selection-item");
  await expect(chosen).toHaveText(["สมชาย ใจดี — ผู้อำนวยการกองคลัง (อนุมัติได้ ≤ 500,000 บาท)"]);
  await expect(dialog.getByText(/^วงเงินเกิน 500,000 บาท/)).toBeVisible();
  await expect(dialog.getByText(/ข้อ 86–87/)).toBeVisible();
  const submit = dialog.locator("button[type=submit]");
  await expect(submit).toBeDisabled();
  await chosen.locator(".ant-select-selection-item-remove").click();
  await dialog.locator(".ant-select-selector").click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("สมหญิง ใจดี — นายกเทศมนตรี", { exact: true })
    .click();
  await expect(dialog.getByText(/^วงเงินเกิน 500,000 บาท/)).toHaveCount(0);
  await expect(submit).toBeEnabled();
  await dialog.locator("textarea").click();
  await submit.click();
  await expect
    .poll(() => posts.find((p) => p.path.endsWith("/actions"))?.body)
    .toMatchObject({ action: "SEND_APPROVAL", approverIds: ["b"] });
});

test("administrators see and assign official positions", async ({ page }) => {
  const { posts } = await boundary(page, "ADMIN", "NEW", {
    "/api/admin": {
      currentUserId: "operator",
      municipality: { name: "เทศบาลทดสอบ" },
      users: [
        {
          id: "a",
          username: "approver",
          display_name: "สมชาย",
          role: "APPROVER",
          gov_role: "FINANCE_DIRECTOR",
          enabled: true,
        },
      ],
      departments: [],
      categories: [],
      workflows: [],
    },
  });
  await page.getByRole("menuitem", { name: /จัดการระบบ/ }).click();
  const row = page.locator("tbody tr").filter({ hasText: "สมชาย" });
  if (!(await row.isVisible())) await page.getByRole("tab", { name: /บัญชี/ }).click();
  await expect(row).toContainText("ผู้อำนวยการกองคลัง");
  await row.getByRole("button", { name: "กำหนดบทบาท" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ตำแหน่งราชการในเทศบาล (ไม่บังคับ)").fill("");
  const options = page.locator(".ant-select-dropdown:visible");
  await expect(options).toContainText("หัวหน้าเจ้าหน้าที่พัสดุ (อนุมัติได้ ≤ 500,000 บาท)");
  await options.getByText("นายกเทศมนตรี", { exact: true }).click();
  await dialog.locator("button[type=submit]").click();
  await expect
    .poll(() => posts.find((p) => p.path === "/api/admin/users/a/role")?.body)
    .toEqual({ role: "APPROVER", departmentId: null, govRole: "MAYOR" });
});

test("the header and menu show the account's official position", async ({ page }) => {
  await boundary(page, "APPROVER", "RESOURCE_APPROVAL", {
    "/api/auth/me": {
      id: "operator",
      display_name: "ผู้ทดสอบ",
      role: "APPROVER",
      gov_role: "MAYOR",
    },
  });
  await expect(page.locator(".topbar small")).toHaveText(
    "งานบริการประชาชน · นายกเทศมนตรี (ผู้อนุมัติ)",
  );
  await expect(page.locator(".sidebar-bottom")).toContainText("นายกเทศมนตรี (ผู้อนุมัติ)");
});

test("closed conversations are read-only on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boundary(page, "OFFICER", "CLOSED", {
    [`/api/complaints/${caseId}/messages`]: [
      {
        id: "m",
        sender_role: "CITIZEN",
        sender_name: "ผู้แจ้ง",
        body: "ข้อความยาว".repeat(60),
        created_at: complaint.created_at,
        mine: false,
      },
    ],
  });
  await openCase(page, "OFFICER");
  const chat = page.locator(".complaint-chat");
  await expect(chat).toContainText("ข้อความยาว");
  await expect(chat.getByRole("button", { name: "ส่งข้อความ" })).toHaveCount(0);
  await expect(chat.locator(".ant-tag-checkable")).toHaveCount(0);
  await fits(page);
});

test("followers viewing the public page never load the conversation", async ({ page }) => {
  const item = { ...complaint, status: "IN_PROGRESS", followed: true, voted: false };
  const { reads } = await boundary(page, "CITIZEN", "IN_PROGRESS", {
    "/api/community/complaints": { items: [], total: 0, top: [], statistics: {} },
    "/api/citizen/tracking": { items: [item], total: 1 },
    ["/api/community/complaints/" + caseId]: {
      complaint: item,
      history: [],
      media: [],
      files: [],
      actions: [],
    },
  });
  await page.getByRole("link", { name: /ติดตามสถานะ/ }).click();
  await page.getByRole("tab", { name: "เรื่องที่ติดตาม" }).click();
  await page.getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
  await expect.poll(() => reads).toContain("/api/community/complaints/" + caseId);
  await expect(page.locator(".complaint-chat")).toHaveCount(0);
  expect(reads).not.toContain(`/api/complaints/${caseId}/messages`);
});

test("officer asks with a preset and the reporter answers on the real server", async ({ page }) => {
  test.setTimeout(120000);
  const title = `ทดสอบแชต ${Date.now()}`;
  const question = "ขอทราบช่วงเวลาที่พบปัญหาบ่อยที่สุด";
  await signIn(page, "citizen");
  const id = await createReport(page, title, "รายละเอียด", "จุดทดสอบแชต");
  await signOut(page);
  await signIn(page, "officer");
  await page.getByRole("button", { name: "เปิดคิวงาน", exact: true }).click();
  await page.getByRole("searchbox", { name: "ค้นหาเลขเรื่อง / หัวข้อ" }).fill(title);
  await page.getByRole("button", { name: new RegExp("เปิดงาน " + title) }).click();
  const chat = page.locator(".complaint-chat");
  await chat.getByText(question, { exact: true }).click();
  await chat.getByRole("button", { name: "ส่งข้อความ" }).click();
  await expect(chat.locator(".chat-message.is-mine")).toContainText(question);
  await signOut(page);
  await signIn(page, "citizen");
  const messages = await (await page.request.get(`/api/complaints/${id}/messages`)).json();
  expect(messages[0]).toMatchObject({ body: question, sender_name: "เจ้าหน้าที่รับเรื่อง" });
  await page.getByRole("link", { name: /ติดตามสถานะ/ }).click();
  await page
    .locator(".tracking-card")
    .filter({ hasText: "#" + id.slice(0, 8).toUpperCase() })
    .getByRole("button", { name: "ดูรายละเอียด", exact: true })
    .click();
  await chat.getByLabel("พิมพ์ข้อความ").fill("ช่วงเย็น");
  await chat.getByRole("button", { name: "ส่งข้อความ" }).click();
  await expect(chat.locator(".chat-message.is-mine")).toContainText("ช่วงเย็น");
});

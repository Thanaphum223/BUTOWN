import { test, expect, type Page } from "@playwright/test";

async function openCase(page: Page, role: string) {
  const complaint = {
    id: "staff-cleanup-case",
    title: "งานตรวจระบบ",
    description: "รายละเอียดงาน",
    address: "จุดตรวจ",
    category_name: "ถนน",
    department_id: "engineering",
    status: role === "OFFICER" ? "NEW" : role === "LEADER" ? "TRIAGED" : "IN_PROGRESS",
    version: 1,
    votes: 0,
    due_at: "2020-01-01T00:00:00Z",
    created_at: "2026-11-01T00:00:00Z",
    assignment_details: JSON.stringify({
      appointment: "2026-11-10",
      urgency: "NORMAL",
      workScope: "ซ่อมถนน",
    }),
    answers: "{}",
    form_schema: "[]",
  };
  const actions =
    role === "OFFICER"
      ? ["TRIAGE"]
      : role === "LEADER"
        ? ["ASSIGN"]
        : role === "FIELD"
          ? ["REPORT"]
          : [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const data: Record<string, unknown> = {
      "/api/auth/me": {
        id: "operator",
        display_name: "ผู้ทดสอบ",
        role,
        department_id: ["LEADER", "FIELD"].includes(role) ? "engineering" : null,
      },
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { version: "test", text: "", acknowledged: true },
      "/api/catalog": {
        categories: [],
        departments: [{ id: "engineering", name: "กองช่าง" }],
        queues: [],
      },
      "/api/complaints": {
        items: [complaint],
        total: 1,
        stats: { total: 1, in_progress: 1, closed: 0, overdue: 1 },
      },
      "/api/complaints/staff-cleanup-case": {
        complaint,
        actions: actions.map((action) => ({ action })),
        history: [],
        files: [],
        resources: [],
        reports: [],
        reviews: [],
        workOrders: [],
        approvals: [],
        transfers: [],
      },
      "/api/teams": [],
      "/api/people": [],
    };
    return route.fulfill({ json: data[path] ?? { items: [], total: 0, stats: {} } });
  });
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  await page
    .getByRole("button", {
      name: role === "APPROVER" ? "เปิดคิวงานอนุมัติ" : "เปิดคิวงาน",
      exact: true,
    })
    .click();
  await expect(page.getByText(/เกินกำหนด|กำหนดเสร็จ|วันนัดหมาย/)).toHaveCount(0);
  await page.getByRole("button", { name: /เปิดงาน งานตรวจระบบ/ }).click();
}
for (const role of ["OFFICER", "LEADER", "FIELD", "APPROVER"]) {
  test(`${role} has no scheduling or overdue fields in queue detail and assignment`, async ({
    page,
  }) => {
    await openCase(page, role);
    await expect(page.getByText(/เกินกำหนด|กำหนดเสร็จ|วันนัดหมาย/)).toHaveCount(0);
    if (role === "OFFICER" || role === "LEADER") {
      await page
        .getByRole("button", {
          name: role === "OFFICER" ? "รับเรื่องและส่งหน่วยงาน" : "มอบหมายทีม",
          exact: true,
        })
        .click();
      await expect(page.getByRole("dialog").getByLabel(/วันนัดหมาย/)).toHaveCount(0);
    }
  });
}
for (const width of [390, 768, 1280]) {
  test(`progress is always visible with full labels at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openCase(page, "FIELD");
    const progress = page.locator(".workflow-progress");
    await expect(progress).toBeVisible();
    await expect(page.locator("details").filter({ has: progress })).toHaveCount(0);
    for (const title of [
      "รับคำร้อง",
      "จัดหน่วยงาน",
      "มอบหมายทีม",
      "ลงพื้นที่",
      "ตรวจผลงาน",
      "ปิดเรื่อง",
    ]) {
      await expect(progress.getByText(title, { exact: true })).toBeVisible();
    }
    const fits = await progress.locator(".ant-steps-item-title").evaluateAll((elements) =>
      elements.every((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          element.scrollWidth <= element.clientWidth + 1 &&
          rect.left >= 0 &&
          rect.right <= window.innerWidth &&
          style.textOverflow !== "ellipsis"
        );
      }),
    );
    expect(fits).toBe(true);
  });
}
test("supplementary report attachments are a visible third evidence section", async ({ page }) => {
  await openCase(page, "FIELD");
  await page.getByRole("button", { name: "ส่งรายงานผล", exact: true }).click();
  const evidence = page.getByRole("dialog").locator(".field-evidence-steps");
  await expect(evidence.locator(":scope > section")).toHaveCount(3);
  const supplementary = evidence.locator(":scope > section").nth(2);
  await expect(
    supplementary.getByRole("heading", { name: /วิดีโอหรือเอกสารประกอบเพิ่มเติม/ }),
  ).toBeVisible();
  await expect(supplementary.locator("summary")).toHaveCount(0);
  await expect(supplementary.locator('input[type="file"]')).toHaveAttribute("accept", /\.pdf/);
  await expect(supplementary.locator('input[type="file"]')).toHaveAttribute("accept", /\.mp4/);
});

import { test, expect, type Page } from "@playwright/test";

const complaint = "55555555-5555-4555-8555-555555555555";

async function notifications(page: Page, role: string) {
  const rows = [
    {
      id: "n-1",
      complaint_id: complaint,
      message: "แจ้งเตือนแรก",
      created_at: "2026-11-20T02:00:00Z",
    },
    {
      id: "n-2",
      complaint_id: complaint,
      message: "แจ้งเตือนสอง",
      created_at: "2026-11-20T01:00:00Z",
    },
  ].map((row) => ({ ...row, read_at: null as string | null }));
  const writes: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${path}`);
      const id = path.split("/")[3];
      if (path === "/api/notifications/read") rows.forEach((r) => (r.read_at = "now"));
      else if (path.endsWith("/read")) rows.find((r) => r.id === id)!.read_at = "now";
      else if (request.method() === "DELETE")
        rows.splice(
          rows.findIndex((r) => r.id === id),
          1,
        );
      return route.fulfill({ status: 200, body: "" });
    }
    const data: Record<string, unknown> = {
      "/api/auth/me": { id: "user", display_name: "ผู้ทดสอบ", role },
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/catalog": { categories: [], departments: [] },
      "/api/municipal-center": { latitude: 13.75, longitude: 100.5 },
      "/api/community/complaints": { items: [], top: [], total: 0, stats: {} },
      "/api/complaints": { items: [], total: 0, stats: {} },
      "/api/notifications": rows,
    };
    return route.fulfill({ json: data[path] ?? [] });
  });
  await page.goto("/");
  await page
    .getByRole(role === "CITIZEN" ? "link" : "menuitem", { name: /แจ้งเตือน/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "การแจ้งเตือน", exact: true })).toBeVisible();
  return { rows, writes };
}

for (const role of ["CITIZEN", "OFFICER"]) {
  test(`${role} notifications mark read on view, confirm mark-all and delete`, async ({ page }) => {
    const { writes } = await notifications(page, role);
    const items = page.locator(".notification-item");
    await expect(items).toHaveCount(2);
    await expect(items.locator(".ant-badge-dot")).toHaveCount(2);

    await items.first().getByRole("button", { name: "ดูคำร้อง", exact: true }).click();
    await expect.poll(() => writes).toContain("POST /api/notifications/n-1/read");
    await page.goto("/");
    await page
      .getByRole(role === "CITIZEN" ? "link" : "menuitem", { name: /แจ้งเตือน/ })
      .first()
      .click();
    await expect(items.locator(".ant-badge-dot")).toHaveCount(1);

    await page.getByRole("button", { name: "อ่านทั้งหมดแล้ว", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("ต้องการทำเครื่องหมายว่าอ่านทั้งหมดแล้วใช่หรือไม่?");
    await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click();
    expect(writes).not.toContain("POST /api/notifications/read");
    await page.getByRole("button", { name: "อ่านทั้งหมดแล้ว", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "ยืนยัน", exact: true }).click();
    await expect(items.locator(".ant-badge-dot")).toHaveCount(0);

    await items.first().getByRole("button", { name: "ลบการแจ้งเตือน", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("ต้องการลบการแจ้งเตือนนี้ใช่หรือไม่?");
    await page.getByRole("dialog").getByRole("button", { name: "ยืนยัน", exact: true }).click();
    await expect(items).toHaveCount(1);
    expect(writes).toContain("DELETE /api/notifications/n-1");
  });
}

for (const own of [true, false]) {
  test(`citizen notification opens the ${own ? "own" : "followed"} case like tracking`, async ({
    page,
  }) => {
    const { rows } = await notifications(page, "CITIZEN");
    rows.forEach((row) => Object.assign(row, { own }));
    await page.reload();
    await page
      .getByRole("link", { name: /แจ้งเตือน/ })
      .first()
      .click();
    const path = own ? `/api/complaints/${complaint}` : `/api/community/complaints/${complaint}`;
    await page.route(`**${path}`, (route) =>
      route.fulfill({
        json: {
          complaint: {
            id: complaint,
            category_name: "ไฟฟ้าสาธารณะ",
            title: "ไฟฟ้าสาธารณะ",
            status: "TRIAGED",
            created_at: "2026-11-20T01:00:00Z",
            updated_at: "2026-11-20T01:00:00Z",
            latitude: 13.75,
            longitude: 100.5,
            version: 1,
          },
          media: [],
          history: [],
          files: [],
          actions: [],
        },
      }),
    );
    await page.route(`**${path}/sla`, (route) =>
      route.fulfill({ json: { open: true, extensions: [], progress_days: 15 } }),
    );
    const request = page.waitForRequest((r) => new URL(r.url()).pathname === path);
    await page.getByRole("button", { name: "ดูคำร้อง", exact: true }).first().click();
    await request;
    await expect(page.locator(".citizen-case-detail")).toContainText("ไฟฟ้าสาธารณะ");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

for (const role of ["OFFICER", "LEADER", "FIELD", "APPROVER", "ADMIN"])
  for (const status of ["TRIAGED", "CLOSED"]) {
    test(`${role} notification opens a ${status} case in the workspace`, async ({ page }) => {
      const { rows } = await notifications(page, role);
      rows.forEach((row) => Object.assign(row, { status }));
      await page.route("**/api/complaints?*", (route) =>
        route.fulfill({ json: { items: [], total: 0, stats: {} } }),
      );
      await page.route(`**/api/complaints/${complaint}*`, (route) =>
        route.fulfill({
          json: {
            complaint: {
              id: complaint,
              title: "ไฟฟ้าสาธารณะ",
              status,
              latitude: 13.75,
              longitude: 100.5,
              version: 1,
            },
            media: [],
            history: [],
            files: [],
            actions: [],
            reports: [],
            resources: [],
            workOrders: [],
          },
        }),
      );
      await page.route(`**/api/complaints/${complaint}/sla`, (route) =>
        route.fulfill({ json: { open: status === "TRIAGED", extensions: [] } }),
      );
      await page.reload();
      await page
        .getByRole("menuitem", { name: /แจ้งเตือน/ })
        .first()
        .click();
      await page.getByRole("button", { name: "ดูคำร้อง", exact: true }).first().click();
      const workspace = page.locator(".staff-workspace.viewing-work");
      await expect(workspace.locator(".workspace-detail")).toContainText("ไฟฟ้าสาธารณะ");
      await page.getByRole("button", { name: /กลับคิวงาน/ }).click();
      await expect(page.locator(".viewing-work")).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name: status === "CLOSED" ? "ประวัติงาน" : /^(รายการคำร้อง|งานลงพื้นที่ของฉัน)$/,
          level: 2,
        }),
      ).toBeVisible();
    });
  }

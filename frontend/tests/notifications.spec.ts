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

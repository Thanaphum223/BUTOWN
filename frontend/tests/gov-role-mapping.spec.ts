import { expect, test } from "@playwright/test";

for (const width of [440, 1280]) {
  test(`Gov role mappings can change codes and departments without editing existing accounts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: any[] = [];
    let fail = false;
    let settings = {
      municipalityId: "gov-town",
      serviceId: "",
      mappings: [
        { govRole: "OFFICER", role: "OFFICER", departmentId: null },
        { govRole: "FIELD", role: "FIELD", departmentId: null },
      ],
    };
    const departments = [{ id: "engineering", name: "กองช่าง" }];
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (req.method() !== "GET") {
        writes.push({ path, body: req.postDataJSON() });
        expect(path).toBe("/api/admin/gov-roles");
        expect(req.headers()["x-csrf-token"]).toBe("mapping-csrf");
        if (fail)
          return route.fulfill({ status: 503, json: { message: "บันทึกไม่สำเร็จ ลองอีกครั้ง" } });
        settings = req.postDataJSON();
        return route.fulfill({ json: {} });
      }
      const payload: Record<string, unknown> = {
        "/api/auth/me": {
          id: "admin",
          username: "admin",
          display_name: "ผู้ดูแล",
          role: "ADMIN",
          department_id: null,
        },
        "/api/auth/csrf": { token: "mapping-csrf", headerName: "X-CSRF-TOKEN" },
        "/api/privacy": { version: "test", acknowledged: true },
        "/api/catalog": { departments, categories: [] },
        "/api/complaints": { items: [], total: 0, stats: {} },
        "/api/admin": {
          currentUserId: "admin",
          municipality: { name: "เทศบาลทดสอบ" },
          users: [],
          departments,
          categories: [],
          workflows: [],
        },
        "/api/admin/gov-roles": settings,
      };
      return route.fulfill({ json: payload[path] ?? {} });
    });
    await page.goto("/");
    if (width < 1024) await page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
    await page.getByRole("menuitem", { name: /จัดการระบบ/ }).click();
    await page.getByRole("tab", { name: "บทบาท Gov Center", exact: true }).click();
    await expect(page.getByText("ใช้กับบัญชีใหม่เท่านั้น", { exact: false })).toBeVisible();
    await page.getByRole("textbox", { name: "รหัสบทบาท Gov 1", exact: true }).fill("INSPECTOR_V2");
    await page.getByRole("button", { name: "ยกเลิกการแก้ไข", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "รหัสบทบาท Gov 1", exact: true })).toHaveValue(
      "OFFICER",
    );
    expect(writes).toHaveLength(0);
    await page.getByRole("textbox", { name: "รหัสบทบาท Gov 1", exact: true }).fill("INSPECTOR_V2");
    await page.getByRole("combobox", { name: "กองสำหรับบทบาท Gov 2", exact: true }).click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("กองช่าง", { exact: true })
      .click();
    fail = true;
    // The exiting loading icon can remain in the accessible name after the button is enabled.
    const saveButton = page.getByRole("button", { name: /บันทึกการจับคู่บทบาท$/ });
    await saveButton.click();
    await expect(page.getByText("บันทึกไม่สำเร็จ ลองอีกครั้ง", { exact: true })).toBeVisible();
    fail = false;
    await saveButton.click();
    await expect(page.getByText("บันทึกการจับคู่บทบาทแล้ว", { exact: true })).toBeVisible();
    expect(writes).toHaveLength(2);
    expect(writes[1].body.mappings).toEqual([
      { govRole: "INSPECTOR_V2", role: "OFFICER", departmentId: null },
      { govRole: "FIELD", role: "FIELD", departmentId: "engineering" },
    ]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

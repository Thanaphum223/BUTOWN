import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page, role = "FIELD") {
  const writes: { path: string; body: unknown }[] = [];
  const departments = [{ id: "dept-original", name: "บันทึก" }];
  const users = [
    { id: "admin", username: "admin", display_name: "ชื่อ", role: "ADMIN", enabled: true },
    {
      id: "person-original",
      username: "original",
      display_name: "บันทึก",
      role,
      department_id: "dept-original",
      enabled: true,
    },
  ];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push({ path, body: request.postDataJSON() });
      return route.fulfill({ json: {} });
    }
    const payload: Record<string, unknown> = {
      "/api/auth/me": users[0],
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { acknowledged: true },
      "/api/catalog": { categories: [], departments },
      "/api/complaints": { items: [], total: 0, stats: {} },
      "/api/admin": {
        currentUserId: "admin",
        municipality: { name: "จัดการระบบ" },
        users,
        departments,
        categories: [
          {
            id: "category-original",
            name: "บันทึก",
            department_id: "dept-original",
            workflow_id: "workflow-original",
            sla_hours: 72,
            active: true,
            field_schema: JSON.stringify([
              { key: "field-original", label: "ชื่อ", required: true },
            ]),
          },
        ],
        workflows: [{ id: "workflow-original", version: 3, name: "ชื่อ", approval_stages: 2 }],
      },
      "/api/admin/gov-roles": {
        municipalityId: "gov-original",
        serviceId: "",
        mappings: [{ govRole: "SOURCE_FIELD", role: "FIELD", departmentId: "dept-original" }],
      },
    };
    await route.fulfill({ json: payload[path] ?? {} });
  });
  await page.goto("/");
  if ((page.viewportSize()?.width ?? 1280) < 1024)
    await page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
  await page.getByRole("menuitem", { name: /จัดการระบบ/ }).click();
  return writes;
}

test("category edit uses header language and retains authored fields and stable request identifiers", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.getByRole("tab", { name: "ประเภทปัญหา / แบบฟอร์ม / SLA", exact: true }).click();
  await page.getByRole("combobox", { name: "Language / ภาษา", exact: true }).selectOption("en");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("ร่างต้นฉบับ");
  await dialog.getByLabel("Field label", { exact: true }).fill("บันทึก");
  await expect(dialog.locator(".language-switcher")).toHaveCount(0);
  await expect(dialog).toContainText("System settings");
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("ร่างต้นฉบับ");
  await expect(dialog.getByLabel("Field label", { exact: true })).toHaveValue("บันทึก");
  await expect(dialog.locator('.ant-select-selection-item[title="บันทึก"]')).toBeVisible();
  await expect(
    dialog.locator(".ant-select-selection-item").filter({ hasText: "ชื่อ" }),
  ).toBeVisible();
  expect(writes).toEqual([]);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(writes).toEqual([
    {
      path: "/api/admin/categories",
      body: {
        id: "category-original",
        name: "ร่างต้นฉบับ",
        departmentId: "dept-original",
        workflowId: "workflow-original",
        slaHours: 72,
        fields: [{ key: "field-original", label: "บันทึก", required: true }],
        active: true,
      },
    },
  ]);
});

test("role edit keeps stable role keys and original account names", async ({ page }) => {
  const writes = await setup(page);
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "original", exact: true }) });
  await page.getByRole("combobox", { name: "Language / ภาษา", exact: true }).selectOption("en");
  await row.getByRole("button", { name: "Assign role", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".language-switcher")).toHaveCount(0);
  await expect(dialog).toContainText("บันทึก");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(writes).toEqual([
    {
      path: "/api/admin/users/person-original/role",
      body: { role: "FIELD", departmentId: "dept-original" },
    },
  ]);
});

for (const width of [390, 768, 1280])
  for (const language of ["th", "en"]) {
    test(`admin edit fits ${width}px in ${language}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await setup(page, "OFFICER");
      await page
        .getByRole("combobox", { name: "Language / ภาษา", exact: true })
        .selectOption(language);
      await page
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: "original", exact: true }) })
        .getByRole("button", {
          name: language === "en" ? "Assign role" : "กำหนดบทบาท",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator(".language-switcher")).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveCSS("transform", "none");
      await expect(dialog).toHaveCSS("opacity", "1");
      const selectedRole = dialog
        .locator(".ant-select-selection-item")
        .filter({ hasText: language === "en" ? "Central officer" : "เจ้าหน้าที่ส่วนกลาง" });
      expect(await selectedRole.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(
        true,
      );
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.screenshot({
        path: `../work/screenshots/admin-${language}-${width}.png`,
        animations: "disabled",
      });
    });
  }

test("Gov mapping validation and failed save change language while retaining drafts and source role codes", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.getByRole("tab", { name: "บทบาท Gov Center", exact: true }).click();
  await page.getByLabel("รหัสเทศบาลใน Gov Center", { exact: true }).fill("draft-municipality");
  await page.getByRole("textbox", { name: "รหัสบทบาท Gov 1", exact: true }).fill("");
  await page.getByRole("button", { name: "บันทึกการจับคู่บทบาท", exact: true }).click();
  await expect(page.getByText("กรุณากรอกรหัสบทบาท Gov", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Language / ภาษา", exact: true }).selectOption("en");
  await expect(page.getByText("Please enter a Gov role code", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Gov Center municipality ID", { exact: true })).toHaveValue(
    "draft-municipality",
  );
  await page.getByRole("textbox", { name: "Gov role code 1", exact: true }).fill("SOURCE_FIELD");
  let fail = true;
  let attempts = 0;
  await page.route("**/api/admin/gov-roles", async (route) => {
    if (route.request().method() !== "GET") attempts++;
    if (route.request().method() !== "GET" && fail) {
      fail = false;
      return route.fulfill({ status: 400, json: { message: "ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง" } });
    }
    await route.fallback();
  });
  const saveMapping = page.getByRole("button", { name: /Save role mappings$/ });
  await expect(saveMapping).toBeEnabled();
  await expect(saveMapping).not.toHaveClass(/ant-btn-loading/);
  await saveMapping.click();
  await expect(
    page.getByText("Required information is missing or invalid", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Gov Center municipality ID", { exact: true })).toHaveValue(
    "draft-municipality",
  );
  await page.getByRole("combobox", { name: "Language / ภาษา", exact: true }).selectOption("th");
  await expect(page.getByText("ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Language / ภาษา", exact: true }).selectOption("en");
  await expect(saveMapping).toBeEnabled();
  await expect(saveMapping).not.toHaveClass(/ant-btn-loading/);
  await saveMapping.click();
  await expect(page.getByText("Role mappings saved", { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
  expect(writes).toEqual([
    {
      path: "/api/admin/gov-roles",
      body: {
        municipalityId: "draft-municipality",
        serviceId: "",
        mappings: [{ govRole: "SOURCE_FIELD", role: "FIELD", departmentId: "dept-original" }],
      },
    },
  ]);
});

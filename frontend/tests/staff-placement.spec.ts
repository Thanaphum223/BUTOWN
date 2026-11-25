import { test, expect, type Page } from "@playwright/test";

const departments = [
  { id: "eng", name: "กองช่าง" },
  { id: "health", name: "กองสาธารณสุข" },
];

async function start(page: Page, me: Record<string, unknown>, placement?: Record<string, any>) {
  const writes: { path: string; body: unknown }[] = [];
  const state = { me };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push({ path, body: request.postDataJSON() });
      placement!.people.splice(0, 1);
      return route.fulfill({ status: 200, body: "" });
    }
    const data: Record<string, unknown> = {
      "/api/auth/me": state.me,
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/catalog": { categories: [], departments: [], queues: [] },
      "/api/complaints": { items: [], total: 0, stats: {} },
      "/api/staff-placement": placement,
    };
    return route.fulfill({ json: data[path] ?? [] });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  return { writes, state };
}

for (const role of ["LEADER", "FIELD"]) {
  test(`${role} without a department waits and continues once placed`, async ({ page }) => {
    const me = { id: "new", display_name: "ผู้มาใหม่", role, department_id: null };
    const { state } = await start(page, { ...me, pending_department: true });
    await expect(page.getByText("บัญชีของคุณรอกำหนดกอง", { exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem")).toHaveCount(3);
    await page.getByRole("menuitem", { name: /การแจ้งเตือน/ }).click();
    await expect(page.getByRole("heading", { name: "การแจ้งเตือน", exact: true })).toBeVisible();
    await page.getByRole("menuitem", { name: /ภาพรวม/ }).click();
    state.me = { ...me, department_id: "eng" };
    await expect(page.getByText("บัญชีของคุณรอกำหนดกอง", { exact: true })).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(page.getByRole("menuitem", { name: /คิวงาน/ })).toBeVisible();
  });
}

test("the mayor chooses a department for a waiting head", async ({ page }) => {
  const { writes } = await start(
    page,
    { id: "mayor", display_name: "นายก", role: "APPROVER", gov_role: "MAYOR" },
    {
      role: "LEADER",
      departments,
      people: [
        {
          id: "head",
          display_name: "หัวหน้าใหม่",
          role: "LEADER",
          gov_role: "DEPT_HEAD",
          created_at: "2026-11-25T02:00:00Z",
        },
      ],
    },
  );
  await page.getByRole("menuitem", { name: /รอกำหนดกอง/ }).click();
  const button = page.getByRole("button", { name: "กำหนดกอง", exact: true });
  await expect(button).toBeDisabled();
  await page.getByRole("combobox", { name: "เลือกกองให้ หัวหน้าใหม่" }).click();
  await page.locator(".ant-select-dropdown:visible").getByText("กองช่าง", { exact: true }).click();
  await button.click();
  await expect(page.getByText("ไม่มีผู้รอกำหนดกอง")).toBeVisible();
  expect(writes).toEqual([{ path: "/api/staff-placement/head", body: { departmentId: "eng" } }]);
});

test("a head accepts field staff only into their own department", async ({ page }) => {
  const { writes } = await start(
    page,
    { id: "head", display_name: "หัวหน้า", role: "LEADER", department_id: "eng" },
    {
      role: "FIELD",
      departments: [departments[0]],
      people: [
        {
          id: "worker",
          display_name: "ช่างใหม่",
          role: "FIELD",
          gov_role: "FIELD_TECH",
          created_at: "2026-11-25T02:00:00Z",
        },
      ],
    },
  );
  await page.getByRole("menuitem", { name: /รอกำหนดกอง/ }).click();
  await expect(page.getByText("รับผู้ลงพื้นที่เข้ากองของคุณ: กองช่าง")).toBeVisible();
  await expect(page.locator(".content").getByRole("combobox")).toHaveCount(0);
  await page.getByRole("button", { name: "รับเข้ากอง", exact: true }).click();
  await expect(page.getByText("ไม่มีผู้รอกำหนดกอง")).toBeVisible();
  expect(writes).toEqual([{ path: "/api/staff-placement/worker", body: { departmentId: "eng" } }]);
});

test("a deputy mayor has no placement page", async ({ page }) => {
  await start(page, {
    id: "d",
    display_name: "รองนายก",
    role: "APPROVER",
    gov_role: "DEPUTY_MAYOR",
  });
  await expect(page.getByRole("menuitem", { name: /ภาพรวม/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /รอกำหนดกอง/ })).toHaveCount(0);
});

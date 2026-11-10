import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page, adminDepartment: string | null = "engineering") {
  const users = [
    {
      id: "admin",
      username: "iam_admin",
      display_name: "ผู้ดูแล",
      role: "ADMIN",
      department_id: adminDepartment,
      enabled: true,
    },
    {
      id: "citizen",
      username: "iam_citizen",
      display_name: "สมชาย ใจดี",
      role: "CITIZEN",
      department_id: null,
      enabled: true,
    },
    {
      id: "officer",
      username: "iam_officer",
      display_name: "สมหญิง ใจดี",
      role: "OFFICER",
      department_id: null,
      enabled: true,
    },
    {
      id: "leader",
      username: "iam_leader",
      display_name: "หัวหน้าเดิม",
      role: "LEADER",
      department_id: "engineering",
      enabled: true,
    },
    {
      id: "approver",
      username: "iam_approver",
      display_name: "ผู้ลงพื้นที่เดิม",
      role: "FIELD",
      department_id: "health",
      enabled: true,
    },
    {
      id: "disabled",
      username: "iam_disabled",
      display_name: "บัญชีปิดใช้งาน",
      role: "CITIZEN",
      department_id: null,
      enabled: false,
    },
  ];
  const departments = [
    { id: "engineering", name: "กองช่าง" },
    { id: "health", name: "กองสาธารณสุข" },
    { id: "empty", name: "หน่วยงานทดสอบ" },
  ];
  const writes: { path: string; body: any }[] = [];
  let fail = false;
  let deletionBlocked = false;
  let gate: Promise<void> | undefined;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (["POST", "DELETE"].includes(request.method())) {
      const body = request.method() === "DELETE" ? null : request.postDataJSON();
      writes.push({ path, body });
      if (gate) await gate;
      if (fail)
        return route.fulfill({ status: 503, json: { message: "บันทึกไม่สำเร็จ ลองอีกครั้ง" } });
      const department = departments.find((d) => path.startsWith(`/api/admin/departments/${d.id}`));
      if (department) {
        if (request.method() === "DELETE") {
          if (deletionBlocked)
            return route.fulfill({
              status: 409,
              json: { message: "ไม่สามารถลบหน่วยงานที่ยังมีข้อมูลใช้งานได้" },
            });
          departments.splice(departments.indexOf(department), 1);
        } else if (path.endsWith("/field-users")) {
          for (const id of body.userIds)
            Object.assign(
              users.find((u) => u.id === id)!,
              { role: "FIELD", department_id: department.id },
            );
        } else department.name = body.name;
        return route.fulfill({ json: {} });
      }
      const user = users.find((u) => path === `/api/admin/users/${u.id}/role`);
      if (!user) throw new Error("Unexpected write: " + path);
      Object.assign(user, { role: body.role, department_id: body.departmentId });
      return route.fulfill({ json: {} });
    }
    const payload: Record<string, unknown> = {
      "/api/auth/me": users[0],
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/catalog": { categories: [], departments },
      "/api/complaints": {
        items: [],
        total: 0,
        stats: { total: 0, in_progress: 0, closed: 0, overdue: 0 },
      },
      "/api/admin": {
        currentUserId: "admin",
        municipality: { id: "town", name: "เทศบาลทดสอบ" },
        users,
        departments,
        categories: [],
        workflows: [],
      },
    };
    return route.fulfill({ json: payload[path] ?? {} });
  });
  await page.goto("/");
  if ((page.viewportSize()?.width ?? 1280) < 1024)
    await page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
  await page.getByRole("menuitem", { name: /จัดการระบบ/ }).click();
  await page.getByRole("tab", { name: "หน่วยงาน", exact: true }).click();
  return {
    writes,
    fail: (value: boolean) => {
      fail = value;
    },
    blockDeletion: (value: boolean) => {
      deletionBlocked = value;
    },
    hold: () => {
      let release!: () => void;
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        gate = undefined;
        release();
      };
    },
  };
}

function department(page: Page, name: string) {
  return page.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) });
}
async function pick(page: Page, name: string) {
  const input = page
    .getByRole("dialog")
    .getByRole("combobox", { name: "บัญชีผู้ใช้", exact: true });
  await input.press("ArrowDown");
  await input.fill(name);
  await page.locator(".ant-select-dropdown:visible").getByText(new RegExp(name)).click();
}

for (const assignment of [
  {
    department: "กองช่าง",
    button: "เพิ่มหัวหน้า",
    name: "สมชาย ใจดี",
    id: "citizen",
    role: "LEADER",
    departmentId: "engineering",
  },
  {
    department: "กองสาธารณสุข",
    button: "เพิ่มผู้ลงพื้นที่",
    name: "สมหญิง ใจดี",
    id: "officer",
    role: "FIELD",
    departmentId: "health",
  },
]) {
  test(`department action saves ${assignment.role} in the selected department`, async ({
    page,
  }) => {
    const state = await setup(page);
    const row = department(page, assignment.department);
    await expect(row.getByRole("button", { name: assignment.button, exact: true })).toBeVisible();
    await row.getByRole("button", { name: assignment.button, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(assignment.department);
    await pick(page, assignment.name);
    await expect(dialog).toContainText("บทบาทปัจจุบัน:");
    await expect(dialog).toContainText("แทนบทบาทเดิม");
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.writes).toEqual([
      {
        path:
          assignment.role === "FIELD"
            ? `/api/admin/departments/${assignment.departmentId}/field-users`
            : `/api/admin/users/${assignment.id}/role`,
        body:
          assignment.role === "FIELD"
            ? { userIds: [assignment.id] }
            : { role: assignment.role, departmentId: assignment.departmentId },
      },
    ]);
    await expect(row).toContainText(assignment.name);
    await expect(department(page, "กองช่าง")).toContainText("หัวหน้าเดิม");
    await expect(department(page, "กองสาธารณสุข")).toContainText("ผู้ลงพื้นที่เดิม");
  });
}

test("department picker excludes disabled, administrator and already assigned accounts and cancels without writing", async ({
  page,
}) => {
  const state = await setup(page);
  await department(page, "กองช่าง")
    .getByRole("button", { name: "เพิ่มหัวหน้า", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "บัญชีผู้ใช้", exact: true }).click();
  const options = page.locator(".ant-select-dropdown:visible .ant-select-item-option");
  await expect(options).toHaveCount(3);
  await expect(options.filter({ hasText: /หัวหน้าเดิม|ผู้ดูแล|บัญชีปิดใช้งาน/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  expect(state.writes).toHaveLength(0);
});

test("moving an existing head refreshes the previous department roster", async ({ page }) => {
  await setup(page);
  await department(page, "กองสาธารณสุข")
    .getByRole("button", { name: "เพิ่มหัวหน้า", exact: true })
    .click();
  await pick(page, "หัวหน้าเดิม");
  await expect(page.getByRole("dialog")).toContainText("หน่วยงานปัจจุบัน: กองช่าง");
  await page.getByRole("dialog").getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(department(page, "กองช่าง")).not.toContainText("หัวหน้าเดิม");
  await expect(department(page, "กองสาธารณสุข")).toContainText("หัวหน้าเดิม");
});

test("failed assignment stays editable and duplicate clicks submit only once", async ({ page }) => {
  const state = await setup(page);
  await department(page, "กองช่าง")
    .getByRole("button", { name: "เพิ่มหัวหน้า", exact: true })
    .click();
  await pick(page, "สมชาย ใจดี");
  state.fail(true);
  const release = state.hold();
  const save = page.getByRole("dialog").getByRole("button", { name: "บันทึก", exact: true });
  await save.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect.poll(() => state.writes.length).toBe(1);
  await expect(save).toBeDisabled();
  release();
  await expect(page.getByRole("dialog")).toContainText("บันทึกไม่สำเร็จ ลองอีกครั้ง");
  await expect(save).toBeEnabled();
  state.fail(false);
  await save.click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(state.writes).toHaveLength(2);
  await expect(department(page, "กองช่าง")).toContainText("สมชาย ใจดี");
});

for (const width of [440, 1280]) {
  test(`department roster and assignment remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await department(page, "กองช่าง")
      .getByRole("button", { name: "เพิ่มหัวหน้า", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("transform", "none");
    await expect(dialog).toHaveCSS("opacity", "1");
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({
      path: `../work/screenshots/department-head-${width}.png`,
      animations: "disabled",
    });
  });
}

for (const role of [
  { value: "OFFICER", label: "เจ้าหน้าที่ส่วนกลาง (สำนักปลัด/ศูนย์รับเรื่องราวร้องทุกข์)" },
  { value: "APPROVER", label: "ผู้อนุมัติ" },
]) {
  test(`municipal ${role.value} assignment clears department and needs no department selector`, async ({
    page,
  }) => {
    const state = await setup(page);
    await page.getByRole("tab", { name: "บัญชีผู้ใช้", exact: true }).click();
    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "หัวหน้าเดิม", exact: true }) });
    await row.getByRole("button", { name: "กำหนดบทบาท", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: /บทบาทที่ต้องการ/ }).press("ArrowDown");
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText(role.label, { exact: true })
      .click();
    await expect(dialog).toContainText("บทบาทนี้ดูแลงานระดับเทศบาล ไม่สังกัดกอง");
    await expect(dialog.getByRole("combobox", { name: /กอง \/ หน่วยงาน/ })).not.toBeVisible();
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.writes).toEqual([
      { path: "/api/admin/users/leader/role", body: { role: role.value, departmentId: null } },
    ]);
  });
}

test("administrator switches to municipal reviewers without a department prompt", async ({
  page,
}) => {
  await setup(page);
  let activeSession = {
    id: "admin",
    username: "iam_admin",
    display_name: "ผู้ดูแล",
    role: "ADMIN",
    account_role: "ADMIN",
    department_id: "engineering" as string | null,
  };
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: activeSession }));
  await page.route("**/api/auth/admin-role", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.departmentId).toBeNull();
    activeSession = { ...activeSession, role: body.role, department_id: null };
    await route.fulfill({ json: activeSession });
  });
  for (const label of [
    "เจ้าหน้าที่ส่วนกลาง (สำนักปลัด/ศูนย์รับเรื่องราวร้องทุกข์)",
    "ผู้อนุมัติ",
  ]) {
    await page
      .getByRole("combobox", { name: "สลับบทบาทผู้ดูแลระบบ", exact: true })
      .press("ArrowDown");
    await page.locator(".ant-select-dropdown:visible").getByText(label, { exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "หน่วยงานสำหรับบทบาท", exact: true }),
    ).not.toBeVisible();
    await expect(page.locator(".header-identity small")).toContainText(label);
    await page.reload();
    await expect(page.locator(".header-identity small")).toContainText(label);
  }
});

test("multiple field accounts are saved together and added to the roster", async ({ page }) => {
  const state = await setup(page);
  await department(page, "กองช่าง")
    .getByRole("button", { name: "เพิ่มผู้ลงพื้นที่", exact: true })
    .click();
  await pick(page, "สมชาย ใจดี");
  await pick(page, "สมหญิง ใจดี");
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".ant-select-selection-item")).toHaveCount(2);
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(state.writes).toEqual([
    {
      path: "/api/admin/departments/engineering/field-users",
      body: { userIds: ["citizen", "officer"] },
    },
  ]);
  await expect(department(page, "กองช่าง")).toContainText("สมชาย ใจดี");
  await expect(department(page, "กองช่าง")).toContainText("สมหญิง ใจดี");
});

test("department rename validates a name and preserves the draft after a failed save", async ({
  page,
}) => {
  const state = await setup(page);
  await department(page, "กองช่าง")
    .getByRole("button", { name: "แก้ชื่อหน่วยงาน", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const name = dialog.getByRole("textbox", { name: "ชื่อหน่วยงาน", exact: true });
  await expect(name).toHaveValue("กองช่าง");
  await name.fill("   ");
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dialog).toContainText("กรุณาระบุชื่อหน่วยงาน");
  expect(state.writes).toHaveLength(0);
  await name.fill("กองช่างและสาธารณูปโภค");
  state.fail(true);
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dialog).toContainText("บันทึกไม่สำเร็จ ลองอีกครั้ง");
  await expect(name).toHaveValue("กองช่างและสาธารณูปโภค");
  state.fail(false);
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(department(page, "กองช่างและสาธารณูปโภค")).toBeVisible();
});

test("department deletion requires confirmation and retains a blocked department", async ({
  page,
}) => {
  const state = await setup(page);
  const row = department(page, "หน่วยงานทดสอบ");
  await row.getByRole("button", { name: "ลบหน่วยงาน", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("หน่วยงานทดสอบ");
  await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  expect(state.writes).toHaveLength(0);
  await row.getByRole("button", { name: "ลบหน่วยงาน", exact: true }).click();
  dialog = page.getByRole("dialog");
  state.blockDeletion(true);
  await dialog.getByRole("button", { name: "ยืนยันลบหน่วยงาน", exact: true }).click();
  await expect(dialog).toContainText("ไม่สามารถลบหน่วยงานที่ยังมีข้อมูลใช้งานได้");
  await expect(row).toBeVisible();
  state.blockDeletion(false);
  await dialog.getByRole("button", { name: "ยืนยันลบหน่วยงาน", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(row).toHaveCount(0);
});

test("renamed departments update the header role choices without reloading", async ({ page }) => {
  await setup(page, null);
  await department(page, "กองช่าง")
    .getByRole("button", { name: "แก้ชื่อหน่วยงาน", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "ชื่อหน่วยงาน", exact: true })
    .fill("กองช่างปรับปรุง");
  await page.getByRole("dialog").getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("combobox", { name: "สลับบทบาทผู้ดูแลระบบ", exact: true })
    .press("ArrowDown");
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("ผู้ลงพื้นที่", { exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "เลือกหน่วยงานเพื่อเริ่มบทบาท", exact: true })
    .press("ArrowDown");
  await expect(
    page.locator(".ant-select-dropdown:visible").getByText("กองช่างปรับปรุง", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".ant-select-dropdown:visible").getByText("กองช่าง", { exact: true }),
  ).toHaveCount(0);
});

import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page) {
  const users = [
    {
      id: "admin",
      username: "iam_admin",
      display_name: "ผู้ดูแลทดสอบ",
      role: "ADMIN",
      department_id: "engineering",
      enabled: true,
    },
    {
      id: "citizen",
      username: "iam_citizen",
      display_name: "สมชาย ทดสอบ",
      role: "CITIZEN",
      department_id: null,
      enabled: true,
    },
    {
      id: "officer",
      username: "iam_officer",
      display_name: "สมหญิง ทดสอบ",
      role: "OFFICER",
      department_id: null,
      enabled: true,
    },
  ];
  const deleted = new Set<string>();
  const writes: { path: string; method: string }[] = [];
  let fail = false;
  let gate: Promise<void> | undefined;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push({ path, method: request.method() });
      if (gate) await gate;
      if (fail)
        return route.fulfill({ status: 503, json: { message: "ลบบัญชีไม่สำเร็จ ลองอีกครั้ง" } });
      if (request.method() !== "DELETE" || path !== "/api/admin/users/citizen")
        throw new Error("Unexpected account write");
      expect(request.headers()["x-csrf-token"]).toBe("test-delete-csrf");
      deleted.add("citizen");
      return route.fulfill({ status: 204 });
    }
    const departments = [{ id: "engineering", name: "กองช่าง" }];
    const payload: Record<string, unknown> = {
      "/api/auth/me": users[0],
      "/api/auth/csrf": { token: "test-delete-csrf", headerName: "X-CSRF-TOKEN" },
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
        users: users.filter((u) => !deleted.has(u.id)),
        departments,
        categories: [],
        workflows: [],
      },
    };
    await route.fulfill({ json: payload[path] ?? {} });
  });
  await page.goto("/");
  if ((page.viewportSize()?.width ?? 1280) < 1024)
    await page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
  await page.getByRole("menuitem", { name: /จัดการระบบ/ }).click();
  await expect(page.getByRole("tab", { name: "บัญชีผู้ใช้", exact: true })).toBeVisible();
  return {
    writes,
    fail: (value: boolean) => {
      fail = value;
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

function account(page: Page, name: string) {
  return page.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) });
}
async function openDeletion(page: Page) {
  const remove = account(page, "สมชาย ทดสอบ").getByRole("button", { name: "ลบบัญชี", exact: true });
  await expect(remove).toBeVisible();
  await remove.click();
  const dialog = page.getByRole("dialog", { name: "ลบบัญชีผู้ใช้", exact: true });
  await expect(dialog.getByRole("button", { name: "ยกเลิก", exact: true })).toBeFocused();
  return dialog;
}

test("account deletion names its target, defaults to cancel, and leaves data untouched when cancelled", async ({
  page,
}) => {
  const state = await setup(page);
  const dialog = await openDeletion(page);
  await expect(dialog).toContainText("สมชาย ทดสอบ");
  await expect(dialog).toContainText("iam_citizen");
  await expect(dialog).toContainText("บัญชี Gov Center ยังคงอยู่");
  await expect(dialog).toContainText("ประวัติงาน");
  const cancel = dialog.getByRole("button", { name: "ยกเลิก", exact: true });
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(dialog).not.toBeVisible();
  expect(state.writes).toEqual([]);
  await expect(account(page, "สมชาย ทดสอบ")).toBeVisible();
  await expect(
    account(page, "ผู้ดูแลทดสอบ").getByRole("button", { name: "ลบบัญชี", exact: true }),
  ).toBeDisabled();
});

test("confirmed deletion removes only the selected account from administration", async ({
  page,
}) => {
  const state = await setup(page);
  const dialog = await openDeletion(page);
  await dialog.getByRole("button", { name: "ยืนยันลบบัญชี", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(account(page, "สมชาย ทดสอบ")).toHaveCount(0);
  await expect(account(page, "สมหญิง ทดสอบ")).toBeVisible();
  await expect(account(page, "ผู้ดูแลทดสอบ")).toBeVisible();
  expect(state.writes).toEqual([{ path: "/api/admin/users/citizen", method: "DELETE" }]);
});

test("deletion prevents duplicate requests and retains a failed confirmation for retry", async ({
  page,
}) => {
  const state = await setup(page);
  const dialog = await openDeletion(page);
  state.fail(true);
  const release = state.hold();
  const confirm = dialog.getByRole("button", { name: "ยืนยันลบบัญชี", exact: true });
  await confirm.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect.poll(() => state.writes.length).toBe(1);
  await expect(confirm).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "ยกเลิก", exact: true })).toBeDisabled();
  release();
  await expect(dialog).toContainText("ลบบัญชีไม่สำเร็จ ลองอีกครั้ง");
  await expect(confirm).toBeEnabled();
  await expect(account(page, "สมชาย ทดสอบ")).toHaveCount(1);
  state.fail(false);
  await confirm.click();
  await expect(dialog).not.toBeVisible();
  await expect(account(page, "สมชาย ทดสอบ")).toHaveCount(0);
  expect(state.writes).toHaveLength(2);
});

for (const width of [440, 1280]) {
  test(`account deletion confirmation fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    const dialog = await openDeletion(page);
    await expect(dialog).toHaveCSS("transform", "none");
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({
      path: `../work/screenshots/account-delete-${width}.png`,
      animations: "disabled",
    });
  });
}

import { test, expect, type Page } from "@playwright/test";

const people = [
  { id: "p1", display_name: "สมชาย ช่างโยธา", gov_role: "นายช่างโยธา" },
  { id: "p2", display_name: "สมหญิง ช่างโยธา", gov_role: "นายช่างโยธา" },
  { id: "p3", display_name: "สมศักดิ์ คนงาน", gov_role: "พนักงานจ้าง" },
  { id: "p4", display_name: "ไม่มียศ", gov_role: null },
];
const existing = {
  id: "team-a",
  name: "ทีมเดิม",
  representative_id: "p3",
  representative_name: "สมศักดิ์ คนงาน",
  members: JSON.stringify([{ id: "p3", name: "สมศักดิ์ คนงาน" }]),
};

async function fixture(page: Page) {
  const writes: { method: string; path: string; body: any }[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push({ method: request.method(), path, body: request.postDataJSON() });
      return route.fulfill({ json: { id: "team-new" } });
    }
    const responses: Record<string, unknown> = {
      "/api/auth/me": {
        id: "leader",
        display_name: "หัวหน้า",
        role: "LEADER",
        department_id: "engineering",
      },
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/catalog": {
        categories: [],
        departments: [{ id: "engineering", name: "กองช่าง" }],
        queues: [],
      },
      "/api/teams": [existing],
      "/api/people": people,
      "/api/complaints": { items: [], total: 0, stats: {} },
    };
    return route.fulfill({ json: responses[path] ?? {} });
  });
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  const menu = page.getByRole("button", { name: "เปิดเมนูหลัก" });
  const teams = page.getByRole("menuitem", { name: /ทีมลงพื้นที่$/ });
  await expect(menu.or(teams).first()).toBeVisible();
  if (await menu.isVisible()) await menu.click();
  await teams.click();
  return writes;
}

test("leader builds a team by rank, picks the representative by star and saves", async ({
  page,
}) => {
  const writes = await fixture(page);
  await page.getByRole("button", { name: "สร้างทีม", exact: true }).click();
  const dialog = page.getByRole("dialog");

  await dialog.getByRole("button", { name: "เลือกทั้งยศ นายช่างโยธา", exact: true }).click();
  await expect(dialog.getByText("เลือกแล้ว 2 คน", { exact: true })).toBeVisible();
  // The first picked person becomes representative and names the team until edited.
  await expect(dialog.getByLabel("ชื่อทีม", { exact: true })).toHaveValue("ทีมสมชาย ช่างโยธา");
  await expect(
    dialog.getByRole("button", { name: "ตั้ง สมชาย ช่างโยธา เป็นตัวแทนทีม", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // Someone already in another team is flagged but can still be picked.
  const worker = dialog.getByRole("checkbox", { name: /สมศักดิ์ คนงาน/ });
  await expect(dialog.getByText("อยู่ทีม ทีมเดิม แล้ว", { exact: true })).toBeVisible();
  await worker.check();
  await dialog
    .getByRole("button", { name: "ตั้ง สมศักดิ์ คนงาน เป็นตัวแทนทีม", exact: true })
    .click();
  await expect(dialog.getByLabel("ชื่อทีม", { exact: true })).toHaveValue("ทีมสมศักดิ์ คนงาน");
  await dialog.getByRole("button", { name: "เอา สมหญิง ช่างโยธา ออก", exact: true }).click();
  await expect(dialog.getByText("เลือกแล้ว 2 คน", { exact: true })).toBeVisible();

  await dialog.getByPlaceholder("ค้นหาชื่อหรือยศ").fill("ไม่มี");
  await expect(dialog.getByRole("checkbox")).toHaveCount(1);
  await dialog.getByPlaceholder("ค้นหาชื่อหรือยศ").fill("");

  await dialog.getByRole("button", { name: "สร้างทีม", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({
    method: "POST",
    path: "/api/teams",
    body: { name: "ทีมสมศักดิ์ คนงาน", representativeId: "p3", memberIds: ["p1", "p3"] },
  });
});

test("removing the representative hands the star to the next member", async ({ page }) => {
  await fixture(page);
  await page.getByRole("button", { name: "สร้างทีม", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: /สมชาย ช่างโยธา/ }).check();
  await dialog.getByRole("checkbox", { name: /สมหญิง ช่างโยธา/ }).check();
  await dialog.getByRole("button", { name: "เอา สมชาย ช่างโยธา ออก", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "ตั้ง สมหญิง ช่างโยธา เป็นตัวแทนทีม", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "เลือกทั้งยศ นายช่างโยธา", exact: true }).click();
  await dialog.getByRole("button", { name: "ยกเลิกทั้งยศ นายช่างโยธา", exact: true }).click();
  await expect(dialog.getByText("เลือกแล้ว 0 คน", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "สร้างทีม", exact: true }).click();
  await expect(dialog.getByText("กรุณาเลือกสมาชิกทีมอย่างน้อย 1 คน")).toBeVisible();
});

test("edit team opens the same picker with current members and saves with PUT", async ({
  page,
}) => {
  const writes = await fixture(page);
  await page.getByRole("button", { name: "แก้ไขทีม", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "แก้ไขทีมลงพื้นที่" });
  await expect(dialog.getByLabel("ชื่อทีม", { exact: true })).toHaveValue("ทีมเดิม");
  await expect(dialog.getByRole("checkbox", { name: /สมศักดิ์ คนงาน/ })).toBeChecked();
  // Editing its own team does not flag members as "already in" it.
  await expect(dialog.getByText("อยู่ทีม ทีมเดิม แล้ว", { exact: true })).toHaveCount(0);
  await dialog.getByRole("checkbox", { name: /สมชาย ช่างโยธา/ }).check();
  await dialog.getByRole("button", { name: "บันทึกทีม", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({
    method: "PUT",
    path: "/api/teams/team-a",
    body: { name: "ทีมเดิม", representativeId: "p3", memberIds: ["p3", "p1"] },
  });
});

test("team editor fills the screen on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.getByRole("button", { name: "สร้างทีม", exact: true }).click();
  const content = page.locator(".team-editor .ant-modal-content");
  // Measure after the opening animation settles.
  await expect
    .poll(async () => (await content.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(388);
  await expect
    .poll(async () => (await content.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(840);
});

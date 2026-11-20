import { test, expect, type Page } from "@playwright/test";

async function citizen(page: Page, followedStatus = "REJECTED") {
  const mine = {
    id: "mine-1234",
    category_name: "ถนนและทางเท้า",
    status: "TERMINATED",
    created_at: "2026-11-01T01:00:00Z",
    updated_at: "2026-11-05T02:00:00Z",
  };
  const followed = {
    ...mine,
    id: "follow-5678",
    category_name: "ท่อระบายน้ำ",
    status: followedStatus,
  };
  const decision = (status: string) =>
    status === "CLOSED" ? "CLOSE" : status === "REJECTED" ? "REJECT" : "DENY";
  const detail = (item: typeof mine) => ({
    complaint: {
      ...item,
      title: item.id === mine.id ? "ถนนชำรุด" : item.category_name,
      ...(item.id === mine.id
        ? { description: "รายละเอียดคำร้องของฉัน", address: "ถนนทดสอบ" }
        : {}),
      due_at: "2026-11-07T01:00:00Z",
      mock: item.id === followed.id,
    },
    history: [
      { action: "SUBMIT", from_status: null, to_status: "NEW", created_at: mine.created_at },
      ...(["CLOSED", "REJECTED", "TERMINATED"].includes(item.status)
        ? [
            {
              action: decision(item.status),
              from_status: "RESOURCE_APPROVAL",
              to_status: item.status,
              created_at: mine.updated_at,
              reason:
                item.id === mine.id
                  ? "ไม่อนุมัติเนื่องจากทรัพยากรไม่เพียงพอ"
                  : "อยู่นอกอำนาจหน้าที่ของเทศบาล",
            },
          ]
        : []),
    ],
    files: [],
    media: [],
    actions: [],
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/complaints/" + followed.id)
      return route.fulfill({ status: 403, json: { message: "ข้อมูลส่วนตัวเฉพาะผู้แจ้ง" } });
    const data: Record<string, unknown> = {
      "/api/auth/me": { id: "citizen-test", display_name: "ผู้ทดสอบ", role: "CITIZEN" },
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/catalog": { categories: [], departments: [] },
      "/api/municipal-center": { latitude: 13.75, longitude: 100.5 },
      "/api/community/complaints": { items: [], top: [], total: 0, stats: {} },
      "/api/citizen/tracking": {
        items: [url.searchParams.get("tab") === "following" ? followed : mine],
        total: 1,
      },
      ["/api/complaints/" + mine.id]: detail(mine),
      ["/api/community/complaints/" + followed.id]: detail(followed),
    };
    await route.fulfill({ json: data[url.pathname] ?? {} });
  });
  await page.goto("/");
  return { mine, followed };
}

test("login and registration omit the emergency shortcut", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      status: url.pathname === "/api/auth/me" ? 401 : 200,
      json:
        url.pathname === "/api/public/gov-auth"
          ? {
              configured: true,
              mode: "local",
              iamAuthUrl: "https://auth.govcenter.co",
              serviceCode: "ui-test",
              callbackUrl: url.origin + "/auth/callback",
            }
          : {},
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /เบอร์ฉุกเฉิน/ })).toHaveCount(0);
  await page.getByRole("button", { name: "สมัครสมาชิก", exact: true }).click();
  await expect(page.getByRole("heading", { name: "สมัครสมาชิก", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /เบอร์ฉุกเฉิน/ })).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`citizen tracking and followed details share a full page at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await citizen(page);
    await expect(
      page.getByRole("button", { name: "ดูคำร้องของฉันทั้งหมด", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "เมนูประชาชน", exact: true })
      .getByRole("link", { name: /ติดตามสถานะ/ })
      .click();
    await expect(page.getByRole("heading", { name: "ติดตามสถานะ", exact: true })).toBeVisible();
    await expect(page.locator(".tracking-card")).toHaveCount(1);
    await page.screenshot({ path: `../work/screenshots/citizen-tracking-${width}.png` });
    await page.getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ถนนชำรุด", exact: true })).toBeVisible();
    await expect(
      page.locator(".workflow-progress .ant-steps-item-error .ant-steps-item-title"),
    ).toHaveText("ปิดเรื่อง");
    await expect(page.locator(".workflow-progress .ant-steps-item").nth(3)).toHaveClass(
      /ant-steps-item-wait/,
    );
    await expect(
      page.getByRole("alert").filter({ hasText: "ไม่อนุมัติเนื่องจากทรัพยากรไม่เพียงพอ" }),
    ).toBeVisible();
    if (width === 1440) {
      const row = await page
        .locator(".citizen-case-detail .split-full-info .ant-row")
        .boundingBox();
      const column = await page
        .locator(".citizen-case-detail .split-full-info .ant-col")
        .first()
        .boundingBox();
      expect(column!.width / row!.width).toBeGreaterThan(0.9);
    }
    await page.getByRole("button", { name: /กลับรายการ/ }).click();
    await page.getByRole("tab", { name: "เรื่องที่ติดตาม", exact: true }).click();
    await page.getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
    await expect(
      page
        .locator(".citizen-case-detail")
        .getByRole("heading", { name: "ท่อระบายน้ำ", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog", { name: "รายละเอียดปัญหา", exact: true })).toHaveCount(0);
    await expect(page.getByText("MOCK · ข้อมูลจำลอง", { exact: true })).toBeVisible();
    await expect(
      page.locator(".workflow-progress .ant-steps-item-error .ant-steps-item-title"),
    ).toHaveText("ปิดเรื่อง");
    await expect(
      page.getByRole("alert").filter({ hasText: "อยู่นอกอำนาจหน้าที่ของเทศบาล" }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `../work/screenshots/citizen-followed-detail-${width}.png` });
    await page.getByRole("button", { name: /กลับรายการ/ }).click();
    await expect(page.getByRole("tab", { name: "เรื่องที่ติดตาม", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page
        .getByRole("navigation", { name: "เมนูประชาชน", exact: true })
        .getByRole("link", { name: /ติดตามสถานะ/ }),
    ).toHaveAttribute("aria-current", "page");
  });
}

test("tracking shows six detailed cases per page with centred page numbers", async ({ page }) => {
  const { mine } = await citizen(page);
  const pages: string[] = [];
  await page.route("**/api/citizen/tracking?**", (route) => {
    const url = new URL(route.request().url());
    pages.push(url.searchParams.get("page")!);
    const first = url.searchParams.get("page") === "0";
    const items = Array.from({ length: first ? 6 : 2 }, (_, index) => ({
      ...mine,
      id: `case-${first ? index : index + 6}-0000`,
      description: "ท่อแตกน้ำไหลตลอดคืน",
      address: "ซอยทดสอบ 3",
      votes: 4,
    }));
    return route.fulfill({ json: { items, total: 8 } });
  });
  await page
    .getByRole("navigation", { name: "เมนูประชาชน", exact: true })
    .getByRole("link", { name: /ติดตามสถานะ/ })
    .click();
  const cards = page.locator(".tracking-card");
  await expect(cards).toHaveCount(6);
  await expect(cards.first()).toContainText("ท่อแตกน้ำไหลตลอดคืน");
  await expect(cards.first()).toContainText("ซอยทดสอบ 3");
  await expect(cards.first()).toContainText("4 โหวต");
  const pager = page.locator(".tracking-pagination");
  const list = (await page.locator(".tracking-list").boundingBox())!;
  const [left, right] = await pager.locator("li").evaluateAll((nodes) => {
    const boxes = nodes.map((node) => node.getBoundingClientRect());
    return [Math.min(...boxes.map((b) => b.left)), Math.max(...boxes.map((b) => b.right))];
  });
  expect(Math.abs((left + right) / 2 - (list.x + list.width / 2))).toBeLessThan(4);
  await pager.getByRole("listitem", { name: "2" }).click();
  await expect(cards).toHaveCount(2);
  expect(pages).toContain("1");
});

test("a followed new complaint opens read only without reporter upload controls", async ({
  page,
}) => {
  await citizen(page, "NEW");
  await page.getByRole("button", { name: "เรื่องที่ติดตาม", exact: true }).click();
  await page.getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
  await expect(
    page.locator(".citizen-case-detail").getByRole("heading", { name: "ท่อระบายน้ำ", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".evidence-upload")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /แนบไฟล์|บันทึกการดำเนินการ/ })).toHaveCount(0);
});

test("tracking refreshes automatically without overlapping slow reads", async ({ page }) => {
  const { mine } = await citizen(page);
  await page
    .getByRole("navigation", { name: "เมนูประชาชน", exact: true })
    .getByRole("link", { name: /ติดตามสถานะ/ })
    .click();
  await expect(page.locator(".tracking-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "โหลดใหม่", exact: true })).toHaveCount(0);
  let pending = 0;
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/citizen/tracking?**", async (route) => {
    pending++;
    await delayed;
    await route.fulfill({
      json: { items: [{ ...mine, category_name: "ข้อมูลติดตามใหม่", status: "CLOSED" }], total: 1 },
    });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => pending).toBe(1);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
  });
  await page.waitForTimeout(4500);
  expect(pending).toBe(1);
  release();
  await expect(page.locator(".tracking-card")).toContainText("ข้อมูลติดตามใหม่");
  await expect.poll(() => pending, { timeout: 10000 }).toBe(2);
});

import { test, expect, type Page } from "@playwright/test";

const officerQueues = [
  { value: "intake", label: "รอรับเรื่อง" },
  { value: "handoff", label: "ส่งต่อ / จ่ายงานใหม่" },
  { value: "resources", label: "ตรวจคำขอทรัพยากร" },
  { value: "reports", label: "ตรวจรายงาน / ปิดเรื่อง" },
];
async function screen(page: Page, role = "OFFICER", admin = false) {
  const items = Array.from({ length: 10 }, (_, index) => ({
    id: `screen-case-${index}`,
    title: `งานลำดับที่ ${index + 1} ตรวจท่อระบายน้ำและถนนบริเวณชุมชน`,
    address: "จุดตรวจบริเวณถนนเทศบาลและพื้นที่ชุมชน",
    description: "รายละเอียดงานทดสอบ ".repeat(100),
    status:
      role === "OFFICER"
        ? "NEW"
        : role === "LEADER"
          ? "TRIAGED"
          : role === "FIELD"
            ? "ASSIGNED"
            : "RESOURCE_APPROVAL",
    version: 1,
    votes: 0,
    department_id: "engineering",
    answers: "{}",
    form_schema: "[]",
    assignment_details: "{}",
  }));
  let queue = "";
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/complaints") queue = url.searchParams.get("queue") || "";
    const responses: Record<string, unknown> = {
      "/api/auth/me": {
        id: "layout-person",
        display_name: "Natthawut Ongkhachuen",
        role,
        account_role: admin ? "ADMIN" : role,
        department_id: ["LEADER", "FIELD"].includes(role) ? "engineering" : null,
      },
      "/api/privacy": { acknowledged: true },
      "/api/catalog": {
        categories: [],
        departments: [{ id: "engineering", name: "กองช่างเทศบาล" }],
        queues: officerQueues,
      },
      "/api/complaints": { items, total: 20, stats: { total: 20, in_progress: 20, closed: 0 } },
    };
    const item = items.find((item) => url.pathname === "/api/complaints/" + item.id);
    return route.fulfill({
      json: item
        ? {
            complaint: item,
            actions: [
              {
                action:
                  role === "OFFICER"
                    ? "TRIAGE"
                    : role === "LEADER"
                      ? "ASSIGN"
                      : role === "FIELD"
                        ? "ACCEPT"
                        : "APPROVE",
              },
            ],
            history: [],
            files: [],
            media: [],
            resources: [],
            reports: [],
            workOrders: [],
            reviews: [],
            approvals: [],
            transfers: [],
          }
        : responses[url.pathname] || {},
    });
  });
  await page.goto("/");
  if (role === "APPROVER")
    await page.getByRole("button", { name: "เปิดคิวงานอนุมัติ", exact: true }).click();
  await expect(page.locator(".queue-item, .field-task-card")).toHaveCount(10);
  return { getQueue: () => queue };
}

for (const [width, height] of [
  [1470, 780],
  [1280, 720],
  [1024, 768],
])
  test(`desktop queue fits ${width} by ${height} without cut-off controls`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const state = await screen(page);
    const filters = page.locator(".queue-quick-status");
    await expect(filters).toBeVisible();
    expect(await filters.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    for (const button of await filters.getByRole("button").all())
      await expect(button).toBeInViewport();
    const badge = page.locator(".sidebar-bottom .ant-tag");
    expect(
      await badge.evaluate(
        (node) =>
          node.getBoundingClientRect().right <=
          node.closest("aside")!.getBoundingClientRect().right - 8,
      ),
    ).toBe(true);
    await expect(page.locator(".queue-item").first()).toBeInViewport({ ratio: 0.98 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),
    ).toBe(true);
    await page.locator(".queue-items").evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect(page.locator(".queue-item").last()).toBeInViewport({ ratio: 0.98 });
    await expect(
      filters.getByRole("button", { name: "ตรวจรายงาน / ปิดเรื่อง", exact: true }),
    ).toBeInViewport();
    await filters.getByRole("button", { name: "ตรวจรายงาน / ปิดเรื่อง", exact: true }).click();
    await expect.poll(state.getQueue).toBe("reports");
    await page.screenshot({ path: `../work/screenshots/workspace-screen-${width}.png` });
  });

for (const role of ["OFFICER", "LEADER", "FIELD", "APPROVER"])
  test(`the ${role} workspace keeps mobile controls and detail usable`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await screen(page, role);
    const filters = page.locator(".queue-quick-status");
    expect(await filters.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.getByRole("button", { name: /^เปิดงาน งานลำดับที่ 1 / }).click();
    await expect(page.locator(".split-case-summary")).toBeVisible();
    await expect(filters).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("button", { name: /กลับคิวงาน/ }).click();
    await expect(filters).toBeVisible();
  });

test("short screens and an expanded filter can still reach pagination", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await screen(page);
  await page.locator(".queue-filters > summary").click();
  await page.locator(".queue-panel .ant-pagination").scrollIntoViewIfNeeded();
  await expect(page.locator(".queue-panel .ant-pagination")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const role of ["OFFICER", "LEADER", "FIELD", "APPROVER"])
  test(`desktop ${role} detail scrolls independently and keeps actions reachable in English`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await screen(page, role);
    await page.getByRole("button", { name: /^เปิดงาน งานลำดับที่ 1 / }).click();
    await page.locator(".language-switcher").selectOption("en");
    const detail = page.locator(".workspace-detail");
    await expect(page.locator(".split-case-summary")).toBeVisible();
    await detail.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect(page.locator(".split-action-dock button").first()).toBeInViewport();
    await expect(page.locator(".queue-panel .ant-pagination")).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `../work/screenshots/workspace-detail-${role}.png` });
  });

test("administrator role controls fit the tablet header without trapping the queue", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await screen(page, "LEADER", true);
  await page.locator(".language-switcher").selectOption("en");
  for (const control of await page.locator(".admin-role-controls .ant-select").all())
    await expect(control).toBeInViewport();
  await page.locator(".queue-filters > summary").click();
  await page.locator(".queue-panel .ant-pagination").scrollIntoViewIfNeeded();
  await expect(page.locator(".queue-panel .ant-pagination")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [992, 1024])
  for (const role of ["LEADER", "FIELD"])
    test(`short English administrator ${role} workspace stays usable at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 680 });
      await screen(page, role, true);
      await page.locator(".language-switcher").selectOption("en");
      await page.locator(".queue-filters > summary").click();
      await page.locator(".queue-panel .ant-pagination").scrollIntoViewIfNeeded();
      await expect(page.locator(".queue-panel .ant-pagination")).toBeInViewport();
      await page.getByRole("button", { name: /^Open task งานลำดับที่ 1 / }).click();
      const detail = page.locator(".workspace-detail");
      await expect(page.locator(".split-case-summary")).toBeVisible();
      await detail.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await page.locator(".split-action-dock button").first().scrollIntoViewIfNeeded();
      await expect(page.locator(".split-action-dock button").first()).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `../work/screenshots/workspace-admin-${role}-${width}.png` });
    });

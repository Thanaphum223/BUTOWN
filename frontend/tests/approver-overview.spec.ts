import { expect, test, type Page } from "@playwright/test";

const items = [
  ["assigned", "RESOURCE_APPROVAL"],
  ["other", "RESOURCE_APPROVAL"],
  ["unassigned", "RESOURCE_DRAFT"],
  ["unrouted", "NEW"],
  ["closed", "CLOSED"],
  ["rejected", "REJECTED"],
  ["terminated", "TERMINATED"],
].map(([id, status]) => ({
  id,
  title: `Original ${id}`,
  status,
  category_name: "Original category สมัครสมาชิก",
  address: "Original address สมัครสมาชิก",
  created_at: "2026-10-01T00:00:00Z",
  due_at: "2026-10-02T00:00:00Z",
  version: 1,
  votes: 0,
  can_open: id === "assigned",
}));
const stats = { total: 7, in_progress: 4, closed: 1, overdue: 4 };

async function setup(
  page: Page,
  handleList?: (url: URL) => Promise<unknown>,
  catalogFailure = () => false,
) {
  const detailRequests: string[] = [],
    lists: URL[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (path.startsWith("/api/complaints/")) {
      detailRequests.push(path);
      if (path !== "/api/complaints/assigned")
        return route.fulfill({ status: 403, json: { message: "Forbidden" } });
      return route.fulfill({
        json: {
          complaint: {
            ...items[0],
            description: "Assigned detail",
            answers: "{}",
            form_schema: "[]",
          },
          actions: [],
          files: [],
          resources: [],
          reports: [],
          reviews: [],
          workOrders: [],
          approvals: [],
          history: [],
          transfers: [],
        },
      });
    }
    if (path === "/api/complaints") {
      lists.push(url);
      const result = handleList ? await handleList(url) : undefined;
      if (result === "failure")
        return route.fulfill({ status: 500, json: { message: "Overview unavailable" } });
      return route.fulfill({
        json: result ?? {
          items: url.searchParams.get("overview") === "true" ? items : [items[0]],
          total: url.searchParams.get("overview") === "true" ? 7 : 1,
          page: 0,
          size: 10,
          stats,
        },
      });
    }
    if (path === "/api/catalog" && catalogFailure())
      return route.fulfill({ status: 503, json: { message: "Categories unavailable" } });
    const payload: Record<string, unknown> = {
      "/api/auth/me": { id: "approver-user", display_name: "Original approver", role: "APPROVER" },
      "/api/privacy": { acknowledged: true },
      "/api/catalog": {
        categories: [{ id: "road", name: "Original category สมัครสมาชิก" }],
        queues: [{ value: "decisions", label: "รอพิจารณาทรัพยากร" }],
        departments: [],
      },
    };
    return route.fulfill({ json: payload[path] ?? {} });
  });
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  return { detailRequests, lists };
}

for (const width of [390, 768, 1280])
  for (const language of ["th", "en"])
    test(`municipal summaries preserve recipient access and responsive layout ${language} at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const { detailRequests, lists } = await setup(page);
      await page.locator(".topbar .language-switcher").selectOption(language);
      const overview = page.locator(".approver-overview");
      await expect(
        overview.getByRole("heading", {
          name: language === "en" ? "Municipal overview" : "ภาพรวมคำร้องทั้งเทศบาล",
          exact: true,
        }),
      ).toBeVisible();
      await expect(overview.locator(".overview-summary")).toHaveCount(7);
      await expect(overview.locator(".workspace-stats")).toContainText(
        language === "en" ? "All municipal cases" : "คำร้องทั้งหมดในเทศบาล",
      );
      await expect(overview.locator(".ant-statistic-content-value")).toHaveText(["7", "4", "1"]);
      await expect(overview).toContainText("Original category สมัครสมาชิก");
      for (const id of ["closed", "rejected", "terminated", "unrouted", "unassigned"])
        await expect(
          overview.getByRole("heading", { name: `Original ${id}`, exact: true }),
        ).toBeVisible();
      await expect(overview.locator(".overview-summary button, .overview-summary a")).toHaveCount(
        1,
      );
      await overview.getByRole("heading", { name: "Original other", exact: true }).click();
      expect(detailRequests).toEqual([]);
      expect(lists[0].searchParams.get("overview")).toBe("true");
      expect(lists[0].searchParams.has("activeOnly")).toBe(false);
      expect(lists[0].searchParams.has("queue")).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
      if (width === 1280) {
        const geometry = await page.locator(".sidebar").evaluate((el) => ({
          rect: el.getBoundingClientRect().toJSON(),
          width: getComputedStyle(el).width,
          flex: getComputedStyle(el).flex,
          main: document.querySelector("main")!.getBoundingClientRect().toJSON(),
          overview: el.ownerDocument
            .querySelector(".approver-overview")!
            .getBoundingClientRect()
            .toJSON(),
          actions: el.ownerDocument
            .querySelector(".overview-actions")!
            .getBoundingClientRect()
            .toJSON(),
          scrollX: window.scrollX,
        }));
        expect(geometry.rect.width, JSON.stringify(geometry)).toBe(232);
        expect(geometry.rect.x, JSON.stringify(geometry)).toBe(0);
        expect(geometry.main.right, JSON.stringify(geometry)).toBeLessThanOrEqual(width);
        expect(geometry.overview.right, JSON.stringify(geometry)).toBeLessThanOrEqual(width);
        expect(geometry.actions.right, JSON.stringify(geometry)).toBeLessThanOrEqual(width);
      }
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await page.screenshot({
        path: `../work/screenshots/approver-overview-${language}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await overview
        .getByRole("button", {
          name: language === "en" ? "Open approval queue" : "เปิดคิวงานอนุมัติ",
          exact: true,
        })
        .click();
      await expect(overview).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /เปิดงาน Original assigned|Open task Original assigned/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /เปิดงาน Original other|Open task Original other/ }),
      ).toHaveCount(0);
      expect(lists.at(-1)!.searchParams.has("overview")).toBe(false);
      expect(lists.at(-1)!.searchParams.get("activeOnly")).toBe("true");
      await page
        .getByRole("button", { name: /เปิดงาน Original assigned|Open task Original assigned/ })
        .click();
      await expect(
        page.locator(".workspace-detail section").getByText("Assigned detail", { exact: true }),
      ).toBeVisible();
      expect([...new Set(detailRequests)]).toEqual(["/api/complaints/assigned"]);
      if (width < 992)
        await page
          .getByRole("button", {
            name: language === "en" ? "Open main menu" : "เปิดเมนูหลัก",
            exact: true,
          })
          .click();
      await page
        .getByRole("menuitem", { name: language === "en" ? /Overview$/ : /ภาพรวม$/ })
        .click();
      await expect(page.locator(".approver-overview .overview-summary")).toHaveCount(7);
      await expect(page.getByText("Assigned detail", { exact: true })).toHaveCount(0);
    });

for (const language of ["th", "en"])
  test(`overview opens only the recipient's routed complaint in ${language}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    const { detailRequests } = await setup(page);
    await page.locator(".topbar .language-switcher").selectOption(language);
    const overview = page.locator(".approver-overview");
    const assigned = overview.locator(".overview-summary").filter({ hasText: "Original assigned" });
    await expect(overview.locator(".overview-summary")).toHaveCount(7);
    for (const id of ["other", "unassigned", "unrouted", "closed", "rejected", "terminated"]) {
      const summary = overview.locator(".overview-summary").filter({ hasText: `Original ${id}` });
      await expect(summary.getByRole("button")).toHaveCount(0);
      await expect(summary.getByRole("link")).toHaveCount(0);
      await summary.getByRole("heading", { name: `Original ${id}`, exact: true }).click();
    }
    expect(detailRequests).toEqual([]);
    const open = assigned.getByRole("button", {
      name: language === "en" ? "View details" : "ดูรายละเอียด",
      exact: true,
    });
    await expect(open).toBeVisible();
    await open.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Assigned detail", { exact: true })).toBeVisible();
    expect([...new Set(detailRequests)]).toEqual(["/api/complaints/assigned"]);
    await expect(overview).toHaveCount(0);
  });

test("filters and pagination query summaries while global totals stay municipal", async ({
  page,
}) => {
  const { lists } = await setup(page, async (url) => ({
    items: [items[url.searchParams.get("page") === "1" ? 4 : 0]],
    total: 11,
    page: Number(url.searchParams.get("page")),
    size: 10,
    stats,
  }));
  const overview = page.locator(".approver-overview");
  await expect(overview.locator(".overview-summary")).toHaveCount(1);
  await overview.locator(".ant-pagination-next").click();
  await expect(overview).toContainText("Original closed");
  await overview.getByRole("button", { name: "กำลังดำเนินการ", exact: true }).click();
  await expect.poll(() => lists.at(-1)!.searchParams.get("activeOnly")).toBe("true");
  expect(lists.at(-1)!.searchParams.get("page")).toBe("0");
  await overview.getByRole("button", { name: "เสร็จสิ้น", exact: true }).click();
  await expect.poll(() => lists.at(-1)!.searchParams.get("completedOnly")).toBe("true");
  expect(lists.at(-1)!.searchParams.has("activeOnly")).toBe(false);
  await overview
    .getByRole("searchbox", { name: "ค้นหาเลขเรื่อง / หัวข้อ", exact: true })
    .fill("Original closed");
  await expect.poll(() => lists.at(-1)!.searchParams.get("q")).toBe("Original closed");
  await overview.getByRole("button", { name: "ทั้งหมด", exact: true }).click();
  await expect.poll(() => lists.at(-1)!.searchParams.has("completedOnly")).toBe(false);
  await overview.locator("summary").click();
  await overview.getByRole("combobox", { name: "ประเภทปัญหา", exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("Original category สมัครสมาชิก", { exact: true })
    .click();
  await expect.poll(() => lists.at(-1)!.searchParams.get("categoryId")).toBe("road");
  await overview.getByRole("searchbox", { name: "พื้นที่", exact: true }).fill("Original area");
  await expect.poll(() => lists.at(-1)!.searchParams.get("area")).toBe("Original area");
  await overview
    .getByRole("combobox", { name: "เรียงลำดับคำร้อง", exact: true })
    .press("ArrowDown");
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("เก่าที่สุด", { exact: true })
    .click();
  await expect.poll(() => lists.at(-1)!.searchParams.get("sort")).toBe("oldest");
  await expect(page.locator(".ant-select-dropdown:visible")).toHaveCount(0);
  await overview.getByRole("combobox", { name: "กรองสถานะคำร้อง", exact: true }).click();
  await overview.getByRole("combobox", { name: "กรองสถานะคำร้อง", exact: true }).press("ArrowUp");
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("ปิดเรื่องแล้ว", { exact: true })
    .click();
  await expect.poll(() => lists.at(-1)!.searchParams.get("status")).toBe("CLOSED");
  await overview.getByRole("button", { name: "ล้างตัวกรอง", exact: true }).click();
  await expect.poll(() => lists.at(-1)!.searchParams.has("status")).toBe(false);
  expect(lists.at(-1)!.searchParams.has("categoryId")).toBe(false);
  expect(lists.at(-1)!.searchParams.get("area")).toBe("");
  await expect(overview.locator(".ant-statistic-content-value")).toHaveText(["7", "4", "1"]);
});

test("failed overview hides stale totals and rows and retries successfully", async ({ page }) => {
  let failure = false;
  const { detailRequests } = await setup(page, async () => (failure ? "failure" : undefined));
  const overview = page.locator(".approver-overview");
  await expect(overview.locator(".overview-summary")).toHaveCount(7);
  failure = true;
  await overview.getByRole("button", { name: /โหลดใหม่/ }).click();
  await expect(overview.getByRole("alert")).toContainText("Overview unavailable");
  await expect(overview.locator(".overview-summary")).toHaveCount(0);
  await expect(overview.locator(".ant-statistic-content-value")).toHaveText(["—", "—", "—"]);
  failure = false;
  await overview.getByRole("button", { name: /โหลดใหม่/ }).click();
  await expect(overview.locator(".overview-summary")).toHaveCount(7);
  await expect(overview.getByRole("alert")).toHaveCount(0);
  expect(detailRequests).toEqual([]);
});

test("late search results cannot replace the current overview filter", async ({ page }) => {
  let release!: () => void,
    pending = false,
    completed = false;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await setup(page, async (url) => {
    if (url.searchParams.get("q") === "old") {
      pending = true;
      await delayed;
      completed = true;
      return {
        items: [{ ...items[0], title: "Stale result" }],
        total: 1,
        page: 0,
        size: 10,
        stats,
      };
    }
    return {
      items: [
        {
          ...items[0],
          title: url.searchParams.get("q") === "new" ? "Current result" : "Initial result",
        },
      ],
      total: 1,
      page: 0,
      size: 10,
      stats,
    };
  });
  const overview = page.locator(".approver-overview"),
    search = overview.getByRole("searchbox", { name: "ค้นหาเลขเรื่อง / หัวข้อ", exact: true });
  await expect(overview).toContainText("Initial result");
  await search.fill("old");
  await expect.poll(() => pending).toBe(true);
  await search.fill("new");
  await expect(overview).toContainText("Current result");
  release();
  await expect.poll(() => completed).toBe(true);
  await expect(overview).not.toContainText("Stale result");
  await expect(overview).toContainText("Current result");
});

test("catalog failure stays visible while municipal summaries remain usable and retry recovers filters", async ({
  page,
}) => {
  let failure = true;
  await setup(page, undefined, () => failure);
  const overview = page.locator(".approver-overview");
  await expect(overview.locator(".overview-summary")).toHaveCount(7);
  await expect(overview.getByRole("alert")).toContainText("Categories unavailable");
  failure = false;
  await overview.getByRole("button", { name: /โหลดใหม่/ }).click();
  await expect(overview.getByRole("alert")).toHaveCount(0);
  await overview.locator("summary").click();
  await overview.getByRole("combobox", { name: "ประเภทปัญหา", exact: true }).click();
  await expect(
    page
      .locator(".ant-select-dropdown:visible")
      .getByText("Original category สมัครสมาชิก", { exact: true }),
  ).toBeVisible();
});

test("a disappearing last page returns to the remaining municipal summaries", async ({ page }) => {
  const { lists } = await setup(page, async (url) => ({
    items: url.searchParams.get("page") === "1" ? [] : [items[0]],
    total: url.searchParams.get("page") === "1" ? 1 : 11,
    page: Number(url.searchParams.get("page")),
    size: 10,
    stats,
  }));
  const overview = page.locator(".approver-overview");
  await expect(overview.locator(".overview-summary")).toHaveCount(1);
  await overview.locator(".ant-pagination-next").click();
  await expect
    .poll(() => lists.slice(-2).map((url) => url.searchParams.get("page")))
    .toEqual(["1", "0"]);
  await expect(overview).toContainText("Original assigned");
});

test("initial unchanged search cannot reset a quickly selected page", async ({ page }) => {
  const { lists } = await setup(page, async (url) => ({
    items: [items[url.searchParams.get("page") === "1" ? 4 : 0]],
    total: 11,
    page: Number(url.searchParams.get("page")),
    size: 10,
    stats,
  }));
  const overview = page.locator(".approver-overview");
  await expect(overview.locator(".overview-summary")).toHaveCount(1);
  await overview.getByRole("button", { name: "เปิดคิวงานอนุมัติ", exact: true }).click();
  await expect(page.getByRole("button", { name: /เปิดงาน Original assigned/ })).toBeVisible();
  await page.clock.install({ time: new Date("2026-11-07T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-07T00:00:01Z"));
  await page.getByRole("menuitem", { name: /ภาพรวม$/ }).click();
  await expect(overview.locator(".overview-summary")).toHaveCount(1);
  await overview.locator(".ant-pagination-next").click();
  await expect(overview).toContainText("Original closed");
  await page.clock.runFor(350);
  await expect.poll(() => lists.at(-1)!.searchParams.get("page")).toBe("1");
  await expect(overview).toContainText("Original closed");
});

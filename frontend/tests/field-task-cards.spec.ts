import { test, expect } from "@playwright/test";

for (const failure of [false, true]) {
  test(
    failure
      ? "card metadata errors offer retry without inventing an appointment"
      : "stale card metadata cannot replace the current page appointment or pin",
    async ({ page }) => {
      let firstRequests = 0;
      let release: (() => void) | undefined;
      const delayed = new Promise<void>((resolve) => {
        release = resolve;
      });
      const item = (id: string) => ({
        id,
        title: id,
        category_name: "Original category",
        address: "Original address",
        status: "ASSIGNED",
        version: 1,
        votes: 0,
        due_at: "2026-12-20T00:00:00Z",
      });
      await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url()),
          path = url.pathname;
        if (path === "/api/complaints/first") {
          firstRequests++;
          if (failure && firstRequests === 1)
            return route.fulfill({ status: 500, json: { message: "Metadata unavailable" } });
          if (!failure && firstRequests === 1) await delayed;
          return route.fulfill({
            json: {
              complaint: {
                ...item("first"),
                assignment_details: JSON.stringify({ appointment: "2026-12-01" }),
                latitude: 13.1,
                longitude: 100.1,
              },
            },
          });
        }
        if (path === "/api/complaints/second")
          return route.fulfill({
            json: {
              complaint: {
                ...item("second"),
                assignment_details: JSON.stringify({ appointment: "2026-12-02" }),
                latitude: 14.2,
                longitude: 101.2,
              },
            },
          });
        const responses: Record<string, unknown> = {
          "/api/auth/me": { id: "field-user", role: "FIELD", display_name: "Field User" },
          "/api/privacy": { acknowledged: true, version: "test" },
          "/api/catalog": { categories: [], queues: [], departments: [] },
          "/api/complaints": {
            items: [item(url.searchParams.get("page") === "1" ? "second" : "first")],
            total: 11,
            stats: { total: 11 },
          },
        };
        return route.fulfill({ json: responses[path] ?? {} });
      });
      await page.goto("/");
      const cards = page.locator(".field-task-card");
      await expect(cards).toHaveCount(1);
      await expect(cards).toContainText("0 โหวต");
      if (failure) {
        await expect(cards).toContainText("Metadata unavailable");
        await expect(cards).not.toContainText("2026-12-01");
        await cards.getByRole("button", { name: "ลองใหม่", exact: true }).click();
        await expect(cards).toContainText("2026-12-01");
      } else {
        await expect.poll(() => firstRequests).toBe(1);
        await page.locator(".ant-pagination-next").click();
        await expect(cards).toContainText("2026-12-02");
        release!();
        await expect(cards).not.toContainText("2026-12-01");
        await cards.getByRole("button", { name: "เปิดตำแหน่ง", exact: true }).click();
        await expect(cards.locator(".location-map")).toHaveCount(1);
        await expect(cards).toContainText("14.20000");
      }
    },
  );
}

test("changing account cancels old metadata and keeps the new account's appointment and pin", async ({
  page,
}) => {
  let account = "old",
    oldRequested = false;
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const item = { id: "shared-id", title: "Task", status: "ASSIGNED", version: 1, votes: 0 };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ status: 401, json: {} });
    if (path === "/api/complaints/shared-id") {
      const old = account === "old";
      if (old) {
        oldRequested = true;
        await delayed;
      }
      return route.fulfill({
        json: {
          complaint: {
            ...item,
            assignment_details: { appointment: old ? "2026-12-01" : "2026-12-15" },
            latitude: old ? 13 : 14,
            longitude: 100,
          },
        },
      });
    }
    return route.fulfill({
      json:
        path === "/api/complaints"
          ? { items: [item], total: 1, stats: {} }
          : { categories: [], queues: [], departments: [] },
    });
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const reactPath = "/node_modules/.vite/deps/react.js",
      domPath = "/node_modules/.vite/deps/react-dom_client.js",
      componentPath = "/src/StaffWorkspace.tsx";
    const [{ default: React }, { default: ReactDOM }, { default: Workspace }] = await Promise.all([
      import(reactPath),
      import(domPath),
      import(componentPath),
    ]);
    const el = document.createElement("div");
    el.id = "account-harness";
    document.body.append(el);
    const root = ReactDOM.createRoot(el);
    (window as any).renderField = (id: string) =>
      root.render(React.createElement(Workspace, { user: { id, role: "FIELD" }, dashboard: true }));
    (window as any).renderField("old");
  });
  await expect.poll(() => oldRequested).toBe(true);
  account = "new";
  await page.evaluate(() => (window as any).renderField("new"));
  const card = page.locator("#account-harness .field-task-card");
  await expect(card).toContainText("2026-12-15");
  release();
  await card.getByRole("button", { name: "เปิดตำแหน่ง", exact: true }).click();
  await expect(card).toContainText("14.00000");
  await expect(card).not.toContainText("2026-12-01");
});

test("slow card metadata completes across unchanged list polling", async ({ page }) => {
  await page.clock.install();
  let lists = 0,
    details = 0;
  let release!: () => void;
  const firstDetail = new Promise<void>((resolve) => {
    release = resolve;
  });
  const never = new Promise<void>(() => {});
  const item = {
    id: "slow-task",
    title: "Initial title",
    status: "ASSIGNED",
    version: 1,
    votes: 0,
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/complaints/slow-task") {
      details++;
      // Only the original request completes: restarting it loses the result.
      await (details === 1 ? firstDetail : never);
      return route.fulfill({
        json: {
          complaint: {
            ...item,
            assignment_details: { appointment: "2026-12-19" },
            latitude: 14.5,
            longitude: 100.5,
          },
        },
      });
    }
    if (path === "/api/complaints") {
      lists++;
      return route.fulfill({
        json: {
          items: [{ ...item, title: lists > 1 ? "Updated title after poll" : item.title }],
          total: 1,
          stats: { total: 1 },
        },
      });
    }
    const responses: Record<string, unknown> = {
      "/api/auth/me": { id: "slow-field", role: "FIELD", display_name: "Field User" },
      "/api/privacy": { acknowledged: true, version: "test" },
      "/api/catalog": { categories: [], queues: [], departments: [] },
    };
    return route.fulfill({ json: responses[path] ?? {} });
  });
  await page.goto("/");
  await expect.poll(() => details).toBe(1);
  await page.clock.fastForward(4500);
  const card = page.locator(".field-task-card");
  await expect(card).toContainText("Updated title after poll");
  release();
  await expect(card).toContainText("2026-12-19");
  await card.getByRole("button", { name: "เปิดตำแหน่ง", exact: true }).click();
  await expect(card).toContainText("14.50000");
  expect(details).toBe(1);
});

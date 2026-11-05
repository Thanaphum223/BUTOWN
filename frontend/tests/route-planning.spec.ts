import { expect, test, type Page } from "@playwright/test";

async function fixture(page: Page, empty = false) {
  const state: any = { role: "OFFICER", plan: null, writes: [] };
  const candidates = Array.from({ length: empty ? 0 : 5 }, (_, i) => ({
    id: "case-" + i,
    title: "จุดซ่อมที่ " + (i + 1),
    address: "ถนนทดสอบ " + (i + 1),
    latitude: 13.75 + i * 0.002,
    longitude: 100.5 + i * 0.002,
    version: 0,
    department_id: "engineering",
    department_name: "กองช่าง",
    leader_id: "leader",
    leader_name: "หัวหน้าช่าง",
    due_at: "2026-12-01T00:00:00Z",
  }));
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path.startsWith("/api/route-plans")) {
      const body = request.postDataJSON();
      state.writes.push({ path, body });
      if (path.endsWith("/calculate") && state.hold) await state.hold;
      if (path.endsWith("/calculate") && state.failure)
        return route.fulfill({
          status: 503,
          json: { message: "บริการคำนวณเส้นทางไม่พร้อม กรุณาลองอีกครั้ง ระบบยังไม่ได้มอบหมายงาน" },
        });
      if (path.endsWith("/calculate"))
        state.plan = {
          id: "round",
          name: "รอบงานใหม่",
          status: "DRAFT",
          version: 0,
          leader_id: "leader",
          department_id: "engineering",
          start_latitude: body.startLatitude,
          start_longitude: body.startLongitude,
          return_to_start: body.returnToStart,
          optimized: body.optimize,
          distance: 5100,
          duration: 900,
          geometry: {
            type: "LineString",
            coordinates: candidates.map((p) => [p.longitude, p.latitude]),
          },
          history: [],
          stops: body.complaintIds.map((id: string, i: number) => ({
            ...candidates.find((c) => c.id === id),
            complaint_id: id,
            stop_order: i + 1,
            complaint_status: "TRIAGED",
          })),
        };
      if (path.endsWith("/propose"))
        Object.assign(state.plan, { status: "PROPOSED", name: body.name, version: 1 });
      if (path.endsWith("/confirm")) {
        Object.assign(state.plan, { status: "DISPATCHED", team_id: body.teamId, version: 2 });
        state.plan.stops.forEach((p: any) => {
          p.work_status = "ASSIGNED";
          p.complaint_status = "ASSIGNED";
        });
      }
      if (path.endsWith("/decline")) Object.assign(state.plan, { status: "DECLINED", version: 2 });
      return route.fulfill({ json: state.plan });
    }
    const payload: Record<string, unknown> = {
      "/api/auth/me": {
        id: state.role === "OFFICER" ? "officer" : state.role === "LEADER" ? "leader" : "field",
        role: state.role,
        display_name: "ผู้ทดสอบ",
        department_id: state.role === "OFFICER" ? null : "engineering",
      },
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/catalog": { categories: [], departments: [], queues: [] },
      "/api/complaints": {
        items: [],
        total: 0,
        stats: { total: 0, closed: 0, in_progress: 0, overdue: 0 },
      },
      "/api/route-plans/candidates": candidates,
      "/api/route-plans": state.plan ? [state.plan] : [],
      "/api/route-plans/round": state.plan,
      "/api/teams": [
        {
          id: "team",
          name: "ทีมช่าง A",
          representative_name: "ช่างทดสอบ",
          members: "[]",
          active_work_count: 0,
        },
      ],
    };
    return route.fulfill({ json: payload[path] ?? {} });
  });
  await page.goto("/");
  if ((page.viewportSize()?.width || 1280) < 1024)
    await page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
  await page.getByRole("menuitem", { name: /วางแผนเส้นทาง/ }).click();
  return state;
}

test("officer draws five nearby jobs, proposes a round, leader confirms and field sees stop order", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.getByRole("button", { name: "วาดพื้นที่เลือกงาน", exact: true }).click();
  const map = page.getByRole("region", { name: "แผนที่วางแผนเส้นทาง", exact: true });
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error("Map is missing");
  const corners = [
    [bounds.x + 50, bounds.y + 15],
    [bounds.x + bounds.width - 15, bounds.y + 15],
    [bounds.x + bounds.width - 15, bounds.y + bounds.height - 35],
    [bounds.x + 50, bounds.y + bounds.height - 35],
    [bounds.x + 50, bounds.y + 15],
  ];
  await page.mouse.move(corners[0][0], corners[0][1]);
  await page.mouse.down();
  for (const [x, y] of corners.slice(1)) await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.up();
  for (let i = 1; i <= 5; i++)
    await expect(
      page.getByRole("checkbox", { name: "เลือกงาน จุดซ่อมที่ " + i, exact: true }),
    ).toBeChecked();
  expect(state.writes).toHaveLength(0);
  await page.getByRole("button", { name: "เลือกจุดเริ่มบนแผนที่", exact: true }).click();
  await map.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await page.getByRole("checkbox", { name: "กลับจุดเริ่มเมื่อเสร็จงาน", exact: true }).check();
  await page.getByRole("button", { name: "คำนวณเส้นทาง", exact: true }).click();
  await expect(page.getByText("5.1 กม.", { exact: true })).toBeVisible();
  expect(state.writes[0].body.complaintIds).toHaveLength(5);
  expect(state.writes[0].body.returnToStart).toBe(true);
  await page.getByLabel("ชื่อรอบงาน", { exact: true }).fill("รอบเช้าทีมช่าง");
  await page.getByRole("button", { name: "เสนอรอบให้หัวหน้า", exact: true }).click();
  await expect(page.getByText("รอหัวหน้ายืนยันทีม", { exact: true }).first()).toBeVisible();
  state.role = "LEADER";
  await page.reload();
  await page.getByRole("menuitem", { name: /วางแผนเส้นทาง/ }).click();
  await page.getByRole("button", { name: /เปิดรอบ รอบเช้าทีมช่าง/ }).click();
  await page.getByRole("combobox", { name: "ทีมลงพื้นที่สำหรับรอบนี้", exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText(/ทีมช่าง A/)
    .click();
  await page.getByRole("button", { name: "ยืนยันมอบหมายทั้งรอบ", exact: true }).click();
  await expect.poll(() => state.plan.status).toBe("DISPATCHED");
  expect(state.writes.at(-1).body.teamId).toBe("team");
  state.role = "FIELD";
  await page.reload();
  await page.getByRole("menuitem", { name: /รอบงานของฉัน/ }).click();
  await page.getByRole("button", { name: /เปิดรอบ รอบเช้าทีมช่าง/ }).click();
  await expect(page.getByRole("button", { name: /เปิดงาน จุดซ่อมที่/ })).toHaveCount(5);
  await expect(page.getByRole("button", { name: "คำนวณเส้นทาง", exact: true })).toHaveCount(0);
});

test("provider failure creates no round and manual ordering is recalculated without optimization", async ({
  page,
}) => {
  const state = await fixture(page);
  for (let i = 1; i <= 2; i++)
    await page.getByRole("checkbox", { name: "เลือกงาน จุดซ่อมที่ " + i, exact: true }).check();
  await page.getByRole("spinbutton", { name: "ละติจูดจุดเริ่ม", exact: true }).fill("13.75");
  await page.getByRole("spinbutton", { name: "ลองจิจูดจุดเริ่ม", exact: true }).fill("100.5");
  await page.getByRole("checkbox", { name: "กลับจุดเริ่มเมื่อเสร็จงาน", exact: true }).uncheck();
  state.failure = true;
  await page.getByRole("button", { name: "คำนวณเส้นทาง", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("ระบบยังไม่ได้มอบหมายงาน");
  expect(state.plan).toBeNull();
  await expect(page.getByRole("button", { name: "เสนอรอบให้หัวหน้า", exact: true })).toHaveCount(0);
  state.failure = false;
  await page.getByRole("button", { name: "คำนวณเส้นทาง", exact: true }).click();
  await expect(page.getByText("5.1 กม.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "เลื่อนจุดที่ 2 ขึ้น", exact: true }).click();
  await page.getByRole("button", { name: "คำนวณเส้นทาง", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(3);
  expect(state.writes[2].body.complaintIds).toEqual(["case-1", "case-0"]);
  expect(state.writes[2].body.optimize).toBe(false);
  expect(state.writes[2].body.returnToStart).toBe(false);
  await page.reload();
  await page.getByRole("menuitem", { name: /วางแผนเส้นทาง/ }).click();
  await expect(page.getByRole("spinbutton", { name: "ละติจูดจุดเริ่ม", exact: true })).toHaveValue(
    "13.75",
  );
  await expect(
    page.getByRole("checkbox", { name: "กลับจุดเริ่มเมื่อเสร็จงาน", exact: true }),
  ).not.toBeChecked();
});

test("mobile planning fits the viewport and offers list selection without drawing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.getByRole("checkbox", { name: "เลือกงาน จุดซ่อมที่ 1", exact: true }).check();
  await expect(
    page.getByRole("checkbox", { name: "เลือกงาน จุดซ่อมที่ 1", exact: true }),
  ).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "../work/screenshots/route-planning-mobile.png", fullPage: true });
});

test("calculation locks its starting point and selections until the road result returns", async ({
  page,
}) => {
  const state = await fixture(page);
  for (let i = 1; i <= 2; i++)
    await page.getByRole("checkbox", { name: "เลือกงาน จุดซ่อมที่ " + i, exact: true }).check();
  const latitude = page.getByRole("spinbutton", { name: "ละติจูดจุดเริ่ม", exact: true });
  await latitude.fill("13.75");
  await page.getByRole("spinbutton", { name: "ลองจิจูดจุดเริ่ม", exact: true }).fill("100.5");
  let release!: () => void;
  state.hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await page.getByRole("button", { name: "คำนวณเส้นทาง", exact: true }).click();
    await expect.poll(() => state.writes.length).toBe(1);
    await expect(latitude).toBeDisabled();
    await expect(
      page.getByRole("checkbox", { name: "กลับจุดเริ่มเมื่อเสร็จงาน", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("checkbox", { name: "เลือกงาน จุดซ่อมที่ 1", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
});

for (const width of [390, 1440]) {
  test(`map stays clipped while changing selection modes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, width === 1440);
    const map = page.getByRole("region", { name: "แผนที่วางแผนเส้นทาง", exact: true });
    await expect(map).toHaveCSS("overflow", "hidden");
    for (const label of ["วาดพื้นที่เลือกงาน", "เลือกจุดเริ่มบนแผนที่"]) {
      const button = page.getByRole("button", { name: label, exact: true });
      await button.click();
      await expect(map).toHaveClass(/leaflet-container/);
      await expect(map).toHaveCSS("overflow", "hidden");
      await button.click();
      await expect(map).toHaveClass(/leaflet-container/);
      await expect(map).toHaveCSS("overflow", "hidden");
    }
    await page.getByRole("button", { name: "เลือกจุดเริ่มบนแผนที่", exact: true }).click();
    const bounds = await map.boundingBox();
    if (!bounds) throw new Error("Map is missing");
    await map.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
    await expect(map).toHaveClass(/leaflet-container/);
    await expect(map).toHaveCSS("overflow", "hidden");
    if (width === 1440) await page.getByRole("menuitem", { name: /คิวงาน/ }).click({ trial: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `../work/screenshots/route-map-layout-fixed-${width}.png` });
  });
}

test("opening a saved draft restores its optimization choice", async ({ page }) => {
  await fixture(page);
  for (let i = 1; i <= 2; i++)
    await page.getByRole("checkbox", { name: "เลือกงาน จุดซ่อมที่ " + i, exact: true }).check();
  await page.getByRole("spinbutton", { name: "ละติจูดจุดเริ่ม", exact: true }).fill("13.75");
  await page.getByRole("spinbutton", { name: "ลองจิจูดจุดเริ่ม", exact: true }).fill("100.5");
  await page.getByRole("button", { name: "คำนวณเส้นทาง", exact: true }).click();
  await expect(page.getByText("5.1 กม.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "เลื่อนจุดที่ 1 ลง", exact: true }).click();
  const optimize = page.getByRole("checkbox", { name: "จัดลำดับตามเวลาเดินทาง", exact: true });
  await expect(optimize).not.toBeChecked();
  await page.getByRole("button", { name: "เปิดรอบ รอบงานใหม่", exact: true }).click();
  await expect(optimize).toBeChecked();
});

test("an old poll cannot replace the round opened after it", async ({ page }) => {
  await page.clock.install();
  const state = await fixture(page);
  for (let i = 1; i <= 2; i++)
    await page.getByRole("checkbox", { name: "เลือกงาน จุดซ่อมที่ " + i, exact: true }).check();
  await page.getByRole("spinbutton", { name: "ละติจูดจุดเริ่ม", exact: true }).fill("13.75");
  await page.getByRole("spinbutton", { name: "ลองจิจูดจุดเริ่ม", exact: true }).fill("100.5");
  await page.getByRole("button", { name: "คำนวณเส้นทาง", exact: true }).click();
  await expect(page.getByText("5.1 กม.", { exact: true })).toBeVisible();
  await page.getByLabel("ชื่อรอบงาน", { exact: true }).fill("รอบ A");
  await page.getByRole("button", { name: "เสนอรอบให้หัวหน้า", exact: true }).click();
  await expect(page.getByText("รอหัวหน้ายืนยันทีม", { exact: true }).first()).toBeVisible();
  const first = structuredClone(state.plan);
  const second = { ...first, id: "round-b", name: "รอบ B", duration: 1800 };
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let polling = false;
  await page.route("**/api/route-plans", (r) => r.fulfill({ json: [first, second] }));
  await page.route("**/api/route-plans/round", async (r) => {
    polling = true;
    await hold;
    await r.fulfill({ json: first });
  });
  await page.route("**/api/route-plans/round-b", (r) => r.fulfill({ json: second }));
  try {
    await page.clock.runFor(8100);
    await expect.poll(() => polling).toBe(true);
    await page.getByRole("button", { name: "เปิดรอบ รอบ B", exact: true }).click();
    await expect(page.getByText("30 นาที", { exact: true })).toBeVisible();
    const oldResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/route-plans/round",
    );
    release();
    await oldResponse;
    await page.clock.runFor(200);
    await expect(page.getByText("30 นาที", { exact: true })).toBeVisible();
  } finally {
    release();
  }
});

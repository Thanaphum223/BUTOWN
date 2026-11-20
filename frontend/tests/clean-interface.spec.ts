import { expect, test, type Page } from "@playwright/test";

async function workspace(page: Page) {
  const writes: { body: unknown; headers: Record<string, string> }[] = [];
  const complaint = {
    id: "clean-case",
    title: "Original title",
    category_name: "รายละเอียด",
    address: "Original address",
    description: "Original description",
    status: "ASSIGNED",
    version: 7,
    votes: 0,
    department_id: "engineering",
    answers: "{}",
    form_schema: "[]",
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/complaints/clean-case/actions") {
      writes.push({ body: request.postDataJSON(), headers: request.headers() });
      return route.fulfill({ json: {} });
    }
    const payload: Record<string, unknown> = {
      "/api/auth/me": {
        id: "clean-user",
        role: "FIELD",
        display_name: "Original person",
        department_id: "engineering",
      },
      "/api/auth/csrf": { token: "original-csrf", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { acknowledged: true },
      "/api/catalog": { categories: [], departments: [], queues: [] },
      "/api/complaints": {
        items: [complaint],
        total: 1,
        stats: { total: 1, in_progress: 1, closed: 0, overdue: 0 },
      },
      "/api/complaints/clean-case": {
        complaint,
        actions: [{ action: "DECLINE" }],
        history: [],
        files: [],
        resources: [],
        reports: [],
        reviews: [],
        workOrders: [],
        approvals: [],
        transfers: [],
      },
      "/api/teams": [],
      "/api/people": [],
    };
    return route.fulfill({ json: payload[path] ?? {} });
  });
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "เปิดคิวงาน", exact: true }).click();
  return writes;
}

for (const width of [390, 768, 1280])
  for (const language of ["th", "en"]) {
    test(`one header language control and a clean working action dialog ${language} at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const writes = await workspace(page);
      const headerLanguage = page.locator(".topbar .language-switcher");
      await expect(headerLanguage).toHaveCount(1);
      await headerLanguage.locator(`button[lang="${language}"]`).click();
      await expect(page.locator(".gov-auth-badge")).toHaveCount(0);
      await expect(page.locator(".uat-auth-tools, .uat-auth-host")).toHaveCount(0);
      await page.getByRole("button", { name: /(?:เปิดงาน|Open task) Original title/ }).click();
      await page
        .getByRole("button", {
          name: language === "th" ? "กดปฏิเสธงาน" : "Decline assignment",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator(".language-switcher")).toHaveCount(0);
      await expect(page.locator(".language-switcher")).toHaveCount(1);
      await expect(dialog.getByRole("button", { name: /UAT|Simulation|จำลอง/ })).toHaveCount(0);
      const reason = dialog.getByRole("textbox");
      await reason.fill("Original source reason สมัครสมาชิก");
      await expect(reason).toHaveValue("Original source reason สมัครสมาชิก");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await dialog
        .getByRole("button", { name: language === "th" ? /^ยืนยัน/ : /^Confirm / })
        .click();
      await expect.poll(() => writes.length).toBe(1);
      expect(writes[0].body).toEqual({
        action: "DECLINE",
        version: 7,
        reason: "Original source reason สมัครสมาชิก",
      });
      expect(writes[0].headers["x-csrf-token"]).toBe("original-csrf");
      expect(writes[0].headers["idempotency-key"]).toMatch(/^[\w-]{36}$/);
    });
  }

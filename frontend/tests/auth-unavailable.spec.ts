import { test, expect, type Page } from "@playwright/test";
const authUnavailable =
  "ระบบยืนยันตัวตนส่วนกลางไม่พร้อมให้บริการ (503) กรุณาลองเข้าสู่ระบบอีกครั้ง";
async function workspace(page: Page, role: string, status: string, actions: string[]) {
  const complaint = {
    id: "operational-case",
    title: "Original title",
    category_name: "รายละเอียด",
    address: "Original address",
    description: "Original description",
    status,
    version: 7,
    votes: 0,
    department_id: "engineering",
    answers: "{}",
    assignment_details: JSON.stringify({ appointment: "2026-12-12", urgency: "PRIORITY" }),
    form_schema: "[]",
    due_at: "2026-12-20T00:00:00Z",
  };
  const data: any = {
    complaint,
    actions: actions.map((action) => ({ action })),
    history: [{ action: "ACCEPT", reason: "รายละเอียด", created_at: "2026-11-05T00:00:00Z" }],
    files: [],
    resources: [],
    reports: [],
    reviews: [],
    workOrders: [],
    approvals: [],
    transfers: [],
    approvalStages: 1,
  };
  const writes: { body: any; key: string | undefined }[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/files") && route.request().method() === "POST") {
      const body = route.request().postDataBuffer()!.toString();
      const file = {
        id: "evidence-" + data.files.length,
        original_name: body.match(/filename="([^"]+)"/)?.[1],
        content_type: "image/png",
        evidence_stage: body.match(/name="evidenceStage"\r\n\r\n([^\r]+)/)?.[1],
        uploaded_by: "operator",
        size_bytes: 100,
      };
      data.files.push(file);
      return route.fulfill({ json: { id: file.id } });
    }
    if (path.endsWith("/actions")) {
      writes.push({
        body: route.request().postDataJSON(),
        key: route.request().headers()["idempotency-key"],
      });
      return route.fulfill({ json: {} });
    }
    const responses: Record<string, unknown> = {
      "/api/auth/me": {
        id: "operator",
        role,
        display_name: "Original person",
        department_id: "engineering",
      },
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { acknowledged: true, version: "test" },
      "/api/catalog": {
        categories: [],
        departments: [{ id: "engineering", name: "รายละเอียด" }],
        queues: [],
      },
      "/api/complaints": {
        items: [complaint],
        total: 1,
        stats: { total: 1, in_progress: 1, closed: 0, overdue: 0 },
      },
      "/api/complaints/operational-case": data,
      "/api/teams": [],
      "/api/people": [],
    };
    return route.fulfill({ json: responses[path] ?? {} });
  });
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: /(?:เปิดงาน|Open task) Original title/ }).click();
  return { data, writes };
}

test("real auth me 503 denies entry with a truthful authentication error", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/");
  await expect(page.getByRole("alert").first()).toContainText(authUnavailable);
  await expect(
    page.getByText("แหล่งยืนยันตัวตน: Gov Center · Central Gov Auth RBAC", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".staff-shell")).toHaveCount(0);
});
test("document 503 stays generic instead of claiming a Gov outage", async ({ page }) => {
  await workspace(page, "FIELD", "ASSIGNED", []);
  await page.route("**/api/documents/test", (route) => route.fulfill({ status: 503, json: {} }));
  const message = await page.evaluate(async () => {
    const path = "/src/api.ts";
    return (await import(path)).api("/documents/test").catch((e: Error) => e.message);
  });
  expect(message).toBe("ระบบยังไม่พร้อมให้บริการชั่วคราว กรุณาลองอีกครั้ง");
});
async function authBoundary(page: Page, role: string | null = null) {
  const seen = {
    signedIn: role !== null,
    role: role || "FIELD",
    auth503: false,
    csrfPending: false,
    release: () => {},
  };
  const wait = new Promise<void>((resolve) => (seen.release = resolve));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/csrf") {
      if (seen.csrfPending) await wait;
      return route.fulfill({ json: { token: "test", headerName: "X-CSRF-TOKEN" } });
    }
    if (path === "/api/auth/me")
      return route.fulfill({
        status: seen.signedIn ? 200 : 401,
        json: { id: "auth-user", role: seen.role, display_name: "Account source name" },
      });
    if (path === "/api/auth/gov/password-login") {
      if (seen.auth503)
        return route.fulfill({ status: 503, json: { message: "รายละเอียดต้นฉบับจาก Gov" } });
      seen.signedIn = true;
    }
    if (path === "/api/auth/logout") seen.signedIn = false;
    const data: Record<string, unknown> = {
      "/api/public/gov-auth": {
        configured: true,
        mode: "local",
        iamAuthUrl: "https://auth.govcenter.co",
        serviceCode: "test",
        callbackUrl: new URL("/auth/callback", route.request().url()).href,
      },
      "/api/privacy": { acknowledged: true, version: "test" },
      "/api/catalog": { categories: [], departments: [], queues: [] },
      "/api/complaints": { items: [], total: 0, stats: {} },
    };
    return route.fulfill({ json: data[path] ?? [] });
  });
  return seen;
}

test("citizen page and requests remain usable with the genuine Gov profile", async ({ page }) => {
  await authBoundary(page, "CITIZEN");
  await page.goto("/");
  await expect(page.getByText("สวัสดี, Account source name", { exact: true })).toBeVisible();
  const response = await page.evaluate(async () => {
    const path = "/src/api.ts";
    return (await import(path)).api("/complaints");
  });
  expect(response.items).toEqual([]);
  await page.getByRole("button", { name: "ข้อมูล Gov Center", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("authentication preparation stays busy through CSRF and real login 503 denies access", async ({
  page,
}) => {
  const seen = await authBoundary(page);
  seen.csrfPending = true;
  seen.auth503 = true;
  await page.goto("/");
  await page.getByLabel("อีเมล", { exact: true }).fill("synthetic@example.test");
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  try {
    await expect(page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true })).toHaveClass(
      /ant-btn-loading/,
    );
  } finally {
    seen.release();
  }
  await expect(page.getByRole("alert")).toContainText(authUnavailable);
  await expect(page.getByRole("alert")).toContainText("รายละเอียดต้นฉบับจาก Gov");
  await page.getByRole("combobox", { name: "Language / ภาษา" }).selectOption("en");
  await expect(page.getByRole("alert")).toContainText(
    "Central authentication is unavailable (503). Please try signing in again.",
  );
  await expect(page.getByRole("alert")).toContainText("รายละเอียดต้นฉบับจาก Gov");
  await page.getByRole("combobox", { name: "Language / ภาษา" }).selectOption("th");
  await expect(page.getByRole("alert")).toContainText(authUnavailable);
  await expect(page.locator(".staff-shell")).toHaveCount(0);
  await expect(page.getByLabel("รหัสผ่าน", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true })).not.toHaveClass(
    /ant-btn-loading/,
  );
});

test("local role and password 503 failures do not claim central authentication failed", async ({
  page,
}) => {
  await workspace(page, "FIELD", "ASSIGNED", []);
  for (const endpoint of ["admin-role", "password", "logout", "gov-profile"]) {
    await page.route(`**/api/auth/${endpoint}`, (route) =>
      route.fulfill({ status: 503, json: {} }),
    );
    const message = await page.evaluate(async (endpoint) => {
      const path = "/src/api.ts";
      return (await import(path))
        .api(`/auth/${endpoint}`, { method: "POST", body: "{}" })
        .catch((e: Error) => e.message);
    }, endpoint);
    expect(message).toBe("ระบบยังไม่พร้อมให้บริการชั่วคราว กรุณาลองอีกครั้ง");
  }
});

for (const endpoint of ["/auth/csrf", "/public/gov-auth", "/auth/me", "/auth/gov/password-login"]) {
  for (const detail of [
    "ยืนยันข้อมูลแล้ว",
    "ระบบยังไม่พร้อมให้บริการชั่วคราว กรุณาลองอีกครั้ง",
    "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่",
  ]) {
    test(`auth 503 original detail survives language switching: ${endpoint} / ${detail}`, async ({
      page,
    }) => {
      await authBoundary(page);
      await page.route(`**/api${endpoint}`, (route) =>
        route.fulfill({ status: 503, json: { message: detail } }),
      );
      await page.goto("/");
      if (endpoint === "/auth/csrf" || endpoint === "/auth/gov/password-login") {
        await page.getByLabel("อีเมล", { exact: true }).fill("synthetic@example.test");
        await page.getByLabel("รหัสผ่าน", { exact: true }).fill("synthetic-password");
        await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
      }
      const alert = page.getByRole("alert").first();
      for (const language of ["th", "en", "th"]) {
        await page.getByRole("combobox", { name: "Language / ภาษา" }).selectOption(language);
        await expect(alert.locator(".ant-alert-message")).toHaveText(
          language === "en"
            ? "Central authentication is unavailable (503). Please try signing in again."
            : authUnavailable,
        );
        await expect(alert.locator(".ant-alert-description")).toHaveText(detail, { timeout: 1500 });
        await expect(page.locator(".staff-shell")).toHaveCount(0);
      }
    });
  }
}

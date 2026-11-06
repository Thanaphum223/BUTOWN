import { test, expect, type Page } from "@playwright/test";
import { photo } from "./product-flow";
const toggleName = "จำลองสถานะ Gov กลางขัดข้อง (Test Fail-Closed 503)";
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

async function cycle(page: Page) {
  await page.getByRole("switch", { name: toggleName, exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("503 Service Unavailable - Fail-Closed");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: toggleName })).toBeChecked();
  for (const button of await page.locator(".shell button").all()) await expect(button).toBeHidden();
  const result = await page.evaluate(async () => {
    const path = "/src/api.ts";
    const { api, uploadFile } = await import(path);
    return Promise.all(
      [
        api("/complaints/operational-case"),
        api("/complaints/operational-case/actions", { method: "POST", body: "{}" }),
        uploadFile("/complaints/operational-case/files", new FormData(), () => {}),
      ].map((p) =>
        p.then(
          () => "sent",
          (e: Error) => e.message,
        ),
      ),
    );
  });
  expect(result.every((message) => message.includes("UAT"))).toBe(true);
  await page.getByRole("button", { name: "คืนการเชื่อมต่อปกติ", exact: true }).click();
  await expect(page.getByRole("dialog").first()).toBeVisible();
}
test("portaled reason draft and focused field survive an operable modal toggle", async ({
  page,
}) => {
  const { writes } = await workspace(page, "FIELD", "ASSIGNED", ["DECLINE"]);
  await page.getByRole("button", { name: "กดปฏิเสธงาน", exact: true }).click();
  const reason = page.getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true });
  await reason.fill("Original reason draft");
  await cycle(page);
  await expect(reason).toHaveValue("Original reason draft");
  await expect(reason).toBeFocused();
  expect(writes).toEqual([]);
});
test("resource rows survive simulation without remount", async ({ page }) => {
  await workspace(page, "LEADER", "RESOURCE_DRAFT", ["PROPOSE"]);
  await page.getByRole("button", { name: "ส่งข้อเสนอทรัพยากร", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ชื่อคำขอทรัพยากร", { exact: true }).fill("Original proposal");
  await dialog.getByRole("textbox", { name: "ชื่อรายการ 1", exact: true }).fill("Original sand");
  await dialog.getByRole("spinbutton", { name: "ราคารายการ 1", exact: true }).fill("125");
  await cycle(page);
  await expect(dialog.getByLabel("ชื่อคำขอทรัพยากร", { exact: true })).toHaveValue(
    "Original proposal",
  );
  await expect(dialog.getByRole("textbox", { name: "ชื่อรายการ 1", exact: true })).toHaveValue(
    "Original sand",
  );
  await expect(dialog.getByRole("spinbutton", { name: "ราคารายการ 1", exact: true })).toHaveValue(
    "125",
  );
});
test("report text and attached evidence survive simulation", async ({ page }) => {
  await workspace(page, "FIELD", "IN_PROGRESS", ["REPORT"]);
  await page.getByRole("button", { name: "ส่งรายงานผล", exact: true }).click();
  const text = page.getByLabel("ข้อเท็จจริงและผลดำเนินการ", { exact: true });
  await text.fill("Original report draft");
  await page
    .locator('.field-evidence-steps input[type="file"]')
    .first()
    .setInputFiles(photo("original-before.png"));
  await expect(page.getByRole("link", { name: "original-before.png", exact: true })).toBeVisible();
  await text.focus();
  await cycle(page);
  await expect(text).toHaveValue("Original report draft");
  await expect(page.getByRole("link", { name: "original-before.png", exact: true })).toBeVisible();
});
for (const pending of ["csrf", "post", "upload", "upload-csrf"] as const) {
  test(`entry stays disabled for the whole ${pending} attempt`, async ({ page }) => {
    await workspace(page, "FIELD", pending.startsWith("upload") ? "IN_PROGRESS" : "ASSIGNED", [
      pending.startsWith("upload") ? "REPORT" : "DECLINE",
    ]);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => (release = resolve));
    let received = false;
    const path =
      pending === "csrf" || pending === "upload-csrf"
        ? "**/api/auth/csrf"
        : pending.startsWith("upload")
          ? "**/api/complaints/operational-case/files"
          : "**/api/complaints/operational-case/actions";
    await page.route(path, async (route) => {
      received = true;
      await wait;
      await route.fallback();
    });
    await page
      .getByRole("button", {
        name: pending.startsWith("upload") ? "ส่งรายงานผล" : "กดปฏิเสธงาน",
        exact: true,
      })
      .click();
    if (pending.startsWith("upload"))
      await page
        .locator('.field-evidence-steps input[type="file"]')
        .first()
        .setInputFiles(photo("pending.png"));
    else {
      await page
        .getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true })
        .fill("Pending synthetic reason");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /^ยืนยัน/ })
        .click();
    }
    try {
      await expect.poll(() => received).toBe(true);
      await expect(page.getByRole("switch", { name: toggleName, exact: true })).toBeDisabled();
      await expect(
        page.getByRole("dialog").getByRole("button", { name: "จำลอง / UAT", exact: true }),
      ).toBeDisabled();
    } finally {
      release();
    }
    await expect(page.getByRole("switch", { name: toggleName, exact: true })).toBeEnabled();
  });
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
  await expect(page.getByRole("switch", { name: toggleName })).not.toBeChecked();
});
for (const width of [390, 768, 1280])
  for (const language of ["th", "en"]) {
    test(`badge toolbar and blocker fit ${language} at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (language) => localStorage.setItem("towntrack.language", language),
        language,
      );
      await workspace(page, "FIELD", "ASSIGNED", ["DECLINE"]);
      await expect(page.locator(".gov-auth-badge")).toBeVisible();
      await page.screenshot({
        path: `../work/task5/badge-toolbar-${language}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page
        .getByRole("button", {
          name: language === "th" ? "กดปฏิเสธงาน" : "Decline assignment",
          exact: true,
        })
        .click();
      const reason = page.getByRole("dialog").getByRole("textbox");
      await reason.fill("Original responsive draft");
      await reason.scrollIntoViewIfNeeded();
      await expect(page.getByRole("dialog")).toHaveCSS("transform", "none");
      await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
      const reasonBox = await reason.boundingBox();
      const toolsBox = await page.locator(".uat-auth-tools").boundingBox();
      expect(reasonBox!.y + reasonBox!.height).toBeLessThanOrEqual(toolsBox!.y);
      await page.screenshot({
        path: `../work/task5/draft-toolbar-${language}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page.getByRole("switch").click();
      await expect(page.getByRole("alert")).toContainText("503 Service Unavailable - Fail-Closed");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await page.locator(".uat-auth-tools").boundingBox())!.width).toBeLessThanOrEqual(
        width,
      );
      await page.screenshot({
        path: `../work/task5/blocker-${language}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    });
  }

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
        callbackUrl: "http://127.0.0.1:5175/auth/callback",
      },
      "/api/privacy": { acknowledged: true, version: "test" },
      "/api/catalog": { categories: [], departments: [], queues: [] },
      "/api/complaints": { items: [], total: 0, stats: {} },
    };
    return route.fulfill({ json: data[path] ?? [] });
  });
  return seen;
}

test("citizen page and requests remain usable without an internal toolbar", async ({ page }) => {
  await authBoundary(page, "CITIZEN");
  await page.goto("/");
  await expect(page.getByText("สวัสดี, Account source name", { exact: true })).toBeVisible();
  await expect(page.locator(".uat-auth-tools")).toHaveCount(0);
  const response = await page.evaluate(async () => {
    const path = "/src/api.ts";
    return (await import(path)).api("/complaints");
  });
  expect(response.items).toEqual([]);
  await page.getByRole("button", { name: "ข้อมูล Gov Center", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("authentication preparation locks simulation before explicit CSRF and real login 503 denies access", async ({
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
    await expect(page.getByRole("switch", { name: toggleName })).toBeDisabled();
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
  await expect(page.getByRole("switch", { name: toggleName })).toBeEnabled();
});

test("login simulation preserves credentials and resets across logout and account changes", async ({
  page,
}) => {
  const seen = await authBoundary(page);
  await page.goto("/");
  const email = page.getByLabel("อีเมล", { exact: true });
  await email.fill("synthetic@example.test");
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill("synthetic-password");
  await page.getByRole("switch", { name: toggleName }).click();
  await expect(page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "คืนการเชื่อมต่อปกติ", exact: true }).click();
  await expect(email).toHaveValue("synthetic@example.test");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByText("Account source name", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: toggleName })).not.toBeChecked();
  await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
  await expect(email).toBeVisible();
  await expect(page.getByRole("switch", { name: toggleName })).not.toBeChecked();
  seen.role = "CITIZEN";
  await email.fill("other@example.test");
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByText("สวัสดี, Account source name", { exact: true })).toBeVisible();
  await expect(page.locator(".uat-auth-tools")).toHaveCount(0);
});

test("denial confirmation portal remains mounted and hidden during simulation", async ({
  page,
}) => {
  const { writes } = await workspace(page, "APPROVER", "RESOURCE_APPROVAL", ["DENY"]);
  await page.getByRole("button", { name: /^ไม่อนุมัติงบประมาณเฉพาะกิจ/ }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Original denial draft");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^ยืนยัน/ })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(2);
  await cycle(page);
  await expect(page.getByRole("dialog")).toHaveCount(2);
  await expect(page.getByRole("dialog").last()).toContainText("Original denial draft");
  expect(writes).toEqual([]);
});

test("a portaled selection and its typed search survive the simulation gate", async ({ page }) => {
  await workspace(page, "LEADER", "TRIAGED", ["ASSIGN"]);
  await page.getByRole("button", { name: "มอบหมายทีม", exact: true }).click();
  const select = page
    .getByRole("dialog")
    .getByRole("combobox", { name: "ผู้ลงพื้นที่", exact: true });
  await select.fill("Original search draft");
  await expect(page.locator(".ant-select-dropdown:visible")).toHaveCount(1);
  await page.getByRole("switch", { name: toggleName }).click();
  await expect(page.locator(".ant-select-dropdown")).toHaveCount(1);
  await expect(page.locator(".ant-select-dropdown")).toBeHidden();
  await page.getByRole("button", { name: "คืนการเชื่อมต่อปกติ", exact: true }).click();
  await expect(select).toHaveValue("Original search draft");
  await expect(select).toBeFocused();
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

test("keyboard can enter UAT from an active draft dialog and restore focus and data", async ({
  page,
}) => {
  const { writes } = await workspace(page, "FIELD", "ASSIGNED", ["DECLINE"]);
  await page.getByRole("button", { name: "กดปฏิเสธงาน", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const reason = dialog.getByLabel("เหตุผล / บันทึกการดำเนินการ", { exact: true });
  await reason.fill("Keyboard draft stays original");
  const entry = dialog.getByRole("button", { name: "จำลอง / UAT", exact: true });
  for (
    let i = 0;
    i < 12 && !(await entry.evaluateAll((nodes) => nodes.includes(document.activeElement!)));
    i++
  )
    await page.keyboard.press("Tab");
  await expect(entry).toBeFocused();
  await page.keyboard.press("Enter");
  const restore = page.getByRole("button", { name: "คืนการเชื่อมต่อปกติ", exact: true });
  await expect(restore).toBeFocused();
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(entry).toBeFocused();
  await expect(reason).toHaveValue("Keyboard draft stays original");
  expect(writes).toEqual([]);
});

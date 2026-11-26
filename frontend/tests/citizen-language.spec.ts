import { switchLanguage } from "./language-control";
import { test, expect, type Page } from "@playwright/test";
import { openReport, confirmLocation, photo } from "./product-flow";
async function fixture(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/complaints" && route.request().method() === "POST")
      return route.fulfill({ status: 503, json: { message: "กรุณาลองใหม่" } });
    const data: Record<string, unknown> = {
      "/api/auth/me": { id: "citizen-language", display_name: "ชื่อบัญชีเดิม", role: "CITIZEN" },
      "/api/auth/csrf": { token: "mock", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/auth/gov-profile": { linked: true, profile: { email: "original@example.test" } },
      "/api/catalog": {
        categories: [{ id: "custom-category", name: "หมวดข้อมูลเทศบาลต้นฉบับ", fields: "[]" }],
        departments: [],
        queues: [],
      },
      "/api/municipal-center": { latitude: 13.75, longitude: 100.5 },
      "/api/public/map-config": { provider: "leaflet", publicToken: "" },
      "/api/community/complaints": { items: [], top: [], total: 0, stats: {} },
      "/api/nearby": [],
      "/api/geocoding/reverse": { display_name: "ที่อยู่ต้นฉบับ" },
    };
    return route.fulfill({ json: data[path] ?? {} });
  });
  await page.route("https://**/*", (route) => route.abort());
}
for (const width of [390, 768, 1280]) {
  test(`citizen draft, selected point, attachment and retry payload survive both languages at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    await page.goto("/");
    await openReport(page);
    await page.locator("summary").filter({ hasText: "ดูหรือแก้ไขพิกัด GPS" }).click();
    await page.getByRole("spinbutton", { name: "ละติจูด", exact: true }).fill("13.752");
    await page.getByRole("spinbutton", { name: "ลองจิจูด", exact: true }).fill("100.502");
    await confirmLocation(page, "สถานที่ที่ผู้แจ้งพิมพ์");
    await page.getByRole("button", { name: /หมวดข้อมูลเทศบาลต้นฉบับ/ }).click();
    await page.getByLabel("หัวข้อปัญหา (ไม่บังคับ)", { exact: true }).fill("หัวข้อที่ผู้ใช้เขียน");
    await page.getByLabel("รายละเอียด", { exact: true }).fill("รายละเอียดประชาชนต้นฉบับ ห้ามแปล");
    await page.getByLabel("ชื่อ–นามสกุล (ไม่บังคับ)", { exact: true }).fill("ชื่อผู้แจ้งต้นฉบับ");
    const phone = page.getByLabel("เบอร์ติดต่อ (ไม่บังคับ)", { exact: true });
    await expect(phone).toBeEmpty();
    await phone.pressSequentially("081-234-5678-99");
    await expect(phone).toHaveValue("0812345678");
    await phone.fill("0812345678");
    await page.locator('input[type="file"][multiple]').setInputFiles(photo("หลักฐานต้นฉบับ.png"));
    const requests: { body: string; key: string | undefined }[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/complaints" && request.method() === "POST")
        requests.push({ body: request.postData()!, key: request.headers()["idempotency-key"] });
    });
    for (const language of ["en", "th", "en"]) {
      await page.locator(`.language-switcher button[lang="${language}"]`).click();
      const en = language === "en";
      await expect(
        page.getByRole("heading", {
          name: en ? "Problem details" : "รายละเอียดปัญหา",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByLabel(en ? "Description" : "รายละเอียด", {
          exact: true,
        }),
      ).toHaveValue("รายละเอียดประชาชนต้นฉบับ ห้ามแปล");
      await expect(
        page.getByLabel(en ? "Problem title (optional)" : "หัวข้อปัญหา (ไม่บังคับ)", {
          exact: true,
        }),
      ).toHaveValue("หัวข้อที่ผู้ใช้เขียน");
      await expect(page.getByLabel(en ? "Email" : "อีเมล", { exact: true })).toHaveValue(
        "original@example.test",
      );
      await expect(page.getByLabel(en ? "Email" : "อีเมล", { exact: true })).not.toBeEditable();
      await expect(page.getByRole("button", { name: /หมวดข้อมูลเทศบาลต้นฉบับ/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByText("หลักฐานต้นฉบับ.png", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (language === "th") {
        await page.getByRole("button", { name: "ส่งคำร้อง", exact: true }).click();
        await expect.poll(() => requests.length).toBe(1);
        await expect(page.locator(".wizard-actions .ant-btn-loading")).toHaveCount(0);
      }
    }
    await page
      .getByLabel("Full name (optional)", { exact: true })
      .evaluate((input) => input.scrollIntoView({ block: "center" }));
    await page.screenshot({
      path: `../work/screenshots/citizen-language-en-${width}.png`,
      fullPage: false,
    });
    await page.getByRole("button", { name: /Submit report$/ }).click();
    await expect.poll(() => requests.length).toBe(2);
    const complaint = (body: string) => JSON.parse(body.match(/\r\n\r\n(\{[^\r\n]+\})/)![1]);
    expect(complaint(requests[1].body)).toEqual(complaint(requests[0].body));
    expect(complaint(requests[1].body)).toMatchObject({
      categoryId: "custom-category",
      latitude: 13.752,
      longitude: 100.502,
      contactPhone: "0812345678",
      contactName: "ชื่อผู้แจ้งต้นฉบับ",
    });
    expect(requests[1].key).toBe(requests[0].key);
    expect(requests[1].body).toContain('filename="หลักฐานต้นฉบับ.png"');
    await page.getByRole("button", { name: "ภาษาไทย", exact: true }).click();
    await page
      .getByLabel("ชื่อ–นามสกุล (ไม่บังคับ)", { exact: true })
      .evaluate((input) => input.scrollIntoView({ block: "center" }));
    await page.screenshot({
      path: `../work/screenshots/citizen-language-th-${width}.png`,
      fullPage: false,
    });
  });
}

test("existing citizen validation errors switch language without resetting the report", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await openReport(page);
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await expect(page.getByText("กรุณาระบุสถานที่หรือจุดสังเกต", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(
    page.getByText("Please enter a location or landmark", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Location / landmark", { exact: true }).fill("สถานที่ต้นฉบับ");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Confirm incident location" })).toContainText(
    "สถานที่ต้นฉบับ",
  );
});

test("public evidence keeps source categories, filenames and recorded reasons in both header languages", async ({
  page,
}) => {
  await fixture(page);
  const category = "สมัครสมาชิก";
  const row = {
    id: "public-evidence",
    category_name: category,
    status: "TERMINATED",
    created_at: "2026-11-01T01:00:00Z",
    updated_at: "2026-11-05T02:00:00Z",
    latitude: 13.75,
    longitude: 100.5,
    votes: 0,
    media_count: 1,
  };
  await page.route("**/api/community/complaints?**", (route) =>
    route.fulfill({ json: { items: [row], top: [], total: 1, stats: { total: 1 } } }),
  );
  await page.route("**/api/community/complaints/public-evidence", (route) =>
    route.fulfill({
      json: {
        complaint: row,
        media: [
          {
            id: "evidence-pdf",
            original_name: "สมัครสมาชิก.pdf",
            content_type: "application/pdf",
            size_bytes: 30_000_000,
          },
        ],
        history: [
          {
            action: "DENY",
            to_status: "TERMINATED",
            reason: "สมัครสมาชิก",
            created_at: row.updated_at,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  for (const language of ["th", "en"]) {
    await switchLanguage(page, language);
    await page
      .getByRole("button", {
        name: language === "th" ? "ดูรายละเอียด" : "View details",
        exact: true,
      })
      .click();
    const detail = page.getByRole("dialog");
    await expect(detail.locator(".language-switcher")).toHaveCount(0);
    await expect(detail.getByRole("heading", { name: category, exact: true })).toBeVisible();
    await expect(detail.locator(".citizen-outcome-reason")).toHaveText("สมัครสมาชิก");
    await expect(detail).toContainText(
      language === "th" ? "เหตุผลที่ไม่อนุมัติและยุติเรื่อง" : "Reason for denial and termination",
    );
    await expect(detail).toContainText(language === "th" ? "ยุติเรื่องตามผลพิจารณา" : "Terminated");
    await detail
      .getByRole("button", { name: language === "th" ? /ดูเอกสาร$/ : /View document$/ })
      .click();
    const pdf = page.getByRole("dialog", { name: "สมัครสมาชิก.pdf", exact: true });
    await expect(pdf.locator(".language-switcher")).toHaveCount(0);
    await expect(pdf).toContainText(
      language === "th" ? "เอกสารขนาดใหญ่" : "This document is large.",
    );
    await expect(
      pdf.getByRole("link", {
        name: language === "th" ? /ดาวน์โหลดเอกสารต้นฉบับ$/ : /Download original document$/,
      }),
    ).toHaveAttribute("href", "/api/media/evidence-pdf");
    await pdf.getByRole("button", { name: "Close", exact: true }).click();
    await expect(detail).toContainText("สมัครสมาชิก.pdf");
    await detail.getByRole("button", { name: "Close", exact: true }).click();
  }
});

test("emergency links and Leaflet zoom controls follow language without changing the chosen point", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await page.getByRole("link", { name: /เหตุฉุกเฉิน/ }).click();
  const emergency = page.locator(".emergency-page");
  await expect(
    emergency.getByRole("link", { name: "โทร 199 แจ้งเหตุเพลิงไหม้", exact: true }),
  ).toHaveAttribute("href", "tel:199");
  await emergency.locator("summary").filter({ hasText: "เลือกจุดค้นหาบนแผนที่เอง" }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(
    emergency.getByRole("link", { name: "Call 199 Report a fire", exact: true }),
  ).toHaveAttribute("href", "tel:199");
  await expect(emergency.getByRole("button", { name: "Zoom in", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ภาษาไทย", exact: true }).click();
  await expect(emergency.getByRole("button", { name: "ซูมเข้า", exact: true })).toBeVisible();
});

test("Mapbox fallback translates controls and statuses while keeping stored category data", async ({
  page,
}) => {
  await fixture(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
      return type.startsWith("webgl") ? null : original.call(this, type as any, ...args);
    } as typeof original;
  });
  await page.route("**/api/public/map-config", (route) =>
    route.fulfill({ json: { provider: "mapbox", publicToken: "mock" } }),
  );
  const row = {
    id: "fallback-row",
    category_name: "สมัครสมาชิก",
    status: "NEW",
    created_at: "2026-11-01T01:00:00Z",
    latitude: 13.75,
    longitude: 100.5,
  };
  await page.route("**/api/community/complaints?**", (route) =>
    route.fulfill({ json: { items: [row], top: [], total: 1, stats: { total: 1, closed: 0 } } }),
  );
  await page.goto("/");
  const panel = page.locator(".community-map-panel");
  await expect(panel.getByRole("button", { name: "ลองโหลดแผนที่ใหม่", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Retry loading map", exact: true })).toBeVisible();
  await expect(panel.getByRole("cell", { name: "สมัครสมาชิก", exact: true })).toBeVisible();
  await expect(panel.getByRole("cell", { name: "Awaiting intake", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ภาษาไทย", exact: true }).click();
  await expect(panel.getByRole("cell", { name: "รอรับเรื่อง", exact: true })).toBeVisible();
});

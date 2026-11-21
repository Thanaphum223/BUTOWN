import { test, expect, type Page } from "@playwright/test";
import { switchLanguage } from "./language-control";
import { confirmLocation } from "./product-flow";

async function fixture(page: Page, role = "OFFICER") {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") throw new Error("Unexpected business mutation");
    const responses: Record<string, unknown> = {
      "/api/auth/me": {
        id: "dialog-user",
        display_name: "Original person",
        role,
        account_role: "ADMIN",
      },
      "/api/privacy": { acknowledged: true },
      "/api/catalog": { categories: [], departments: [], queues: [] },
      "/api/admin/departments": [],
      "/api/teams": [],
      "/api/people": [],
      "/api/complaints": { items: [], total: 0, stats: {} },
      "/api/community/complaints": { items: [], top: [], total: 0, stats: {} },
      "/api/municipal-center": { latitude: 13.75, longitude: 100.5 },
      "/api/public/map-config": { provider: "leaflet", publicToken: "" },
      "/api/nearby": [],
    };
    await route.fulfill({ json: responses[path] ?? {} });
  });
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
}
test("manual location confirmation waits for modal animation before continuing", async ({
  page,
}) => {
  await fixture(page, "CITIZEN");
  await page.addStyleTag({
    content: ".ant-modal.ant-zoom-appear { animation-duration: 800ms !important; }",
  });
  await page.getByRole("link", { name: /แจ้งปัญหา/ }).click();
  await confirmLocation(page, "Manual landmark without GPS");
  await expect(page.getByLabel("หัวข้อปัญหา (ไม่บังคับ)", { exact: true })).toBeVisible();
});
for (const width of [390, 768, 1280])
  for (const language of ["th", "en"]) {
    test(`header role selector is bounded readable and operable ${language} at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (language) => localStorage.setItem("towntrack.language", language),
        language,
      );
      await fixture(page);
      if (width < 992)
        await page
          .getByRole("button", {
            name: language === "en" ? "Switch role" : "สลับบทบาท",
            exact: true,
          })
          .click();
      const control = page.locator(".admin-role-controls .ant-select").last();
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      const label = control.locator(".ant-select-selection-item");
      await expect
        .poll(() =>
          label.evaluate(
            (el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight,
          ),
        )
        .toBe(true);
      await control.click();
      const option = page.locator(".ant-select-dropdown:visible .ant-select-item-option-selected");
      await expect(option).toBeVisible();
      await expect
        .poll(() =>
          option.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth && el.scrollWidth <= el.clientWidth;
          }),
        )
        .toBe(true);
      await page.keyboard.press("Escape");
      await page.screenshot({
        path: `../work/screenshots/final-header-${language}-${width}.png`,
        animations: "disabled",
      });
    });
  }

for (const language of ["th", "en"]) {
  test(`location confirmation has no language control and preserves the chosen point and address in ${language}`, async ({
    page,
  }) => {
    await fixture(page, "CITIZEN");
    await page.getByRole("link", { name: /แจ้งปัญหา/ }).click();
    await page.locator("summary").filter({ hasText: "ดูหรือแก้ไขพิกัด GPS" }).click();
    await page.getByRole("spinbutton", { name: "ละติจูด", exact: true }).fill("13.752");
    await page.getByRole("spinbutton", { name: "ลองจิจูด", exact: true }).fill("100.502");
    await page.getByLabel("สถานที่ / จุดสังเกต", { exact: true }).fill("Original landmark");
    await switchLanguage(page, language);
    await page
      .getByRole("button", { name: language === "th" ? "ถัดไป" : "Next", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".language-switcher")).toHaveCount(0);
    // Ant Design retains the dismissed standalone privacy gate in hidden DOM.
    await expect(page.locator(".topbar .language-switcher")).toHaveCount(1);
    await expect(dialog).toContainText("Original landmark");
    await expect(dialog).toContainText("13.752");
    await expect(dialog).toContainText("100.502");
    await expect(dialog.getByRole("button", { name: /UAT/ })).toHaveCount(0);
    await dialog
      .getByRole("button", {
        name: language === "th" ? "ยืนยันตำแหน่ง" : "Confirm location",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: language === "th" ? "รายละเอียดปัญหา" : "Problem details",
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("password error uses the known local translation and preserves unknown server text exactly", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("towntrack.language", "en"));
  await fixture(page);
  await page.getByRole("menuitem", { name: /Change password$/ }).click();
  await page.getByLabel("Current password", { exact: true }).fill("Original-password-123");
  await page
    .getByLabel("New password (at least 12 characters)", { exact: true })
    .fill("New-password-123");
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { token: "test", headerName: "X-CSRF-TOKEN" } }),
  );
  const attempts: any[] = [];
  const unknown = "รายละเอียดที่เทศบาลเขียนเอง {{name}} / Gov custom detail";
  await page.route("**/api/auth/password", (route) => {
    attempts.push(route.request().postDataJSON());
    return route.fulfill({
      status: 400,
      json: { message: attempts.length === 1 ? "รหัสผ่านเดิมไม่ถูกต้อง" : unknown },
    });
  });
  await page.getByRole("button", { name: "Save new password", exact: true }).click();
  await expect(page.getByText("The current password is incorrect.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save new password", exact: true }).click();
  await expect(page.getByText(unknown, { exact: true })).toBeVisible();
  expect(attempts).toEqual(
    Array(2).fill({ currentPassword: "Original-password-123", newPassword: "New-password-123" }),
  );
});

test("known local access error follows language without changing server detail", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/complaints?**", (route) =>
    route.fulfill({ status: 404, json: { message: "ไม่พบข้อมูลหรือไม่มีสิทธิ์" } }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("ไม่พบข้อมูลหรือไม่มีสิทธิ์");
  await switchLanguage(page, "en");
  await expect(page.getByRole("alert")).toContainText(
    "The record was not found or you do not have permission.",
  );
});

for (const language of ["th", "en"]) {
  test(`team creation uses header language and preserves team and member drafts in ${language}`, async ({
    page,
  }) => {
    await fixture(page, "LEADER");
    await page.route("**/api/people?role=FIELD", (route) =>
      route.fulfill({ json: [{ id: "field-original", display_name: "Original member" }] }),
    );
    await page.getByRole("menuitem", { name: /ทีมลงพื้นที่$/ }).click();
    await switchLanguage(page, language);
    await page
      .getByRole("button", { name: language === "th" ? "สร้างทีม" : "Create team", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const teamName = dialog.getByLabel(language === "th" ? "ชื่อทีม" : "Team name", {
      exact: true,
    });
    await teamName.fill("Original team draft");
    await dialog.getByRole("checkbox", { name: "Original member" }).check();
    await expect(dialog.locator(".language-switcher")).toHaveCount(0);
    await expect(teamName).toHaveValue("Original team draft");
    await expect(dialog.locator(".member-chip")).toContainText("Original member");
  });
}

for (const language of ["th", "en"])
  for (const stage of ["module-loading", "reader-loading", "module-failure"] as const) {
    test(`PDF ${stage} overlay uses header language ${language} and preserves the source file`, async ({
      page,
    }) => {
      await fixture(page, "CITIZEN");
      const complaint = {
        id: "pdf-case",
        category_name: "Original category",
        status: "NEW",
        created_at: "2026-11-01T00:00:00Z",
        votes: 0,
      };
      await page.route("**/api/community/complaints?**", (route) =>
        route.fulfill({ json: { items: [complaint], top: [], total: 1, stats: {} } }),
      );
      await page.route("**/api/community/complaints/pdf-case", (route) =>
        route.fulfill({
          json: {
            complaint,
            history: [],
            media: [
              {
                id: "pdf-file",
                original_name: "Original file.pdf",
                content_type: "application/pdf",
                size_bytes: 100,
              },
            ],
          },
        }),
      );
      let release!: () => void;
      const pending = new Promise<void>((resolve) => (release = resolve));
      if (stage.startsWith("module")) {
        await page.route("**/src/PdfPreview.tsx*", async (route) => {
          if (stage === "module-failure") return route.abort();
          await pending;
          await route.continue();
        });
      } else {
        await page.route("**/api/media/pdf-file", async (route) => {
          await pending;
          await route.fulfill({ status: 403, json: {} });
        });
      }
      await page.reload();
      await switchLanguage(page, language);
      await page
        .getByRole("button", {
          name: language === "th" ? "ดูรายละเอียด" : "View details",
          exact: true,
        })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: language === "th" ? /ดูเอกสาร$/ : /View document$/ })
        .click();
      const overlay = page.getByRole("dialog").last();
      try {
        if (stage === "reader-loading")
          await expect(
            page.getByRole("dialog", { name: "Original file.pdf", exact: true }),
          ).toBeVisible();
        await expect(overlay.locator(".language-switcher")).toHaveCount(0);
        // Ant Design retains the dismissed standalone privacy gate in hidden DOM.
        await expect(page.locator(".topbar .language-switcher")).toHaveCount(1);
        if (stage === "module-failure")
          await expect(overlay).toContainText(
            language === "th"
              ? "เปิดโปรแกรมอ่านเอกสารไม่ได้"
              : "Could not open the document reader",
          );
        else
          await expect(overlay).toContainText(
            language === "th" ? "กำลังเปิดเอกสาร" : "Opening document",
          );
      } finally {
        release();
      }
      if (stage !== "module-failure")
        await expect(
          page.getByRole("dialog", { name: "Original file.pdf", exact: true }),
        ).toBeVisible();
      const download = page
        .getByRole("dialog")
        .last()
        .getByRole("link", {
          name: language === "th" ? /ดาวน์โหลดเอกสารต้นฉบับ$/ : /Download original document$/,
        });
      await expect(download).toHaveAttribute("href", "/api/media/pdf-file");
    });
  }

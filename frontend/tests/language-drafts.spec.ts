import { expect, test, type Page } from "@playwright/test";

async function authBoundary(page: Page, signedIn = false) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data: Record<string, unknown> = {
      "/api/public/gov-auth": {
        configured: true,
        mode: "local",
        iamAuthUrl: "https://auth.govcenter.co",
        serviceCode: "test",
        callbackUrl: "http://127.0.0.1:5173/auth/callback",
      },
      "/api/auth/me": { id: "language-user", display_name: "ชื่อบัญชีเดิม", role: "CITIZEN" },
      "/api/privacy": {
        version: "test",
        text: "ประกาศฉบับต้นฉบับที่เทศบาลจัดทำ",
        acknowledged: false,
      },
    };
    if (path === "/api/auth/me" && !signedIn)
      return route.fulfill({ status: 401, json: { message: "Sign in" } });
    if (route.request().method() !== "GET") throw new Error("This draft test must never submit");
    await route.fulfill({ json: data[path] ?? {} });
  });
}

for (const mode of ["login", "register"] as const) {
  test(`${mode} draft uses the stored language and language persists after reload`, async ({
    page,
  }) => {
    await authBoundary(page);
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("towntrack.language", "en"));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    if (mode === "register") {
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await page.getByLabel("Full name", { exact: true }).fill("ชื่อร่างที่ผู้ใช้กรอก");
      await page.getByLabel("Confirm password", { exact: true }).fill("Draft-password-123");
    }
    await page.getByLabel("Email", { exact: true }).fill("draft@example.test");
    await page.getByLabel("Password", { exact: true }).fill("Draft-password-123");
    await expect(
      page.getByRole("heading", {
        name: mode === "register" ? "Create account" : "Sign in",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("draft@example.test");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("Draft-password-123");
    if (mode === "register") {
      await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
        "ชื่อร่างที่ผู้ใช้กรอก",
      );
      await expect(page.getByLabel("Confirm password", { exact: true })).toHaveValue(
        "Draft-password-123",
      );
    }
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(await page.evaluate(() => localStorage.getItem("towntrack.language"))).toBe("en");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(await page.evaluate(() => localStorage.getItem("towntrack.language"))).toBe("en");
  });
}

test("blocked storage still allows an unsent authentication draft", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
  });
  await authBoundary(page);
  await page.goto("/");
  await page.getByLabel("อีเมล", { exact: true }).fill("memory@example.test");
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill("Memory-password-123");
  await expect(page.getByLabel("อีเมล", { exact: true })).toHaveValue("memory@example.test");
  await expect(page.getByLabel("รหัสผ่าน", { exact: true })).toHaveValue("Memory-password-123");
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
});

test("privacy uses the stored language while the original policy and account name remain intact", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("towntrack.language", "en"));
  await authBoundary(page, true);
  await page.goto("/");
  await expect(page.getByRole("dialog")).toContainText("Privacy notice");
  await expect(page.getByRole("dialog")).toContainText("ประกาศฉบับต้นฉบับที่เทศบาลจัดทำ");
  await page.route("**/api/privacy", (route) =>
    route.fulfill({ json: { version: "test", acknowledged: true } }),
  );
  await page.reload();
  await expect(page.getByText("Hello, ชื่อบัญชีเดิม", { exact: true })).toBeVisible();
});

for (const language of ["th", "en"]) {
  test(`validation errors use stored ${language} without clearing the draft`, async ({ page }) => {
    const en = language === "en";
    await page.addInitScript(
      (language) => localStorage.setItem("towntrack.language", language),
      language,
    );
    await authBoundary(page);
    await page.goto("/");
    await page
      .getByRole("button", { name: en ? "Create account" : "สมัครสมาชิก", exact: true })
      .click();
    await page.getByLabel(en ? "Full name" : "ชื่อ-นามสกุล", { exact: true }).fill("ร่างตรวจสอบ");
    await page.getByLabel(en ? "Email" : "อีเมล", { exact: true }).fill("draft@example.test");
    await page.getByLabel(en ? "Password" : "รหัสผ่าน", { exact: true }).fill("Draft-password-123");
    await page
      .getByLabel(en ? "Confirm password" : "ยืนยันรหัสผ่าน", { exact: true })
      .fill("Different-password");
    await page
      .getByRole("button", {
        name: en ? "Create account and sign in" : "สมัครและเข้าสู่ระบบ",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(en ? "Passwords do not match" : "รหัสผ่านไม่ตรงกัน", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(en ? "Full name" : "ชื่อ-นามสกุล", { exact: true })).toHaveValue(
      "ร่างตรวจสอบ",
    );
    await expect(page.getByLabel(en ? "Email" : "อีเมล", { exact: true })).toHaveValue(
      "draft@example.test",
    );
    await expect(page.getByLabel(en ? "Password" : "รหัสผ่าน", { exact: true })).toHaveValue(
      "Draft-password-123",
    );
    await expect(
      page.getByLabel(en ? "Confirm password" : "ยืนยันรหัสผ่าน", { exact: true }),
    ).toHaveValue("Different-password");
  });
}

test("profile follows header language while preserving original profile and residence data", async ({
  page,
}) => {
  await authBoundary(page, true);
  await page.route("**/api/privacy", (route) =>
    route.fulfill({ json: { version: "test", acknowledged: true } }),
  );
  await page.route("**/api/auth/gov-profile", (route) =>
    route.fulfill({
      json: {
        linked: true,
        profile: { id: "profile", name: "สมัครสมาชิก", email: "original@example.test" },
        residences: [
          {
            residenceId: "residence",
            address: "บ้านเดิม เลขที่ 12",
            memberStatus: "ACTIVE",
            residenceStatus: "VERIFIED",
            canUseForOfficialTransaction: true,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "ข้อมูล Gov Center", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("สมัครสมาชิก", { exact: true })).toBeVisible();
  await expect(drawer.locator(".language-switcher")).toHaveCount(0);
  await drawer.getByRole("button", { name: "ปิด", exact: true }).click();
  await page.getByRole("combobox", { name: "Language / ภาษา", exact: true }).selectOption("en");
  await page.getByRole("button", { name: "Gov Center profile", exact: true }).click();
  await expect(drawer).toContainText("Gov Center profile");
  await expect(drawer).toContainText("Linked residences");
  await expect(drawer.getByText("สมัครสมาชิก", { exact: true })).toBeVisible();
  await expect(drawer.getByText("บ้านเดิม เลขที่ 12", { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("combobox", { name: "Language / ภาษา", exact: true }).selectOption("th");
  await page.getByRole("button", { name: "ข้อมูล Gov Center", exact: true }).click();
  await expect(drawer).toContainText("ข้อมูล Gov Center");
});

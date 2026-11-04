import { test, expect, type Page } from "@playwright/test";
test.setTimeout(20000);
async function boundary(page: Page) {
  const seen = {
    starts: [] as any[],
    requests: [] as any[],
    signedIn: false,
    failure: "",
    delay: Promise.resolve(),
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/public/gov-auth")
      return route.fulfill({
        json: {
          configured: true,
          mode: "local",
          iamAuthUrl: "https://auth.govcenter.co",
          serviceCode: "town-track",
          callbackUrl: "http://127.0.0.1:5173/auth/callback",
        },
      });
    if (path === "/api/auth/csrf")
      return route.fulfill({ json: { token: "test-csrf", headerName: "X-CSRF-TOKEN" } });
    if (path === "/api/auth/me")
      return seen.signedIn
        ? route.fulfill({
            json: {
              id: "verified-user",
              username: "iam-citizen",
              display_name: "Verified Citizen",
              role: "OFFICER",
              department_id: "test-dept",
            },
          })
        : route.fulfill({ status: 401, json: { message: "Sign in" } });
    if (path === "/api/auth/gov/start") {
      expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
      seen.starts.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/api/auth/gov/register" || path === "/api/auth/gov/password-login") {
      expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
      seen.requests.push({ path, ...route.request().postDataJSON() });
      await seen.delay;
      if (seen.failure) return route.fulfill({ status: 503, json: { message: seen.failure } });
      seen.signedIn = true;
      return route.fulfill({ json: { success: true } });
    }
    if (path === "/api/complaints")
      return route.fulfill({
        json: { items: [], total: 0, stats: { total: 0, in_progress: 0, closed: 0, overdue: 0 } },
      });
    if (path === "/api/catalog")
      return route.fulfill({ json: { categories: [], departments: [], users: [] } });
    return route.fulfill({ json: path === "/api/public/line" ? { enabled: false } : [] });
  });
  await page.route("https://**govcenter.co/**", (route) => {
    throw new Error("browser must stay on TownTrack");
  });
  return seen;
}
async function signup(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "สมัครบัญชีประชาชนผ่าน Gov Center", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "สมัครบัญชี Gov Center", exact: true }),
  ).toBeVisible();
}
async function fillSignup(page: Page) {
  await page.getByLabel("ชื่อที่ใช้ติดต่อ", { exact: true }).fill("Citizen Test");
  await page.getByLabel("อีเมล", { exact: true }).fill("citizen@example.test");
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill("Fake-pass-12345");
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill("Fake-pass-12345");
}
test("signup verifies through TownTrack API then opens authenticated home", async ({ page }) => {
  const seen = await boundary(page);
  await signup(page);
  await fillSignup(page);
  await page.getByRole("button", { name: "สมัครและเข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByText("Verified Citizen", { exact: true })).toBeVisible();
  expect(seen.requests).toHaveLength(1);
  expect(seen.starts).toHaveLength(1);
  expect(seen.starts[0].purpose).toBe("REGISTER");
  expect(seen.starts[0].state).toMatch(/^[a-f0-9]{64}$/);
  expect(seen.requests[0]).toEqual({
    path: "/api/auth/gov/register",
    state: seen.starts[0].state,
    name: "Citizen Test",
    email: "citizen@example.test",
    password: "Fake-pass-12345",
  });
  expect(page.url()).toBe("http://127.0.0.1:5173/");
  const storage = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(storage).not.toContain("Fake-pass");
});
test("invalid email and mismatched confirmation never submit credentials", async ({ page }) => {
  const seen = await boundary(page);
  await signup(page);
  await fillSignup(page);
  await page.getByLabel("อีเมล", { exact: true }).fill("bad-email");
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill("Different-pass");
  await page.getByRole("button", { name: "สมัครและเข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByText("รหัสผ่านไม่ตรงกัน", { exact: true })).toBeVisible();
  expect(seen.starts).toEqual([]);
  expect(seen.requests).toEqual([]);
});
test("signup blocks duplicate submission and clears passwords on partial failure", async ({
  page,
}) => {
  const seen = await boundary(page);
  let release!: () => void;
  seen.delay = new Promise<void>((resolve) => (release = resolve));
  seen.failure = "สมัครบัญชี Gov Center สำเร็จแล้ว แต่ยังเข้า TownTrack ไม่สำเร็จ";
  await signup(page);
  await fillSignup(page);
  const submit = page.getByRole("button", { name: "สมัครและเข้าสู่ระบบ", exact: true });
  await submit.dblclick({ delay: 5 });
  try {
    await expect(submit).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByRole("alert")).toContainText("สมัครบัญชี Gov Center สำเร็จแล้ว");
  expect(seen.requests).toHaveLength(1);
  await expect(page.getByLabel("รหัสผ่าน", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("ยืนยันรหัสผ่าน", { exact: true })).toHaveValue("");
  await page
    .getByRole("button", { name: "มีบัญชีแล้ว เข้าสู่ระบบด้วยอีเมล Gov", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "เข้าสู่ระบบด้วยอีเมล Gov Center", exact: true }),
  ).toBeVisible();
});
test("Gov email login recovers an existing account without registering again", async ({ page }) => {
  const seen = await boundary(page);
  await page.goto("/");
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วยอีเมล Gov Center", exact: true }).click();
  await page.getByLabel("อีเมล", { exact: true }).fill("citizen@example.test");
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill("legacy-pass");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByText("Verified Citizen", { exact: true })).toBeVisible();
  expect(seen.starts[0].purpose).toBe("PASSWORD_LOGIN");
  expect(seen.requests.map((r) => r.path)).toEqual(["/api/auth/gov/password-login"]);
});
test("leaving Gov form clears credentials and restores LINE and staff login", async ({ page }) => {
  await boundary(page);
  await signup(page);
  await fillSignup(page);
  await page.getByRole("button", { name: "กลับไปหน้าเข้าสู่ระบบ", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย Gov Center", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("ชื่อผู้ใช้", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "สมัครบัญชีประชาชนผ่าน Gov Center", exact: true }).click();
  await expect(page.getByLabel("รหัสผ่าน", { exact: true })).toHaveValue("");
});

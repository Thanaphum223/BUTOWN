import { test, expect, type Page } from "@playwright/test";
test.setTimeout(20000);
const state = "1234567890abcdef".repeat(4);
async function boundary(page: Page, loggedIn = false) {
  const observed = {
    starts: [] as Record<string, string>[],
    callbacks: [] as Record<string, string>[],
    signedIn: loggedIn,
    fail: false,
    authChecks: 0,
    checksAtExchange: [] as number[],
    sessionChecks: 0,
  };
  await page.route("**/api/public/gov-auth", (r) =>
    r.fulfill({
      json: {
        mode: "local",
        configured: true,
        iamAuthUrl: "https://auth.govcenter.co",
        serviceCode: "towntrack-test",
        callbackUrl: "http://127.0.0.1:5173/auth/callback",
      },
    }),
  );
  await page.route("**/api/public/line", (r) => r.fulfill({ json: { enabled: false } }));
  await page.route("**/api/public/municipalities", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/auth/csrf", (r) =>
    r.fulfill({ json: { token: "test-csrf", headerName: "X-CSRF-TOKEN" } }),
  );
  await page.route("**/api/auth/me", (r) => {
    observed.authChecks++;
    return observed.signedIn
      ? r.fulfill({
          json: {
            id: "test-user",
            username: "sso-test",
            display_name: "SSO Test User",
            role: "OFFICER",
            department_id: "test-department",
          },
        })
      : r.fulfill({ status: 401, json: { message: "Sign in" } });
  });
  await page.route("**/api/auth/gov/start", async (r) => {
    observed.starts.push(r.request().postDataJSON());
    expect(r.request().headers()["x-csrf-token"]).toBe("test-csrf");
    await r.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/auth/sso-callback", async (r) => {
    observed.checksAtExchange.push(observed.authChecks);
    observed.callbacks.push(r.request().postDataJSON());
    expect(r.request().headers()["x-csrf-token"]).toBe("test-csrf");
    if (observed.fail) {
      await r.fulfill({
        status: 503,
        json: { message: "Gov Center unavailable; restart sign-in" },
      });
      return;
    }
    observed.signedIn = true;
    await r.fulfill({ json: { success: true, user: { role: "OFFICER" } } });
  });
  await page.route("https://auth.govcenter.co/**", (r) =>
    r.fulfill({ contentType: "text/html", body: "<h1>IAM login test boundary</h1>" }),
  );
  await page.route("https://auth.govcenter.co/auth/session?*", (r) => {
    observed.sessionChecks++;
    return r.fulfill({
      status: 404,
      json: { message: "Not available" },
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:5173",
        "access-control-allow-credentials": "true",
      },
    });
  });
  return observed;
}
test("SSO button registers matching state before redirect without token entry", async ({
  page,
}) => {
  const seen = await boundary(page);
  await page.goto("/");
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วย Gov Center", exact: true }).click();
  await expect(page.getByRole("heading", { name: "IAM login test boundary" })).toBeVisible();
  const url = new URL(page.url());
  expect(url.searchParams.get("service")).toBe("towntrack-test");
  expect(url.searchParams.get("callback")).toBe("http://127.0.0.1:5173/auth/callback");
  expect(seen.starts).toHaveLength(1);
  expect(seen.starts[0].state).toBe(url.searchParams.get("state"));
  expect(seen.starts[0].purpose).toBe("LOGIN");
});
test("opening TownTrack never calls undocumented central session endpoint", async ({ page }) => {
  const seen = await boundary(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย Gov Center", exact: true }),
  ).toBeVisible();
  expect(seen.sessionChecks).toBe(0);
  expect(seen.starts).toHaveLength(0);
  expect(seen.callbacks).toHaveLength(0);
  expect(new URL(page.url()).origin).toBe("http://127.0.0.1:5173");
});
test("central profile or opaque token cannot authenticate and unavailable session never auto redirects", async ({
  page,
}) => {
  const seen = await boundary(page);
  await page.route("https://auth.govcenter.co/auth/session?*", (r) =>
    r.fulfill({
      json: {
        loggedIn: true,
        sessionToken: "opaque-not-a-documented-code",
        user: { id: "forged", role: "ADMIN" },
      },
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:5173",
        "access-control-allow-credentials": "true",
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย Gov Center", exact: true }),
  ).toBeVisible();
  expect(seen.callbacks).toHaveLength(0);
  expect(seen.starts).toHaveLength(0);
  expect(new URL(page.url()).host).toBe("127.0.0.1:5173");
});
test("existing local session never checks central server", async ({ page }) => {
  const seen = await boundary(page, true);
  await page.goto("/");
  await expect(page.getByText("SSO Test User", { exact: true })).toBeVisible();
  expect(seen.sessionChecks).toBe(0);
});
test("logout stays local without silently signing in again", async ({ page }) => {
  const seen = await boundary(page, true);
  await page.route("**/api/auth/logout", (r) => {
    seen.signedIn = false;
    return r.fulfill({ status: 204 });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย Gov Center", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย Gov Center", exact: true }),
  ).toBeVisible();
  expect(seen.sessionChecks).toBe(0);
  expect(seen.callbacks).toHaveLength(0);
});
test("SSO start prevents concurrent local login and recovers on start failure", async ({
  page,
}) => {
  await boundary(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย Gov Center", exact: true }),
  ).toBeVisible();
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => (finish = resolve));
  await page.route("**/api/auth/gov/start", async (r) => {
    await waiting;
    await r.fulfill({ status: 503, json: { message: "SSO start unavailable" } });
  });
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วย Gov Center", exact: true }).click();
  await expect(page.getByRole("button", { name: /เข้าสู่ระบบ$/ })).toBeDisabled();
  finish();
  await expect(page.getByRole("button", { name: /เข้าสู่ระบบ$/ })).toBeEnabled();
});
test("callback rejects missing or mismatched state without exchange", async ({ page }) => {
  const seen = await boundary(page);
  await page.goto("/auth/callback?code=sample-one-use-code");
  await expect(page.getByRole("alert")).toContainText("เริ่มเข้าสู่ระบบใหม่");
  expect(seen.callbacks).toHaveLength(0);
  expect(page.url()).not.toContain("sample-one-use-code");
  await page.goto("/auth/callback?code=another-code&state=wrong");
  await expect(page.getByRole("alert")).toContainText("เริ่มเข้าสู่ระบบใหม่");
  expect(seen.callbacks).toHaveLength(0);
});
test("valid callback exchanges once in StrictMode then loads authenticated session", async ({
  page,
}) => {
  const seen = await boundary(page);
  await page.addInitScript((s) => sessionStorage.setItem("gov_sso_state", s), state);
  await page.goto(`/auth/callback?code=sample-code&state=${state}`);
  await expect(page.getByText("SSO Test User", { exact: true })).toBeVisible();
  expect(seen.callbacks).toEqual([{ code: "sample-code", state }]);
  expect(seen.checksAtExchange).toEqual([0]);
  expect(page.url()).not.toContain("sample-code");
});
test("provider failure does not automatically retry one-time code", async ({ page }) => {
  const seen = await boundary(page);
  seen.fail = true;
  await page.addInitScript((s) => sessionStorage.setItem("gov_sso_state", s), state);
  await page.goto(`/auth/callback?code=failed-code&state=${state}`);
  await expect(page.getByRole("alert")).toContainText("Gov Center unavailable");
  await expect(
    page.getByRole("button", { name: "เริ่มเข้าสู่ระบบใหม่", exact: true }),
  ).toBeVisible();
  expect(seen.callbacks).toHaveLength(1);
});
test("logged-in account explicitly initiates LINK rather than creating a new account", async ({
  page,
}) => {
  const seen = await boundary(page, true);
  await page.route("**/api/auth/gov-profile", (r) =>
    r.fulfill({ json: { linked: false, residences: [] } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "ข้อมูล Gov Center", exact: true }).click();
  await page.getByRole("button", { name: "เชื่อมบัญชี Gov Center", exact: true }).click();
  await expect(page.getByRole("heading", { name: "IAM login test boundary" })).toBeVisible();
  expect(seen.starts[0].purpose).toBe("LINK");
});
test("signed-in user can inspect synchronized Gov Center profile and residence status", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boundary(page, true);
  await page.route("**/api/auth/gov-profile", (r) =>
    r.fulfill({
      json: {
        linked: true,
        profile: { id: "iam-user-1", name: "Gov Profile Name", email: "profile@example.test" },
        residences: [
          {
            residenceId: "home-1",
            address: "บ้านทดสอบ 12",
            memberStatus: "PENDING",
            residenceStatus: "VERIFIED",
            canUseForOfficialTransaction: false,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "ข้อมูล Gov Center", exact: true }).click();
  await expect(page.getByText("Gov Profile Name", { exact: true })).toBeVisible();
  await expect(page.getByText("profile@example.test", { exact: true })).toBeVisible();
  await expect(page.getByText("บ้านทดสอบ 12", { exact: true })).toBeVisible();
  await expect(page.getByText("ยังไม่ผ่านการยืนยันครบถ้วน", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({
    path: "../work/screenshots/gov-profile-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

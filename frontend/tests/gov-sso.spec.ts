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
  await page.route("https://access.line.me/**", (r) =>
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
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วย LINE", exact: true }).click();
  await expect(page.getByRole("heading", { name: "IAM login test boundary" })).toBeVisible();
  const url = new URL(page.url());
  expect(url.origin + url.pathname).toBe("https://access.line.me/oauth2/v2.1/authorize");
  expect(url.searchParams.get("client_id")).toBe("2008946775");
  expect(url.searchParams.get("redirect_uri")).toBe(
    "https://api-auth.govcenter.co/auth/line/callback",
  );
  expect(url.searchParams.get("response_type")).toBe("code");
  expect(url.searchParams.get("scope")).toBe("profile openid email");
  const govState = new URLSearchParams(url.searchParams.get("state")!);
  expect(govState.get("service")).toBe("towntrack-test");
  const callback = new URL(govState.get("callback")!);
  expect(callback.origin + callback.pathname).toBe("http://127.0.0.1:5173/auth/callback");
  expect(callback.hash).toBe("");
  expect(callback.searchParams.get("state")).toMatch(/^[a-f0-9]{64}$/);
  expect(seen.starts).toHaveLength(1);
  expect(seen.starts[0].state).toBe(callback.searchParams.get("state"));
  expect(seen.starts[0].purpose).toBe("LOGIN");
  // Gov's LINE callback preserves the transaction query on the configured destination.
  callback.searchParams.set("code", "gov-after-line-code");
  callback.searchParams.set("service", "towntrack-test");
  callback.searchParams.set("ticket", "unused-one-time-iam-ticket");
  await page.goto(callback.toString());
  await expect(page.getByText("SSO Test User", { exact: true })).toBeVisible();
  expect(seen.callbacks).toEqual([{ code: "gov-after-line-code", state: seen.starts[0].state }]);
  expect(new URL(page.url()).origin).toBe("http://127.0.0.1:5173");
});
test("callback removes credentials before config is available and never redeems IAM tickets", async ({
  page,
}) => {
  const seen = await boundary(page);
  await page.addInitScript((s) => sessionStorage.setItem("gov_sso_state", s), state);
  let release!: () => void;
  let configRequested!: () => void;
  const waiting = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (configRequested = resolve));
  await page.route("**/api/public/gov-auth", async (r) => {
    configRequested();
    await waiting;
    await r.fulfill({
      json: {
        mode: "local",
        configured: true,
        iamAuthUrl: "https://auth.govcenter.co",
        serviceCode: "towntrack-test",
        callbackUrl: "http://127.0.0.1:5173/auth/callback",
      },
    });
  });
  const ticketRequests: string[] = [];
  page.on("request", (r) => {
    if ((r.postData() || "").includes("unused-one-time-iam-ticket")) ticketRequests.push(r.url());
  });
  await page.goto(
    `/auth/callback?code=sample-code&ticket=unused-one-time-iam-ticket&state=${state}#access_token=ignored`,
  );
  await requested;
  expect(page.url()).toBe("http://127.0.0.1:5173/auth/callback");
  release();
  await expect(page.getByText("SSO Test User", { exact: true })).toBeVisible();
  expect(seen.callbacks).toEqual([{ code: "sample-code", state }]);
  expect(ticketRequests).toEqual([]);
  expect(
    await page.evaluate(() =>
      Object.values(sessionStorage).some((v) => v.includes("unused-one-time-iam-ticket")),
    ),
  ).toBe(false);
});
for (const suffix of [
  "&error=access_denied",
  "&auth_status=onboarding_required",
  "&is_new_user=unexpected",
  "&is_new_user=true&is_new_user=false",
  "&service=another-service",
  "&service=towntrack-test&service=another-service",
  "&code=duplicate",
  `&state=${state}`,
  "&access_token=untrusted-parent-token",
]) {
  test(`unsafe provider return is rejected without verification: ${suffix}`, async ({ page }) => {
    const seen = await boundary(page);
    await page.addInitScript((s) => sessionStorage.setItem("gov_sso_state", s), state);
    await page.goto(`/auth/callback?code=sample-code&state=${state}${suffix}`);
    await expect(page.getByRole("alert")).toBeVisible();
    expect(seen.callbacks).toHaveLength(0);
    expect(page.url()).toBe("http://127.0.0.1:5173/auth/callback");
  });
}
for (const configFailure of ["unconfigured", "unavailable", "wrong-origin"]) {
  test(`signup has no local fallback when configuration is ${configFailure}`, async ({ page }) => {
    const seen = await boundary(page);
    await page.route("**/api/public/gov-auth", (r) =>
      r.fulfill(
        configFailure === "unavailable"
          ? { status: 503, json: { message: "Config unavailable" } }
          : {
              json: {
                mode: "local",
                configured: configFailure !== "unconfigured",
                iamAuthUrl: "https://auth.govcenter.co",
                serviceCode: "towntrack-test",
                callbackUrl: "https://registered.example/auth/callback",
              },
            },
      ),
    );
    await page.goto("/");
    if (configFailure === "wrong-origin") {
      await expect(page.getByRole("alert")).toContainText("โดเมนที่ลงทะเบียน");
    } else {
      await expect(
        page.getByText(
          configFailure === "unavailable"
            ? "ระบบยืนยันตัวตนส่วนกลางไม่พร้อมให้บริการ (503) กรุณาลองเข้าสู่ระบบอีกครั้ง"
            : "ยังไม่ได้ตั้งค่า Gov Center SSO ครบถ้วน",
        ),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "สมัครสมาชิก", exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole("tab", { name: "สมัครบัญชีประชาชน" })).toHaveCount(0);
    await expect(page.getByLabel("ชื่อ-นามสกุล", { exact: true })).toHaveCount(0);
    expect(seen.starts).toEqual([]);
    expect(page.url()).toBe("http://127.0.0.1:5173/");
  });
}
test("new-user marker cannot authenticate a rejected code or stand in for a missing code", async ({
  page,
}) => {
  const seen = await boundary(page);
  seen.fail = true;
  await page.addInitScript((s) => sessionStorage.setItem("gov_sso_state", s), state);
  await page.goto(`/auth/callback?code=rejected-registration-code&state=${state}&is_new_user=true`);
  await expect(page.getByRole("alert")).toContainText("Gov Center unavailable");
  expect(seen.callbacks).toEqual([{ code: "rejected-registration-code", state }]);
  expect(seen.authChecks).toBe(0);
  await page.goto(`/auth/callback?state=${state}&is_new_user=true`);
  await expect(page.getByRole("alert")).toContainText("เริ่มเข้าสู่ระบบใหม่");
  expect(seen.callbacks).toHaveLength(1);
  expect(seen.authChecks).toBe(0);
});
test("opening TownTrack never calls undocumented central session endpoint", async ({ page }) => {
  const seen = await boundary(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย LINE", exact: true }),
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
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย LINE", exact: true }),
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
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย LINE", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย LINE", exact: true }),
  ).toBeVisible();
  expect(seen.sessionChecks).toBe(0);
  expect(seen.callbacks).toHaveLength(0);
});
test("SSO start prevents concurrent Gov email login and recovers on start failure", async ({
  page,
}) => {
  await boundary(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย LINE", exact: true }),
  ).toBeVisible();
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => (finish = resolve));
  await page.route("**/api/auth/gov/start", async (r) => {
    await waiting;
    await r.fulfill({ status: 503, json: { message: "SSO start unavailable" } });
  });
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วย LINE", exact: true }).click();
  await expect(page.getByRole("button", { name: /เข้าสู่ระบบ$/ })).toBeDisabled();
  finish();
  await expect(page.getByRole("button", { name: /เข้าสู่ระบบ$/ })).toBeEnabled();
});
test("callback rejects missing or mismatched state without exchange", async ({ page }) => {
  const seen = await boundary(page);
  // Stored state cannot substitute for a provider echo: that would permit login CSRF.
  await page.addInitScript((s) => sessionStorage.setItem("gov_sso_state", s), state);
  await page.goto("/auth/callback?code=sample-one-use-code");
  await expect(page.getByRole("alert")).toContainText("เริ่มเข้าสู่ระบบใหม่");
  expect(seen.callbacks).toHaveLength(0);
  expect(page.url()).not.toContain("sample-one-use-code");
  await page.goto("/auth/callback?code=another-code&state=wrong");
  await expect(page.getByRole("alert")).toContainText("เริ่มเข้าสู่ระบบใหม่");
  expect(seen.callbacks).toHaveLength(0);
});
for (const callbackPath of ["/auth/callback", "/auth/callback/", "/"]) {
  test(`valid callback at ${callbackPath} exchanges once then loads TownTrack session`, async ({
    page,
  }) => {
    const seen = await boundary(page);
    await page.addInitScript((s) => sessionStorage.setItem("gov_sso_state", s), state);
    await page.goto(`${callbackPath}?code=sample-code&state=${state}`);
    await expect(page.getByText("SSO Test User", { exact: true })).toBeVisible();
    expect(seen.callbacks).toEqual([{ code: "sample-code", state }]);
    expect(seen.checksAtExchange).toEqual([0]);
    expect(page.url()).not.toContain("sample-code");
  });
}
test("Website URL callback rejects missing state instead of silently showing login", async ({
  page,
}) => {
  const seen = await boundary(page);
  await page.goto("/?code=untrusted-code");
  await expect(page.getByRole("alert")).toContainText("เริ่มเข้าสู่ระบบใหม่");
  expect(seen.callbacks).toHaveLength(0);
  expect(seen.authChecks).toBe(0);
  expect(page.url()).not.toContain("untrusted-code");
});
test("direct LINE return is not mistaken for a Gov callback", async ({ page }) => {
  const seen = await boundary(page);
  await page.addInitScript((s) => sessionStorage.setItem("gov_sso_state", s), state);
  await page.goto(`/?lineLogin=1&code=line-code&state=${state}`);
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย LINE", exact: true }),
  ).toBeVisible();
  expect(seen.callbacks).toHaveLength(0);
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

test("LINE sign-in after logout refreshes the session token without a page reload", async ({
  page,
}) => {
  const seen = await boundary(page, true);
  let generation = 0;
  const starts: number[] = [];
  let rejectedStarts = 0;
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({
      json: { token: `session-csrf-${generation}`, headerName: "X-CSRF-TOKEN" },
    }),
  );
  await page.route("**/api/auth/logout", (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe(`session-csrf-${generation}`);
    seen.signedIn = false;
    generation++;
    return route.fulfill({ status: 204 });
  });
  await page.route("**/api/auth/gov/start", (route) => {
    if (route.request().headers()["x-csrf-token"] !== `session-csrf-${generation}`) {
      rejectedStarts++;
      return route.fulfill({ status: 401, json: { message: "กรุณาเข้าสู่ระบบ" } });
    }
    starts.push(generation);
    seen.starts.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/auth/sso-callback", (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe(`session-csrf-${generation}`);
    seen.callbacks.push(route.request().postDataJSON());
    seen.signedIn = true;
    generation++;
    return route.fulfill({ json: { success: true } });
  });
  await page.goto("/");
  for (let cycle = 0; cycle < 2; cycle++) {
    await expect(page.getByText("SSO Test User", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
    await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "เข้าสู่ระบบด้วย LINE", exact: true }).click();
    await expect(page.getByRole("heading", { name: "IAM login test boundary" })).toBeVisible();
    const provider = new URL(page.url());
    const callback = new URL(
      new URLSearchParams(provider.searchParams.get("state")!).get("callback")!,
    );
    callback.searchParams.set("code", `one-use-cycle-${cycle}`);
    await page.goto(callback.toString());
  }
  await expect(page.getByText("SSO Test User", { exact: true })).toBeVisible();
  expect(rejectedStarts).toBe(0);
  expect(starts).toEqual([1, 3]);
  expect(seen.starts.map((s) => s.purpose)).toEqual(["LOGIN", "LOGIN"]);
  expect(seen.starts[0].state).not.toBe(seen.starts[1].state);
  expect(seen.callbacks).toHaveLength(2);
});

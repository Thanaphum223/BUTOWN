import { test, expect } from "@playwright/test";
import { accountPassword, openReport, confirmLocation } from "./product-flow";
import { waitForLoginSlot } from "./login-rate";
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});
for (const denied of [false, true]) {
  test(
    denied
      ? "browser denial leaves the application usable after privacy acknowledgement"
      : "GPS waits for login and privacy acknowledgement, then uses browser permission once",
    async ({ page }) => {
      await page.addInitScript((deny) => {
        (window as any).gpsCalls = 0;
        Object.defineProperty(navigator, "geolocation", {
          value: {
            getCurrentPosition(ok: any, fail: any) {
              (window as any).gpsCalls++;
              setTimeout(
                () =>
                  deny ? fail({ code: 1 }) : ok({ coords: { latitude: 13.75, longitude: 100.5 } }),
                0,
              );
            },
          },
        });
      }, denied);
      let acknowledged = false;
      await page.route("**/api/users/pdpa-consent", async (route) => {
        const response = await route.fetch();
        if (response.ok()) acknowledged = true;
        await route.fulfill({ response });
      });
      // Force a fresh notice even after another test acknowledged this shared demo account.
      await page.route("**/api/privacy", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          json: { ...(await response.json()), acknowledged },
        });
      });
      await waitForLoginSlot();
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ", exact: true })).toBeVisible();
      expect(await page.evaluate(() => (window as any).gpsCalls)).toBe(0);
      const csrf = await (await page.request.get("/api/auth/csrf")).json();
      const response = await page.request.post("/api/test/session", {
        headers: { [csrf.headerName]: csrf.token },
        form: { username: "citizen", password: accountPassword("citizen") },
      });
      expect(response.ok()).toBeTruthy();
      await page.reload();
      const notice = page.getByRole("dialog", {
        name: "ประกาศคุ้มครองข้อมูลส่วนบุคคล",
      });
      await expect(notice).toBeVisible();
      expect(await page.evaluate(() => (window as any).gpsCalls)).toBe(0);
      await notice.getByRole("button", { name: "ยินยอม", exact: true }).click();
      await expect(notice).not.toBeVisible();
      await expect.poll(() => page.evaluate(() => (window as any).gpsCalls)).toBe(1);
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await openReport(page);
      if (denied) await expect(page.getByText(/ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง/)).toBeVisible();
      await confirmLocation(page, "ใช้แอปได้หลังตอบสิทธิ์ GPS");
      await expect(page.getByLabel("หัวข้อปัญหา", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => (window as any).gpsCalls)).toBe(1);
    },
  );
}

test("declining the privacy notice keeps GPS off until the user accepts", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).gpsCalls = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(ok: any) {
          (window as any).gpsCalls++;
          setTimeout(() => ok({ coords: { latitude: 13.75, longitude: 100.5 } }), 0);
        },
      },
    });
  });
  // Keep the decision in the browser so the shared demo account keeps its real consent.
  let decision: boolean | undefined;
  await page.route("**/api/users/pdpa-consent", async (route) => {
    decision = route.request().postDataJSON().consent;
    await route.fulfill({ json: { ok: true, consented: decision } });
  });
  await page.route("**/api/privacy", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: {
        ...(await response.json()),
        acknowledged: decision !== undefined,
        consented: decision === true,
      },
    });
  });
  await waitForLoginSlot();
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  const response = await page.request.post("/api/test/session", {
    headers: { [csrf.headerName]: csrf.token },
    form: { username: "citizen", password: accountPassword("citizen") },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/");
  const notice = page.getByRole("dialog", { name: "ประกาศคุ้มครองข้อมูลส่วนบุคคล" });
  await notice.getByRole("button", { name: "ไม่ยินยอม", exact: true }).click();
  await expect(notice).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "เรื่องแจ้งในเทศบาล", exact: true }),
  ).toBeVisible();
  await openReport(page);
  await page.getByRole("button", { name: "ตำแหน่งของฉัน" }).click();
  await expect(notice).toBeVisible();
  expect(await page.evaluate(() => (window as any).gpsCalls)).toBe(0);
  await notice.getByRole("button", { name: "ยินยอม", exact: true }).click();
  await expect(notice).not.toBeVisible();
  expect(decision).toBe(true);
  await page.getByRole("button", { name: "ตำแหน่งของฉัน" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).gpsCalls)).toBe(1);
});

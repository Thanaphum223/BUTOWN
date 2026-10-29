import { test, expect } from "@playwright/test";
test("uses only browser permission once without a second web popup", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("towntrack.locationChoice", "dismissed");
    (window as any).gpsCalls = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(ok: any) {
          (window as any).gpsCalls++;
          setTimeout(
            () => ok({ coords: { latitude: 13.75, longitude: 100.5 } }),
            0,
          );
        },
      },
    });
  });
  await page.goto("/");
  await expect(page.getByLabel("ชื่อผู้ใช้", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).gpsCalls))
    .toBe(1);
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("browser denial leaves the application usable without a web confirmation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).gpsCalls = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(_ok: any, fail: any) {
          (window as any).gpsCalls++;
          setTimeout(() => fail({ code: 1 }), 0);
        },
      },
    });
  });
  await page.goto("/");
  await expect(page.getByLabel("ชื่อผู้ใช้", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).gpsCalls))
    .toBe(1);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }),
  ).toBeEnabled();
});

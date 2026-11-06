import { test, expect, type Page } from "@playwright/test";
import { openReport, confirmLocation } from "./product-flow";

async function report(page: Page, profile: "email" | "missing" | "unlinked" | "retry" = "email") {
  let profileRecovered = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/gov-profile") {
      if (profile === "retry" && !profileRecovered)
        return route.fulfill({ status: 503, json: { message: "temporary profile failure" } });
      return route.fulfill({
        json:
          profile === "unlinked"
            ? { linked: false, residences: [] }
            : {
                linked: true,
                profile: {
                  id: "gov-report-test",
                  name: "ผู้ทดสอบ",
                  email: profile === "missing" ? null : "reporter@example.test",
                  last_sso_at: "2026-11-06T01:00:00Z",
                },
                residences: [],
              },
      });
    }
    const data: Record<string, unknown> = {
      "/api/auth/me": {
        id: "reporter-test",
        display_name: "ผู้ทดสอบ",
        username: "not-an-email",
        role: "CITIZEN",
      },
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/catalog": {
        categories: [
          "ถนนและทางเท้า",
          "เสียงดัง / ฝุ่นควัน / เหตุรำคาญ",
          "ปัญหาทดลองของเทศบาล",
          "constructor",
          "__proto__",
        ].map((name, i) => ({ id: "cat-" + i, name, fields: "[]", sla_hours: 72 })),
        departments: [],
        queues: [],
      },
      "/api/municipal-center": { latitude: 13.75, longitude: 100.5 },
      "/api/community/complaints": { items: [], top: [], total: 0, stats: {} },
      "/api/nearby": [],
      "/api/geocoding/reverse": { display_name: "ถนนทดสอบ" },
    };
    return route.fulfill({ json: data[path] ?? {} });
  });
  await page.goto("/");
  await openReport(page);
  await confirmLocation(page, "สถานที่ทดสอบ");
  return () => {
    profileRecovered = true;
  };
}

for (const width of [390, 1440]) {
  test(`report examples follow category without losing input and Gov email stays locked at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await report(page);
    await page.getByRole("button", { name: /ถนนและทางเท้า/ }).click();
    const details = page.getByLabel("รายละเอียด", { exact: true });
    await expect(details).toHaveAttribute("placeholder", /ถนน.*หลุม/);
    await details.fill("รายละเอียดที่ผู้แจ้งพิมพ์ไว้");
    await page.getByRole("button", { name: /เสียงดัง.*ฝุ่นควัน/ }).click();
    await expect(details).toHaveAttribute("placeholder", /เสียง/);
    await expect(details).toHaveValue("รายละเอียดที่ผู้แจ้งพิมพ์ไว้");
    for (const name of ["constructor", "__proto__"]) {
      await page.getByRole("button", { name, exact: false }).click();
      await expect(details).toHaveAttribute(
        "placeholder",
        `อธิบายปัญหาเกี่ยวกับ${name} พร้อมช่วงเวลาที่เกิดเหตุและผลกระทบ`,
      );
    }
    await page.getByRole("button", { name: /ปัญหาทดลองของเทศบาล/ }).click();
    await expect(details).toHaveAttribute("placeholder", /ปัญหาทดลองของเทศบาล/);
    await expect(details).toHaveValue("รายละเอียดที่ผู้แจ้งพิมพ์ไว้");
    const email = page.getByLabel("อีเมล", { exact: true });
    await expect(email).toHaveValue("reporter@example.test");
    await expect(email).not.toBeEditable();
    await page.getByRole("button", { name: "ย้อนกลับ", exact: true }).click();
    await confirmLocation(page);
    await expect(details).toHaveValue("รายละเอียดที่ผู้แจ้งพิมพ์ไว้");
    await expect(email).toHaveValue("reporter@example.test");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await email.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../work/screenshots/report-email-${width}.png` });
  });
}

for (const profile of ["missing", "unlinked"] as const) {
  test(`a ${profile} Gov email stays empty instead of guessing from another account`, async ({
    page,
  }) => {
    await report(page, profile);
    const email = page.getByLabel("อีเมล", { exact: true });
    await expect(email).toBeEmpty();
    await expect(email).not.toBeEditable();
    await expect(
      page.getByText("บัญชี Gov Center ยังไม่ได้ระบุอีเมล", { exact: true }),
    ).toBeVisible();
  });
}

test("a failed Gov email lookup offers retry and restores the read-only value", async ({
  page,
}) => {
  const recoverProfile = await report(page, "retry");
  await expect(page.getByText("โหลดอีเมลไม่สำเร็จ", { exact: true })).toBeVisible();
  recoverProfile();
  await page.getByRole("button", { name: "ลองโหลดอีเมลอีกครั้ง", exact: true }).click();
  const email = page.getByLabel("อีเมล", { exact: true });
  await expect(email).toHaveValue("reporter@example.test");
  await expect(email).not.toBeEditable();
});

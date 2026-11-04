import { test, expect, type Page } from "@playwright/test";
import { openReport } from "./product-flow";

const id = "11111111-1111-4111-8111-111111111111";
const category = "22222222-2222-4222-8222-222222222222";
const categoryName = "ถนนและทางเท้า";
const tile = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

async function fixture(page: Page, initiallyVoted = false) {
  let voted = initiallyVoted;
  let following = false;
  let fail = false;
  let failRead = false;
  let gate: Promise<void> | undefined;
  let saveBeforeResponse = false;
  const writes: { path: string; method: string; body: unknown }[] = [];
  const item = () => ({
    id,
    category_id: category,
    category_name: categoryName,
    status: "NEW",
    latitude: 13.75,
    longitude: 100.5,
    votes: voted ? 13 : 12,
    voted,
    following,
    mock: true,
    created_at: "2026-11-04T01:00:00Z",
    media_count: 0,
    cover: null,
  });
  await page.route("https://tile.openstreetmap.org/**", (r) =>
    r.fulfill({ contentType: "image/png", body: tile }),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (["POST", "DELETE"].includes(request.method())) {
      writes.push({ path, method: request.method(), body: request.postDataJSON() });
      if (saveBeforeResponse && path.endsWith("/vote")) voted = request.method() === "POST";
      if (gate) await gate;
      if (fail)
        return route.fulfill({ status: 503, json: { message: "บันทึกไม่สำเร็จ ลองอีกครั้ง" } });
      if (path.endsWith("/vote")) voted = request.method() === "POST";
      if (path.endsWith("/follow")) following = request.method() === "POST";
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/api/nearby" && failRead)
      return route.fulfill({ status: 503, json: { message: "Read unavailable" } });
    const payload: Record<string, unknown> = {
      "/api/auth/me": { id: "test-citizen", display_name: "ผู้ทดสอบ", role: "CITIZEN" },
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/public/map-config": { provider: "leaflet", publicToken: "" },
      "/api/catalog": { categories: [], departments: [] },
      "/api/municipal-center": { latitude: 13.75, longitude: 100.5 },
      "/api/geocoding/reverse": { display_name: "สถานที่ทดสอบ" },
      "/api/nearby": url.searchParams.get("latitude") === "14" ? [] : [item()],
      "/api/community/complaints": {
        items: [item()],
        top: [],
        total: 1,
        municipalityTotal: 1,
        stats: { total: 1, votes: voted ? 13 : 12, closed: 0, in_progress: 1 },
      },
      [`/api/community/complaints/${id}`]: { complaint: item(), media: [], history: [] },
    };
    return route.fulfill({ json: payload[path] ?? {} });
  });
  await page.goto("/");
  await openReport(page);
  await page.getByLabel("ค้นหาชื่อสถานที่ หรือพิกัด", { exact: true }).fill("13.75, 100.5");
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  await expect(page.getByText("พบ 1 เคสใกล้เคียง", { exact: true })).toBeVisible();
  return {
    writes,
    fail: (value: boolean) => {
      fail = value;
    },
    failRead: (value: boolean) => {
      failRead = value;
    },
    hold: (saveFirst = false) => {
      saveBeforeResponse = saveFirst;
      let release!: () => void;
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        gate = undefined;
        release();
      };
    },
  };
}

for (const width of [320, 440, 1280]) {
  test(`nearby actions share home vote toggles and icons at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page);
    const vote = page.getByRole("button", { name: `โหวต ${categoryName} #11111111`, exact: true });
    await expect(vote).toHaveText("12 โหวต");
    await expect(vote.getByRole("img", { name: "like", exact: true })).toBeVisible();
    await expect(page.locator(".complaint-map-symbol")).toHaveCount(1);
    await expect(page.locator(".complaint-map-symbol")).toHaveAttribute("aria-label", categoryName);
    const release = state.hold();
    await vote.evaluate((el) => {
      (el as HTMLButtonElement).click();
      (el as HTMLButtonElement).click();
    });
    await expect(vote).toBeDisabled();
    expect(state.writes).toHaveLength(1);
    release();
    const unvote = page.getByRole("button", {
      name: `ยกเลิกโหวต ${categoryName} #11111111`,
      exact: true,
    });
    await expect(unvote).toHaveText("13 โหวต");
    await expect(unvote).toHaveAttribute("aria-pressed", "true");
    await unvote.click();
    await expect(vote).toHaveText("12 โหวต");
    await expect(vote).toHaveAttribute("aria-pressed", "false");
    const follow = page.getByRole("button", { name: "ติดตาม", exact: true });
    await expect(follow.getByRole("img", { name: "bell", exact: true })).toBeVisible();
    await follow.click();
    const unfollow = page.getByRole("button", { name: "ติดตามแล้ว", exact: true });
    await expect(unfollow).toHaveAttribute("aria-pressed", "true");
    expect(state.writes[2]).toEqual({
      path: `/api/complaints/${id}/follow`,
      method: "POST",
      body: { categoryId: category, latitude: 13.75, longitude: 100.5 },
    });
    await unfollow.click();
    await expect(follow).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
    await expect(
      page.getByRole("dialog").getByText("MOCK · ข้อมูลจำลอง", { exact: true }),
    ).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await vote.click();
    await expect(unvote).toHaveText("13 โหวต");
    await page
      .getByRole("navigation", { name: "เมนูประชาชน", exact: true })
      .getByRole("link", { name: /หน้าหลัก/ })
      .click();
    const card = page.locator(".community-all-results .community-issue");
    await expect(
      card.getByRole("button", { name: `ยกเลิกโหวต ${categoryName} #11111111`, exact: true }),
    ).toHaveText("13 โหวต");
    expect(state.writes.map((w) => w.method)).toEqual(["POST", "DELETE", "POST", "DELETE", "POST"]);
  });
}

test("failed nearby vote preserves count and permits one successful retry", async ({ page }) => {
  const state = await fixture(page);
  state.fail(true);
  const vote = page.getByRole("button", { name: `โหวต ${categoryName} #11111111`, exact: true });
  await vote.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "บันทึกไม่สำเร็จ ลองอีกครั้ง" }),
  ).toBeVisible();
  await expect(vote).toBeEnabled();
  await expect(vote).toHaveText("12 โหวต");
  state.fail(false);
  await vote.click();
  await expect(
    page.getByRole("button", { name: `ยกเลิกโหวต ${categoryName} #11111111`, exact: true }),
  ).toHaveText("13 โหวต");
  expect(state.writes).toHaveLength(2);
});

test("a vote finishing after point change cannot repopulate the old nearby area", async ({
  page,
}) => {
  const state = await fixture(page);
  const release = state.hold();
  await page.getByRole("button", { name: `โหวต ${categoryName} #11111111`, exact: true }).click();
  await page.getByLabel("ค้นหาชื่อสถานที่ หรือพิกัด", { exact: true }).fill("14, 100.5");
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  await expect(page.getByText("ไม่พบเคสใกล้เคียงในรัศมี 100 เมตร", { exact: true })).toBeVisible();
  const response = page.waitForResponse((r) => r.url().endsWith("/vote"));
  release();
  await response;
  await expect(page.getByText("ไม่พบเคสใกล้เคียงในรัศมี 100 เมตร", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /ยกเลิกโหวต/ })).toHaveCount(0);
});

test("reselecting the same point recovers a saved vote after its refresh fails", async ({
  page,
}) => {
  const state = await fixture(page);
  state.failRead(true);
  await page.getByRole("button", { name: `โหวต ${categoryName} #11111111`, exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ" }),
  ).toBeVisible();
  state.failRead(false);
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `ยกเลิกโหวต ${categoryName} #11111111`, exact: true }),
  ).toHaveText("13 โหวต");
  await expect(page.getByText("พบ 1 เคสใกล้เคียง", { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1);
});

for (const initiallyVoted of [false, true]) {
  test(`overlapping-area read cannot count the same ${initiallyVoted ? "cancellation" : "vote"} twice`, async ({
    page,
  }) => {
    const state = await fixture(page, initiallyVoted);
    const release = state.hold(true);
    await page
      .getByRole("button", {
        name: `${initiallyVoted ? "ยกเลิกโหวต" : "โหวต"} ${categoryName} #11111111`,
        exact: true,
      })
      .click();
    await expect.poll(() => state.writes.length).toBe(1);
    await page.getByLabel("ค้นหาชื่อสถานที่ หรือพิกัด", { exact: true }).fill("13.7501, 100.5");
    await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
    const saved = page.getByRole("button", {
      name: `${initiallyVoted ? "โหวต" : "ยกเลิกโหวต"} ${categoryName} #11111111`,
      exact: true,
    });
    await expect(saved).toHaveText(initiallyVoted ? "12 โหวต" : "13 โหวต");
    state.failRead(true);
    const response = page.waitForResponse((r) => r.url().endsWith("/vote"));
    release();
    await response;
    await expect(
      page.getByRole("alert").filter({ hasText: "บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ" }),
    ).toBeVisible();
    await expect(saved).toHaveText(initiallyVoted ? "12 โหวต" : "13 โหวต");
    expect(state.writes).toHaveLength(1);
  });
}

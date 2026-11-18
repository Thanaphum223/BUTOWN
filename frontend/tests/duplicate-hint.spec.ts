import { test, expect } from "@playwright/test";
import { confirmLocation, openReport } from "./product-flow";

const id = "33333333-3333-4333-8333-333333333333";
const category = "44444444-4444-4444-8444-444444444444";
const categoryName = "ถนนและทางเท้า";
const tile = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

test("choosing a category suggests an existing same-category report nearby", async ({ page }) => {
  const nearbyQueries: (string | null)[] = [];
  const follows: unknown[] = [];
  let following = false;
  const item = () => ({
    id,
    category_id: category,
    category_name: categoryName,
    status: "NEW",
    latitude: 13.75,
    longitude: 100.5,
    votes: 3,
    voted: false,
    following,
    mock: false,
    created_at: "2026-11-04T01:00:00Z",
  });
  await page.route("https://tile.openstreetmap.org/**", (r) =>
    r.fulfill({ contentType: "image/png", body: tile }),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith("/follow") && request.method() === "POST") {
      follows.push(request.postDataJSON());
      following = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/api/nearby") {
      const categoryId = url.searchParams.get("categoryId");
      nearbyQueries.push(categoryId);
      // Only the same-category search reaches the report, as with the wider server radius.
      return route.fulfill({ json: categoryId === category ? [item()] : [] });
    }
    const payload: Record<string, unknown> = {
      "/api/auth/me": { id: "test-citizen", display_name: "ผู้ทดสอบ", role: "CITIZEN" },
      "/api/auth/csrf": { token: "test", headerName: "X-CSRF-TOKEN" },
      "/api/privacy": { version: "test", acknowledged: true },
      "/api/public/map-config": { provider: "leaflet", publicToken: "" },
      "/api/catalog": {
        categories: [{ id: category, name: categoryName, fields: "[]" }],
        departments: [],
      },
      "/api/municipal-center": { latitude: 13.75, longitude: 100.5 },
      "/api/geocoding/reverse": { display_name: "สถานที่ทดสอบ" },
      "/api/community/complaints": { items: [], top: [], total: 0, stats: {} },
    };
    return route.fulfill({ json: payload[path] ?? {} });
  });
  await page.goto("/");
  await openReport(page);
  await page.getByLabel("ค้นหาชื่อสถานที่ หรือพิกัด", { exact: true }).fill("13.7518, 100.5");
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  await expect(page.getByText("ไม่พบเคสใกล้เคียงในรัศมี 100 เมตร", { exact: true })).toBeVisible();
  await confirmLocation(page, "ซอยทดสอบ");
  const hint = page.getByRole("region", { name: "อาจเป็นเรื่องเดียวกัน" });
  await expect(hint).toHaveCount(0);

  await page.getByRole("button", { name: new RegExp(categoryName) }).click();
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("อาจเป็นเรื่องเดียวกับที่มีคนแจ้งแล้ว");
  await expect(hint.getByText("พบ 1 เคสใกล้เคียง", { exact: true })).toBeVisible();
  expect(nearbyQueries).toContain(category);

  await hint.getByRole("button", { name: "ติดตาม", exact: true }).click();
  await expect.poll(() => follows.length).toBe(1);
  expect(follows[0]).toMatchObject({ categoryId: category, latitude: 13.7518, longitude: 100.5 });
});

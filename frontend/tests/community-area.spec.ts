import { test, expect } from "@playwright/test";
import { signIn, createReport } from "./product-flow";

const tile = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

test("empty nearby area can explicitly discover existing municipal cases and return to nearby", async ({
  page,
  context,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (r) =>
    r.fulfill({ contentType: "image/png", body: tile }),
  );
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 13.75, longitude: 100.5 });
  await signIn(page);
  const id = await createReport(
    page,
    "Private area regression",
    "Private description",
    "Private street",
  );
  await context.setGeolocation({ latitude: 16.5, longitude: 102.5 });
  await page.goto("/");
  await expect(page.getByRole("radio", { name: "ทั้งเทศบาล", exact: true })).toBeChecked();
  await page.getByText("ใกล้จุดที่เลือก (5 กม.)", { exact: true }).click();
  const empty = page.getByRole("alert").filter({ hasText: "ไม่พบเรื่องในรัศมี 5 กม." });
  await expect(empty).toBeVisible();
  const ratio = page.locator(".community-metrics > div").filter({ hasText: "สัดส่วนปิดเรื่อง" });
  await expect(ratio.locator("strong")).toHaveText("—");
  await page.getByRole("button", { name: /ดูทั้งเทศบาล/ }).click();
  await expect(
    page.getByRole("heading", { name: "เรื่องแจ้งในเทศบาล", exact: true }),
  ).toBeVisible();
  const card = page
    .locator(".community-issue")
    .filter({ hasText: "#" + id.slice(0, 8).toUpperCase() });
  await expect(card).toBeVisible();
  await expect(card).not.toContainText("Private");
  await expect(page.locator(".nearby-radius")).toHaveCount(0);
  await expect(page.locator(".selected-location")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("combobox", { name: "ประเภทปัญหาที่ค้นหา" }).press("ArrowDown");
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("ขยะตกค้าง / ลักลอบทิ้งขยะ", { exact: true })
    .click();
  await expect(card).not.toBeVisible();
  await page.getByRole("combobox", { name: "ประเภทปัญหาที่ค้นหา" }).press("ArrowDown");
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("ทุกประเภทปัญหา", { exact: true })
    .click();
  await expect(card).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByText("ใกล้จุดที่เลือก (5 กม.)", { exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "ใกล้จุดที่เลือก (5 กม.)", exact: true }),
  ).toBeChecked();
  await expect(empty).toBeVisible();
  await expect(card).not.toBeVisible();
  await expect(page.locator(".nearby-radius")).toHaveCount(1);
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const sizes = await page
      .locator(".community-metrics > div")
      .evaluateAll((cards) =>
        cards.map((card) => ({ width: card.clientWidth, content: card.scrollWidth })),
      );
    expect(sizes).toHaveLength(5);
    for (const size of sizes) expect(size.content).toBeLessThanOrEqual(size.width + 1);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }
});

test("map tiles send only origin even when the site withholds URL referrers", async ({ page }) => {
  const referrers: (string | undefined)[] = [];
  await page.route("http://127.0.0.1:5173/**", async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), "referrer-policy": "no-referrer" },
    });
  });
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    referrers.push(route.request().headers().referer);
    await route.fulfill({ contentType: "image/png", body: tile });
  });
  await signIn(page);
  referrers.length = 0;
  await page.goto("/?private-map-context=must-not-leak");
  await expect.poll(() => referrers.length).toBeGreaterThan(0);
  expect(referrers.every((value) => value === "http://127.0.0.1:5173/")).toBeTruthy();
});

test("reselecting identical map coordinates preserves settled community results", async ({
  page,
  context,
}) => {
  // Control only the map's coordinate event; retain the real home, API and database.
  // A map-pixel click may round to a different coordinate and cannot test this no-op.
  await page.route("**/src/LocationMap.tsx*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `import React from '/node_modules/.vite/deps/react.js';
      export default function Map({value,onChange}) {
        return React.createElement('button',{onClick:()=>onChange?.(value)},'เลือกจุดเดิมอีกครั้ง');
      }`,
    }),
  );
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 13.75, longitude: 100.5 });
  await signIn(page);
  await createReport(
    page,
    "Repeat selection regression",
    "Private repeat details",
    "Private street",
  );
  await page.goto("/");
  await page.getByText("ใกล้จุดที่เลือก (5 กม.)", { exact: true }).click();
  const total = page.locator(".community-metrics > div").first().locator("strong");
  await expect(total).toHaveText(/^[1-9]\d*$/);
  const before = await total.innerText();
  await page.getByRole("button", { name: "เลือกจุดเดิมอีกครั้ง" }).click();
  await expect(total).toHaveText(before);
  await expect(page.locator(".community-issue").first()).toBeVisible();
});

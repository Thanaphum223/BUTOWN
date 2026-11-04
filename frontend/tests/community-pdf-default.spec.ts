import { test, expect } from "@playwright/test";
import { signIn, createReport } from "./product-flow";

test("home defaults to municipality without needing location", async ({ page, context }) => {
  await context.clearPermissions();
  const requests: URL[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/community/complaints?")) requests.push(new URL(r.url()));
  });
  await signIn(page);
  await expect(page.getByRole("radio", { name: "ทั้งเทศบาล", exact: true })).toBeChecked();
  await expect(
    page.getByRole("heading", { name: "เรื่องแจ้งในเทศบาล", exact: true }),
  ).toBeVisible();
  expect(requests.length).toBeGreaterThan(0);
  expect(
    requests.every(
      (u) =>
        u.searchParams.get("scope") === "municipality" &&
        !u.searchParams.has("latitude") &&
        !u.searchParams.has("longitude"),
    ),
  ).toBeTruthy();
});

test("PDF-only complaint has a community cover and renders in the document reader", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 13.75, longitude: 100.5 });
  await signIn(page);
  const id = await createReport(
    page,
    "PDF preview regression",
    "Private PDF details",
    "Private street",
  );
  await page.goto("/");
  const card = page
    .locator(".community-issue")
    .filter({ hasText: "#" + id.slice(0, 8).toUpperCase() });
  await expect(card.getByText("เปิดดูเอกสาร PDF", { exact: true })).toBeVisible();
  await expect(card).toContainText("1 ไฟล์หลักฐาน");
  await card.getByRole("button", { name: /ดูหลักฐาน/ }).click();
  const detail = page.getByRole("dialog", { name: "รายละเอียดปัญหา", exact: true });
  await expect(detail.getByRole("heading", { name: "หลักฐานประกอบ" })).toBeVisible();
  await expect(detail.locator("video")).toHaveCount(0);
  await detail.getByRole("button", { name: /ดูเอกสาร$/ }).click();
  const canvas = page
    .getByRole("dialog")
    .locator("canvas[aria-label='เอกสาร initial-evidence.pdf หน้า 1']");
  await expect(canvas).toBeVisible();
  await expect
    .poll(() =>
      canvas.evaluate((c: HTMLCanvasElement) => {
        const pixels = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
        // The fixture contains black text. A blank canvas or loading background is insufficient.
        return pixels.some((channel, i) => i % 4 === 3 && channel > 0 && pixels[i - 3] < 100);
      }),
    )
    .toBeTruthy();
  await expect(page.getByText("หน้า 1 / 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "ดาวน์โหลดเอกสารต้นฉบับ" })).toHaveAttribute(
    "href",
    /^\/api\/media\//,
  );
});

test("emergency facilities request a maximum radius of fifty kilometres", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 13.75, longitude: 100.5 });
  await signIn(page);
  const response = page.waitForResponse((r) => r.url().includes("/api/emergency/nearby?"));
  await page.getByRole("link", { name: /เหตุฉุกเฉิน/ }).click();
  const result = await response;
  expect(new URL(result.url()).searchParams.get("radiusKm")).toBe("50");
  expect(result.ok()).toBeTruthy();
  const payload = await result.json();
  expect(payload.radiusKm).toBe(50);
  const distances = payload.places.map((p: { distanceMeters: number }) => p.distanceMeters);
  expect(distances.every((d: number) => d <= 50_000)).toBeTruthy();
  expect(distances).toEqual([...distances].sort((a, b) => a - b));
  await expect(page.getByText(/ภายใน.*50 กม\./)).toBeVisible();
});

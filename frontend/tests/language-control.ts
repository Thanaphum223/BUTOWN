import { expect, type Page } from "@playwright/test";

export async function switchLanguage(page: Page, language: string) {
  const group = page.getByRole("group", { name: "Language / ภาษา", exact: true });
  await expect(group).toHaveCount(1);
  const control = group.locator(`button[lang="${language}"]`);
  await expect(control).toBeVisible();
  await control.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2),
        );
      }),
    )
    .toBe(true);
  // Hit-testing and actionability prove the header or standalone control is reachable.
  await control.click();
  await expect(page.locator("html")).toHaveAttribute("lang", language);
}

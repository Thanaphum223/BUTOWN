import { expect, type Locator, type Page } from "@playwright/test";

export async function switchLanguage(page: Page, language: string, scope?: Locator) {
  const dialogs = page.getByRole("dialog");
  const target = scope ?? ((await dialogs.count()) ? dialogs.last() : page.locator("body"));
  const control = target.getByRole("combobox", { name: "Language / ภาษา", exact: true });
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
  // Hit-test above and Playwright actionability prove the active dialog owns
  // the pointer target; selectOption avoids platform-native popup automation.
  await control.click({ trial: true });
  await control.selectOption(language);
  await expect(page.locator("html")).toHaveAttribute("lang", language);
}

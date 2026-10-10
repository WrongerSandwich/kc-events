import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const scheme of ["light", "dark"] as const) {
  for (const path of ["/", "/explore", "/e/evt_e2e000000001", "/about", "/404"]) {
    test(`${path} passes axe in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.clock.setFixedTime(new Date("2026-10-05T17:00:00Z"));
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }
}

// The explorer's pressed filters, the open Custom dates fields, and the venue headings only show on a filtered link.
for (const scheme of ["light", "dark"] as const) {
  for (const path of ["/explore?when=7d&kind=music&region=johnson-county", "/explore?when=2026-10-09..2026-10-12&sort=venue"]) {
    test(`${path} passes axe in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.clock.setFixedTime(new Date("2026-10-05T17:00:00Z"));
      await page.goto(path);
      await expect(page.locator("html[data-slice]")).toHaveCount(0); // the explorer has its slice on screen
      await expect(page.locator(".rail [aria-pressed='true'], .rail details[open]").first()).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }
}

// A started pick folds into a muted row; opened, its text must still clear AA. 8:05 pm Tuesday in Chicago, after the
// show's 7:00 start.
for (const scheme of ["light", "dark"] as const) {
  test(`a started pick on / passes axe in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.clock.setFixedTime(new Date("2026-10-07T01:05:00Z"));
    await page.goto("/");
    await page.locator("details.started summary").click();
    await expect(page.locator("details.started li")).toHaveCount(1);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

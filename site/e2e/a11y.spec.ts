import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";

for (const scheme of ["light", "dark"] as const) {
  for (const path of ["/", "/explore", "/e/evt_e2e000000001", "/v/recordbar", "/k/music", "/r/johnson-county", "/v/kauffman-center-for-the-performing-arts", "/venues", "/changes", "/about", "/404"]) {
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

// Forced colours (Windows High Contrast) paint every button alike and drop backgrounds; the pressed filters and the
// week strip's running bands must still show (#194; audit 2026-10-21, A4). Chromium's emulation, not a real theme.
test.describe("forced colours", () => {
  test.use({ forcedColors: "active" });
  const fill = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor);

  test("/ passes axe, a pressed kind chip is filled and an unpressed one edged, and the running bands show", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-05T17:00:00Z"));
    await page.goto("/");
    // The running exhibition's band, before a kind filter narrows the strip to music.
    const band = page.locator(".lane.open").first();
    await expect(band).toBeVisible();
    expect(await fill(band)).not.toBe("rgba(0, 0, 0, 0)");
    const kinds = page.getByRole("region").nth(0).getByRole("list", { name: "Picks by kind" });
    const music = kinds.getByRole("button", { name: "1 music" });
    await music.click();
    await expect(music).toHaveAttribute("aria-pressed", "true");
    const other = kinds.getByRole("button", { pressed: false }).first();
    expect(await fill(music)).not.toBe(await fill(other));
    expect(await other.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe("solid");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  test("/explore passes axe, and a pressed filter in the rail is filled where an unpressed one is not", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-05T17:00:00Z"));
    await page.goto("/explore?when=7d&kind=music");
    await expect(page.locator("html[data-slice]")).toHaveCount(0);
    const rail = page.locator(".rail");
    const pressed = rail.getByRole("button", { name: "music", pressed: true });
    await expect(pressed).toBeVisible();
    const unpressed = rail.getByRole("button", { pressed: false }).first();
    expect(await fill(pressed)).not.toBe(await fill(unpressed));
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

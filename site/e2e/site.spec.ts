import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const BUILD_DAY = new Date("2026-10-05T17:00:00Z"); // noon Monday in Chicago
async function on(page: Page, when: Date, path: string) {
  await page.clock.setFixedTime(when);
  await page.goto(path);
}

test("the front page buckets the fixture's don't-miss events", async ({ page }) => {
  await on(page, BUILD_DAY, "/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What's on in Kansas City");
  const sections = page.getByRole("region");
  await expect(sections.nth(0)).toHaveAccessibleName("This week, Oct 5–11");
  // The exhibition is on now, so it sorts as today, ahead of Tuesday's show.
  await expect(sections.nth(0).getByRole("heading", { level: 3 })).toHaveText(["Closing exhibition", "Fabio Frizzi plays Fulci"]);
  await expect(sections.nth(1).getByRole("heading", { level: 3 })).toHaveText(["Mid-month reading"]);
  // Later picks are one line each, not cards.
  await expect(sections.nth(2)).toHaveAccessibleName("Later, after Oct 19");
  await expect(sections.nth(2).getByRole("listitem")).toHaveText([/November festival/]);
  // No hand-kept Always there pick matches the fixture, so the section is left out rather than shown empty.
  await expect(page.getByRole("heading", { name: "Always there" })).toHaveCount(0);
  await expect(page.getByText("Browse all 10 events")).toBeVisible();
  // On a Monday the week strip runs today through Sunday; a day with a pick jumps to its card.
  const week = page.getByRole("navigation", { name: "This week by day" });
  await expect(week.locator(".day")).toHaveCount(7);
  await week.getByRole("link", { name: "Tue 6: 1 pick" }).click();
  await expect(page).toHaveURL(/#pick-evt_e2e000000001$/);
  // Each card can go straight to a calendar.
  await expect(page.getByRole("link", { name: "Add Fabio Frizzi plays Fulci to your calendar" })).toHaveAttribute("href", "/e/evt_e2e000000001.ics");
});

test.describe("a visitor's browser in Tokyo", () => {
  // Already Wednesday there; the page still goes by Kansas City time.
  test.use({ timezoneId: "Asia/Tokyo" });

  test("a pick today reads Today, and Started once its start has passed", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install({ time: new Date("2026-10-06T23:00:00Z") }); // 6:00 pm Tuesday in Chicago
    await page.goto("/");
    const card = page.locator("#pick-evt_e2e000000001");
    await expect(card.locator(".tile .top")).toHaveText("Today");
    await expect(card).not.toHaveClass(/started/);
    await expect(card).toContainText("7:00 pm");
    await page.clock.setFixedTime(new Date("2026-10-07T00:05:00Z")); // 7:05 pm
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(card).toHaveClass(/started/);
    await expect(card).toContainText("Started 7:00 pm");
  });
});

test.describe("the favicon", () => {
  // Already Wednesday the 7th there; the icon still goes by Kansas City time.
  test.use({ timezoneId: "Asia/Tokyo" });

  test("shows today's day of month in the site's zone, and rolls over when the tab comes back", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-06T23:00:00Z") }); // 6:00 pm Tuesday the 6th in Chicago
    await page.goto("/about");
    const icon = page.locator('link[rel="icon"]');
    const day = async () => decodeURIComponent((await icon.getAttribute("href"))!).match(/>(\d+)<\/text>/)?.[1];
    await expect(icon).toHaveAttribute("href", /^data:image\/svg\+xml,/);
    expect(await day()).toBe("6");
    await page.clock.setFixedTime(new Date("2026-10-07T05:30:00Z")); // 12:30 am Wednesday the 7th
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(day).toBe("7");
  });
});

test.describe("a section's kind filter", () => {
  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("is a link to the explorer", async ({ page }) => {
      await page.goto("/");
      const kinds = page.getByRole("region").nth(0).getByRole("list", { name: "Picks by kind" });
      await expect(kinds.getByRole("link", { name: "1 music" })).toHaveAttribute("href", "/explore?when=weekend&kind=music&dontmiss=1");
      await expect(kinds.getByRole("button")).toHaveCount(0);
    });
  });

  test("hydrated, narrows its section in place, carries the kind to the explorer link, and says so", async ({ page }) => {
    await on(page, BUILD_DAY, "/");
    const week = page.getByRole("region").nth(0);
    const music = week.getByRole("button", { name: "1 music" });
    await expect(music).toHaveAttribute("aria-pressed", "false");
    await music.click();
    await expect(music).toHaveAttribute("aria-pressed", "true");
    await expect(week.getByRole("heading", { level: 3 })).toHaveText(["Fabio Frizzi plays Fulci"]);
    await expect(week.getByRole("status")).toHaveText("Showing 1 music pick");
    await expect(week.getByRole("link", { name: "These picks in the explorer" })).toHaveAttribute("href", "/explore?when=weekend&kind=music&dontmiss=1");
    await expect(page.getByRole("region").nth(1).getByRole("heading", { level: 3 })).toHaveText(["Mid-month reading"]);
    await music.click();
    await expect(week.getByRole("heading", { level: 3 })).toHaveText(["Closing exhibition", "Fabio Frizzi plays Fulci"]);
    await expect(week.getByRole("link", { name: "These picks in the explorer" })).toHaveAttribute("href", "/explore?when=weekend&dontmiss=1");
  });

  /** Presses the week's music chip and, a frame later, counts the running animations and the week's cards. */
  async function pressMusic(page: Page): Promise<{ animations: number; cards: number }> {
    await on(page, BUILD_DAY, "/");
    // Pressed and measured in the page, so nothing has a chance to finish between the press and the count.
    return page.getByRole("region").nth(0).getByRole("button", { name: "1 music" }).evaluate(async (music) => {
      (music as HTMLButtonElement).click();
      await new Promise(requestAnimationFrame);
      return { animations: document.getAnimations().length, cards: music.closest("section")!.querySelectorAll("article").length };
    });
  }

  test("reflows with motion by default", async ({ page }) => {
    expect((await pressMusic(page)).animations).toBeGreaterThan(0);
  });

  test("changes at once for a visitor who asks for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await pressMusic(page)).toEqual({ animations: 0, cards: 1 });
  });
});

test("the explorer honors the URL and writes it back", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore?when=weekend&kind=music");
  await expect(page.getByRole("status")).toHaveText("2 events");
  await expect(page.getByRole("article").getByRole("heading")).toHaveText(["Fabio Frizzi plays Fulci", "Friday night jazz"]);
  await page.getByRole("button", { name: "comedy" }).click();
  await expect(page).toHaveURL(/when=weekend&kind=music&kind=comedy/);
  await expect(page.getByRole("status")).toHaveText("3 events");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL("/explore");
});

test("the region fallback places a region-named neighborhood", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore?region=johnson-county");
  await expect(page.getByRole("article").getByRole("heading")).toHaveText(["County fair talk", "Friday night jazz"]);
});

// The explorer's two row layouts: under day headings, and with the day first (the venue sort).
const EXPLORER_SORTS = ["/explore", "/explore?sort=venue"];

for (const width of [1280, 1440]) {
  for (const path of EXPLORER_SORTS) {
    test(`an unflagged explorer row is one line, at most 28 px tall, at ${width} px on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await on(page, BUILD_DAY, path);
      const rows = page.locator("article.row:not(.flagged)");
      await expect(rows.first()).toBeVisible();
      for (const row of await rows.all()) {
        const box = await row.boundingBox();
        expect(box!.height).toBeLessThanOrEqual(28);
      }
    });
  }
}

// The fixture's haunted house opens later with a start time, so it carries both: "10:00 am–Wed Nov 18" under its day,
// and the widest line in the venue sort, "Wed Oct 28, 10:00 am–Wed Nov 18".
for (const width of [1024, 1280, 1440]) {
  for (const path of EXPLORER_SORTS) {
    test(`no explorer row truncates its date, and every row shows its neighborhood, at ${width} px on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await on(page, BUILD_DAY, path);
      await expect(page.locator("article.row").first()).toBeVisible();
      const rows = await page.locator("article.row").evaluateAll((els) =>
        els.map((row) => {
          const when = row.querySelector<HTMLElement>(".when")!;
          const where = row.querySelector<HTMLElement>(".where")!.getBoundingClientRect();
          const hood = row.querySelector<HTMLElement>(".hood")!;
          const hoodBox = hood.getBoundingClientRect();
          return {
            title: row.querySelector("h3")!.textContent,
            dated: !row.classList.contains("always"),
            dateFits: when.scrollWidth <= when.clientWidth,
            hood: hood.textContent,
            hoodShown: hoodBox.width > 0 && hoodBox.left >= where.left - 0.5 && hoodBox.right <= where.right + 0.5,
          };
        }),
      );
      expect(rows.length).toBe(9); // every active event but the always-there one, which the default filters leave out
      for (const row of rows) {
        if (row.dated) expect(row.dateFits, `${row.title}: date fits`).toBe(true);
        expect(row.hood, `${row.title}: neighborhood`).toMatch(/ · \S/);
        expect(row.hoodShown, `${row.title}: neighborhood visible`).toBe(true);
      }
    });
  }
}

test("explorer rows read their dates relative to the day headings and the sort", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore");
  const row = (title: string) => page.locator("article.row", { has: page.getByRole("heading", { name: title }) }).locator(".when");
  await expect(row("Closing exhibition")).toHaveText("Closes Sun Oct 11");
  await expect(row("Artboards")).toHaveText("Closes Thu Dec 31");
  await expect(row("November festival")).toHaveText("Runs through Sun Nov 22");
  await expect(row("Haunted house")).toHaveText("10:00 am–Wed Nov 18");
  const verified = page.locator("article.row", { has: page.getByRole("heading", { name: "Fabio Frizzi plays Fulci" }) }).locator(".verified");
  await expect(verified.locator('[aria-hidden="true"]')).toHaveText("✓ Oct 3");
  await expect(verified.locator(".visually-hidden")).toHaveText("Verified Oct 3");
  await on(page, BUILD_DAY, "/explore?sort=venue");
  await expect(row("Friday night jazz")).toHaveText("Fri Oct 9 · 8:00 pm");
  await expect(row("Haunted house")).toHaveText("Wed Oct 28, 10:00 am–Wed Nov 18");
});

test("an event page exists, downloads a calendar, and knows when it has passed", async ({ page }) => {
  await on(page, BUILD_DAY, "/e/evt_e2e000000001");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fabio Frizzi plays Fulci");
  await expect(page.getByText("Tuesday, October 6, 7:00 pm")).toBeVisible();
  // Playwright's text assertions skip <script> contents, so read the JSON-LD as text.
  expect(await page.locator('script[type="application/ld+json"]').textContent()).toContain('"@type":"Event"');
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Add to calendar" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("evt_e2e000000001.ics");
  const ics = readFileSync((await file.path())!, "utf8");
  expect(ics).toContain("BEGIN:VEVENT");
  expect(ics).toContain("SUMMARY:Fabio Frizzi plays Fulci");
  await expect(page.getByRole("status")).toHaveCount(0);
  await on(page, new Date("2026-10-12T17:00:00Z"), "/e/evt_e2e000000001");
  await expect(page.getByRole("status")).toContainText("This has already happened");
});

test("a past event has no page, and the 404 renders", async ({ page }) => {
  const res = await page.goto("/e/evt_e2e000000010");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nothing here");
});

test("the staleness banner appears after nine days", async ({ page }) => {
  await on(page, new Date("2026-10-15T17:00:00Z"), "/");
  // Each pick section has its own (empty) status region too, for its kind filter.
  await expect(page.getByRole("status").filter({ hasText: "last researched" })).toContainText("This list was last researched on Oct 5 and may have missed changes since.");
});

test("the dataset is published verbatim, and llms.txt and the sitemap point at the pages", async ({ request }) => {
  const json = await (await request.get("/events.json")).text();
  expect(JSON.parse(json).events).toHaveLength(11);
  expect(await (await request.get("/llms.txt")).text()).toContain("/events.json");
  expect(await (await request.get("/sitemap.xml")).text()).toContain("/e/evt_e2e000000001</loc>");
});

for (const path of ["/", "/explore", "/e/evt_e2e000000001", "/about", "/404"]) {
  test(`${path} makes no third-party requests and does not scroll sideways at 320px`, async ({ page }) => {
    const foreign: string[] = [];
    page.on("request", (r) => { if (!r.url().startsWith("http://localhost:4321")) foreign.push(r.url()); });
    await page.setViewportSize({ width: 320, height: 640 });
    await on(page, BUILD_DAY, path);
    await page.waitForLoadState("networkidle");
    expect(foreign).toEqual([]);
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

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

test("the tab's icon is the fountain mark: an ICO for Safari, then the SVG for the rest", async ({ page, request }) => {
  await page.goto("/about");
  const icons = page.locator('link[rel="icon"]');
  await expect(icons).toHaveCount(2);
  await expect(icons.nth(0)).toHaveAttribute("href", "/favicon.ico");
  await expect(icons.nth(1)).toHaveAttribute("href", "/favicon.svg");
  const svg = await request.get("/favicon.svg");
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");
  expect(await svg.text()).toContain("prefers-color-scheme:dark");
  const ico = await request.get("/favicon.ico");
  expect(ico.ok()).toBe(true);
  expect((await ico.body()).subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
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

/**
 * Scrolls far down the results. The fixture's list is a screen or two, short enough that a browser clamps the scroll
 * back by itself when the list shrinks, so padding stands in for a real week's 500 rows.
 */
async function deepInTheList(page: Page) {
  await expect(page.locator("article.row button.save").first()).toBeAttached(); // hydrated
  await page.locator(".results").evaluate((el) => { el.style.paddingBottom = "4000px"; });
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  await expect(page.locator(".results > article.row").first()).not.toBeInViewport();
}

/** The first result is on screen and clear of the sticky bar. */
async function expectFirstResultInView(page: Page) {
  const first = page.locator(".results > article.row").first();
  await expect(first).toBeInViewport();
  const barBottom = await page.locator(".bar").evaluate((el) => el.getBoundingClientRect().bottom);
  expect(await first.evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(barBottom - 1);
}

test.describe("the explorer's active slice at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("names a shared link's filters as pills without opening anything, and each pill removes only its filter", async ({ page }) => {
    await on(page, BUILD_DAY, "/explore?when=weekend&kind=music");
    const pills = page.getByRole("list", { name: "Active filters" }).getByRole("button");
    await expect(pills).toHaveText(["Through Sunday", "music"]);
    for (const pill of await pills.all()) await expect(pill).toBeInViewport();
    await expect(page.locator("#filter-sheet")).toBeHidden();
    await page.getByRole("button", { name: "Remove Through Sunday" }).click();
    await expect(page).toHaveURL("/explore?kind=music");
    await expect(pills).toHaveText(["music"]);
    await expect(page.getByRole("button", { name: /^Filters/ })).toHaveText("Filters (1)");
  });

  test("opens no sheet and shifts nothing when the page hydrates", async ({ page }) => {
    // The page's cumulative layout shift, summed as the browser reports it.
    type Shifts = { shifts: number };
    await page.addInitScript(() => {
      const w = window as unknown as Shifts;
      w.shifts = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.shifts += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.clock.setFixedTime(BUILD_DAY);
    await page.goto("/explore", { waitUntil: "commit" });
    const results = page.getByRole("region", { name: "Events" });
    await results.waitFor();
    const before = await results.evaluate((el) => el.getBoundingClientRect().top);
    await expect(page.locator("article.row button.save").first()).toBeAttached(); // hydrated
    await page.waitForLoadState("load");
    expect(await results.evaluate((el) => el.getBoundingClientRect().top)).toBe(before);
    await expect(page.locator("#filter-sheet")).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as Shifts).shifts)).toBeLessThan(0.01);
  });

  test("loads a filtered link without shifting it", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { shifts: number };
      w.shifts = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.shifts += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await on(page, BUILD_DAY, "/explore?when=weekend&kind=music");
    await expect(page.getByRole("status")).toHaveText("2 events");
    await expect(page.getByRole("region", { name: "Events" })).toBeVisible();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { shifts: number }).shifts)).toBeLessThan(0.1);
  });

  test.describe("before the explorer hydrates", () => {
    // Hold the explorer's script back, so the server HTML is what shows.
    test.beforeEach(async ({ page }) => { await page.route("**/_astro/Explorer*.js", () => {}); });

    test("a filtered link shows no rows, then shows them anyway if the script never comes", async ({ page }) => {
      await page.clock.setFixedTime(BUILD_DAY);
      // Not the load event, which the held script delays past the three-second fallback.
      await page.goto("/explore?kind=music", { waitUntil: "domcontentloaded" });
      // By id: role queries skip what is hidden, so they would wait for the reveal.
      const results = page.locator("#results");
      await expect(results).toBeAttached();
      await expect(results).toBeHidden();
      await expect(results).toBeVisible({ timeout: 6000 });
    });

    test("plain /explore shows its rows from the server HTML", async ({ page }) => {
      await on(page, BUILD_DAY, "/explore?utm_source=newsletter");
      await expect(page.getByRole("region", { name: "Events" })).toBeVisible();
      await expect(page.locator(".results > article.row").first()).toBeVisible();
    });
  });

  test("returns to the first result when a pill is removed deep in the list", async ({ page }) => {
    await on(page, BUILD_DAY, "/explore?when=30d");
    await deepInTheList(page);
    await page.getByRole("button", { name: "Remove Next 30 days" }).click();
    await expectFirstResultInView(page);
  });
});

test("returns to the first result when a filter changes deep in the list", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await on(page, BUILD_DAY, "/explore");
  await deepInTheList(page);
  await page.getByRole("button", { name: "music", exact: true }).click();
  await expectFirstResultInView(page);
});

test("without JavaScript, a filtered link says the filters need it", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await on(page, BUILD_DAY, "/explore?kind=music");
  // Playwright's text and role queries skip <noscript>, so find the notice by its class.
  const notice = page.locator(".no-js");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Filters need JavaScript.");
  await expect(page.getByRole("button", { name: /^Filters/ })).toBeHidden();
  await context.close();
});

test("the region fallback places a region-named neighborhood", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore?region=johnson-county");
  await expect(page.getByRole("article").getByRole("heading")).toHaveText(["County fair talk", "Friday night jazz"]);
});

// The explorer's two row layouts: under day headings, and with the day first (the venue sort).
const EXPLORER_SORTS = ["/explore", "/explore?sort=venue"];

/**
 * Opens the collapsed On now line, if there is one, so its rows are measured with the rest. The page is prerendered in
 * date order, On now closed; hydrating with another sort takes the line away, so wait for every island first (Astro
 * drops the ssr attribute as each one hydrates), else the click waits on a line that is gone.
 */
async function openOnNow(page: Page) {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
  const closed = page.locator(".results details:not([open]) > summary");
  if ((await closed.count()) > 0) await closed.click();
}

for (const js of [true, false]) {
  test(`bare /explore leads with a dated day, On now one closed line that opens, ${js ? "with" : "without"} JS`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: js });
    const page = await context.newPage();
    await on(page, BUILD_DAY, "/explore");
    const results = page.getByRole("region", { name: "Events" });
    // On now keeps its heading inside the closed line; the first heading outside it is a day.
    await expect(results.locator(":scope > h2").first()).toHaveText("Tue Oct 6");
    const summary = results.locator("details > summary");
    await expect(summary).toHaveText("On now · 2 events");
    await expect(results.getByRole("heading", { name: "Closing exhibition" })).toBeHidden();
    await summary.click();
    await expect(results.getByRole("heading", { name: "Closing exhibition" })).toBeVisible();
    await context.close();
  });
}

for (const width of [1280, 1440]) {
  for (const path of EXPLORER_SORTS) {
    test(`an unflagged explorer row is one line, at most 28 px tall, at ${width} px on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await on(page, BUILD_DAY, path);
      await openOnNow(page);
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
      await openOnNow(page);
      await expect(page.locator(".results > article.row").first()).toBeVisible();
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

// A phone row has one shape: the date, the title, then the kind chip leading the venue line, with Save at the end.
for (const path of EXPLORER_SORTS) {
  test(`every explorer row has the same shape and a 44 px Save at 390 px on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await on(page, BUILD_DAY, path);
    await openOnNow(page);
    await expect(page.locator("article.row button.save").first()).toBeVisible();
    const rows = await page.locator("article.row").evaluateAll((els) =>
      els.map((row) => {
        const box = (sel: string) => row.querySelector<HTMLElement>(sel)!.getBoundingClientRect();
        const shown = (sel: string) => box(sel).width > 0;
        return {
          title: row.querySelector("h3")!.textContent,
          row: row.getBoundingClientRect(),
          when: box(".when"), heading: box(".title"), where: box(".where"), chip: box(".chip"), save: box("button.save"),
          hostShown: shown(".host"), verifiedShown: shown(".verified"),
        };
      }),
    );
    expect(rows.length).toBe(9); // every row is dated: the default filters leave out the always-there one
    const chipLeft = rows[0]!.chip.left;
    for (const r of rows) {
      expect(r.when.bottom, `${r.title}: date above title`).toBeLessThanOrEqual(r.heading.top + 0.5);
      expect(r.heading.bottom, `${r.title}: title above venue`).toBeLessThanOrEqual(r.where.top + 0.5);
      expect(Math.abs(r.chip.top + r.chip.height / 2 - (r.where.top + r.where.height / 2)), `${r.title}: chip on the venue line`).toBeLessThan(2);
      expect(r.chip.left, `${r.title}: chip position`).toBeCloseTo(chipLeft, 0);
      expect(r.chip.right, `${r.title}: chip before venue`).toBeLessThanOrEqual(r.where.left + 0.5);
      expect(r.hostShown, `${r.title}: no host`).toBe(false);
      expect(r.verifiedShown, `${r.title}: no verified stamp`).toBe(false);
      expect(r.save.width, `${r.title}: Save width`).toBeGreaterThanOrEqual(44);
      expect(r.save.height, `${r.title}: Save height`).toBeGreaterThanOrEqual(44);
      expect(r.save.right, `${r.title}: Save at the row's end`).toBeGreaterThan(r.where.right);
      expect(r.row.right, `${r.title}: row inside the page`).toBeLessThanOrEqual(390);
    }
  });
}

// The kind chips make a column, so the kinds can be scanned down the list: the same left edge on every row.
for (const width of [1280, 1440]) {
  for (const path of EXPLORER_SORTS) {
    test(`the kind chips line up down the explorer at ${width} px on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await on(page, BUILD_DAY, path);
      await openOnNow(page);
      await expect(page.locator("article.row button.save").first()).toBeVisible();
      const lefts = await page.locator("article.row").evaluateAll((els) =>
        els.slice(0, 20).map((row) => ({
          title: row.querySelector("h3")!.textContent,
          chip: row.querySelector(".chip")!.getBoundingClientRect().left,
          host: row.querySelector(".host")!.getBoundingClientRect().left,
          save: row.querySelector("button.save")!.getBoundingClientRect().left,
        })),
      );
      expect(lefts.length).toBeGreaterThan(5);
      for (const r of lefts) {
        expect(r.chip, `${r.title}: chip`).toBeCloseTo(lefts[0]!.chip, 0);
        expect(r.host, `${r.title}: host`).toBeCloseTo(lefts[0]!.host, 0);
        expect(r.save, `${r.title}: save`).toBeCloseTo(lefts[0]!.save, 0);
      }
    });
  }
}

// In words, so it reads in grayscale and to a screen reader, and visible at every width.
for (const width of [390, 1440]) {
  test(`a don't-miss row says so in words at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await on(page, BUILD_DAY, "/explore");
    await openOnNow(page);
    const flagged = page.locator("article.row.flagged");
    await expect(flagged.first()).toBeVisible();
    for (const row of await flagged.all()) await expect(row.getByText("Don't miss", { exact: true })).toBeVisible();
    await expect(page.locator("article.row:not(.flagged)").getByText("Don't miss")).toHaveCount(0);
  });
}

test("an event page says don't miss in the explorer's words and case", async ({ page }) => {
  await on(page, BUILD_DAY, "/e/evt_e2e000000001");
  const tag = page.getByText("Don't miss", { exact: true });
  await expect(tag).toBeVisible();
  await expect(tag).toHaveCSS("text-transform", "none");
  await expect(tag).toHaveClass(/\bdont-miss\b/);
});

test("the site's page for an event sends the reader to the event's own page and names the list it was verified from", async ({ page }) => {
  await on(page, BUILD_DAY, "/e/evt_e2e000000001");
  await expect(page.getByRole("link", { name: "Details and tickets at tickets.example.com" })).toHaveAttribute("href", "https://tickets.example.com/frizzi");
  const verified = page.locator(".verified");
  await expect(verified).toContainText("Date and venue verified Oct 3 from the list at example.com.");
  await expect(verified.getByRole("link", { name: "the list at example.com" })).toHaveAttribute("href", "https://example.com/recordbar/frizzi");
  await expect(verified.getByRole("link", { name: "Wrong? Report it" })).toHaveAttribute("href", /Event%20page%3A%20https%3A%2F%2Ftickets.example.com%2Ffrizzi/);
});

test("an event with no page of its own links its primary page and says so", async ({ page }) => {
  await on(page, BUILD_DAY, "/e/evt_e2e000000002");
  await expect(page.getByRole("link", { name: "Details and tickets at example.com" })).toHaveAttribute("href", "https://example.com/westport/comedy");
  await expect(page.locator(".verified")).toContainText("verified Oct 3 from the page linked above.");
});

test("the front page card and the explorer row link the event's own page too", async ({ page }) => {
  await on(page, BUILD_DAY, "/");
  await expect(page.locator("#pick-evt_e2e000000001 a.primary")).toHaveAttribute("href", "https://tickets.example.com/frizzi");
  await page.setViewportSize({ width: 1280, height: 800 });
  await on(page, BUILD_DAY, "/explore");
  const row = page.locator("article.row", { has: page.getByRole("heading", { name: "Fabio Frizzi plays Fulci" }) });
  await expect(row.locator(".host")).toHaveAttribute("href", "https://tickets.example.com/frizzi");
  await expect(row.locator(".host")).toHaveText("tickets.example.com");
});

test("the explorer sets nothing in uppercase", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore");
  await expect(page.locator("article.row button.save").first()).toBeAttached(); // hydrated
  await expect(page.getByRole("group", { name: "When" }).first()).toBeVisible();
  const shouting = await page.locator(".explorer, .explorer *").evaluateAll((els) =>
    els.filter((el) => getComputedStyle(el).textTransform === "uppercase").map((el) => el.outerHTML.slice(0, 80)),
  );
  expect(shouting).toEqual([]);
});

test("From and To wait behind Custom dates…, out of the Tab order until it opens", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await on(page, BUILD_DAY, "/explore");
  await expect(page.locator("article.row button.save").first()).toBeAttached(); // hydrated
  await expect(page.getByLabel("From")).toBeHidden();
  await page.getByRole("button", { name: "All", exact: true }).focus();
  await page.keyboard.press("Tab");
  const custom = page.getByText("Custom dates…");
  await expect(custom).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(".rail button.kind").first()).toBeFocused(); // past the closed fields, to the kinds
  await custom.click();
  await custom.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("From")).toBeFocused();
});

test("a shared range link opens Custom dates… with its dates in the fields", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await on(page, BUILD_DAY, "/explore?when=2026-10-09..2026-10-12");
  await expect(page.getByLabel("From")).toBeVisible();
  await expect(page.getByLabel("From")).toHaveValue("2026-10-09");
  await expect(page.getByLabel("To")).toHaveValue("2026-10-12");
});

test("the venue sort puts each venue's rows under its own heading", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore?sort=venue");
  await expect(page.locator("article.row button.save").first()).toBeAttached(); // hydrated
  // In document order: [true, venue] for a heading, [false, venue] for a row.
  const items = await page.locator(".results > h2, .results > article.row").evaluateAll((els) =>
    els.map((el) => [el.tagName === "H2", (el.tagName === "H2" ? el : el.querySelector(".venue")!).textContent ?? ""] as const),
  );
  expect(items[0]![0], "a heading comes first").toBe(true);
  let heading = "";
  const seen: string[] = [];
  for (const [isHeading, venue] of items) {
    if (isHeading) { heading = venue; seen.push(venue); }
    else expect(venue, "a row sits under its venue's heading").toBe(heading);
  }
  expect(new Set(seen).size, "one heading per venue").toBe(seen.length);
  expect(seen.length).toBeGreaterThan(5);
});

test("from 800 px a row shows the host and the verified stamp again", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await on(page, BUILD_DAY, "/explore");
  await openOnNow(page);
  const row = page.locator("article.row").first();
  await expect(row.locator(".host")).toBeVisible();
  await expect(row.locator(".verified")).toBeVisible();
});

// The keyboard path: past the site header, search within three presses, then a skip link over the filters to the rows.
for (const width of [1280, 390]) {
  test(`the explorer's keyboard path at ${width} px: search, skip to results, two stops a row`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await on(page, BUILD_DAY, "/explore");
    await expect(page.locator("article.row button.save").first()).toBeAttached(); // hydrated
    const inHeader = () => page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest("header.site-header"));
    do await page.keyboard.press("Tab"); while (await inHeader());
    let presses = 1;
    while (!(await page.getByRole("searchbox", { name: "Search" }).evaluate((el) => el === document.activeElement)) && presses < 3) {
      await page.keyboard.press("Tab");
      presses++;
    }
    await expect(page.getByRole("searchbox", { name: "Search" })).toBeFocused();
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to results" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Events" })).toBeFocused();
    // From the results: On now's line, then each row's title and Save, with the host left out.
    await page.keyboard.press("Tab");
    await expect(page.locator(".results details > summary")).toBeFocused();
    const first = page.locator(".results > article.row").first();
    for (const stop of [first.locator("h3 a"), first.locator("button.save"), page.locator(".results > article.row").nth(1).locator("h3 a")]) {
      await page.keyboard.press("Tab");
      await expect(stop).toBeFocused();
    }
  });
}

// The search shortcut: / from the page, Esc to clear and then leave; a hint where there is a keyboard to press it.
test("/ focuses the explorer's search and Esc clears it, then leaves it", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore");
  await expect(page.locator("article.row button.save").first()).toBeAttached(); // hydrated
  const search = page.getByRole("searchbox", { name: "Search" });
  const hint = page.locator(".search .hint");
  await expect(hint).toBeVisible();
  await page.locator("body").press("/");
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await expect(hint).toBeHidden();
  await page.keyboard.press("/");
  await expect(search).toHaveValue("/");
  await search.fill("artboards");
  await expect(page).toHaveURL(/\?q=artboards$/);
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(page).toHaveURL(/\/explore$/);
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(search).not.toBeFocused();
  // Ctrl+/ and Cmd+/ belong to the browser and its extensions.
  for (const chord of ["Control+/", "Meta+/"]) {
    await page.keyboard.press(chord);
    await expect(search).not.toBeFocused();
  }
});

test.describe("a touch-only device", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("the explorer's search shows no / hint", async ({ page }) => {
    await on(page, BUILD_DAY, "/explore");
    await expect(page.locator("article.row button.save").first()).toBeAttached(); // hydrated
    expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(true);
    await expect(page.locator(".search .hint")).toBeAttached();
    await expect(page.locator(".search .hint")).toBeHidden();
  });
});

test("a don't-miss row keeps its why-line on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await on(page, BUILD_DAY, "/explore");
  await openOnNow(page);
  await expect(page.locator("article.row.flagged .why").first()).toBeVisible();
});

test("explorer rows read their dates relative to the day headings and the sort", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore");
  await openOnNow(page);
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

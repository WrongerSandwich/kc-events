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
  // The lede says who makes the picks and where a date comes from (the venue's list, as the event page's verified line says).
  await expect(page.locator(".lede")).toContainText("chosen and explained by a model under written rules. Every date is read from the venue's or organizer's own page");
  const sections = page.getByRole("region");
  await expect(sections.nth(0)).toHaveAccessibleName("This week, Oct 5–11");
  // The exhibition is on now, so it sorts as today, ahead of Tuesday's show.
  await expect(sections.nth(0).getByRole("heading", { level: 3 })).toHaveText(["Closing exhibition", "Fabio Frizzi plays Fulci"]);
  // After this week, picks are one line each, not cards (#184).
  await expect(sections.nth(1).locator("article")).toHaveCount(0);
  await expect(sections.nth(1).getByRole("listitem")).toHaveText([/Mid-month reading/]);
  await expect(sections.nth(2)).toHaveAccessibleName("Later, after Oct 19");
  await expect(sections.nth(2).getByRole("listitem")).toHaveText([/November festival/]);
  // One link to the explorer's picks on the page, under this week's (#184).
  await expect(page.getByRole("link", { name: /in the explorer/ })).toHaveText(["This week's picks in the explorer"]);
  // No hand-kept Always there pick matches the fixture, so the section is left out rather than shown empty.
  await expect(page.getByRole("heading", { name: "Always there" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Browse all 10 events" })).toHaveAttribute("href", "/explore?when=all&recurring=1");
  // On a Monday the week strip runs today through Sunday; a day with a pick jumps to its card.
  const week = page.getByRole("navigation", { name: "This week by day" });
  await expect(week.locator(".day")).toHaveCount(7);
  await week.getByRole("link", { name: "Tue 6: 1 pick" }).click();
  await expect(page).toHaveURL(/#pick-evt_e2e000000001$/);
  // Each card can go straight to a calendar.
  await expect(page.getByRole("link", { name: "Add to calendar: Fabio Frizzi plays Fulci" })).toHaveAttribute("href", "/e/evt_e2e000000001.ics");
});

test("on a phone the front page's h1 stays a step above its section headings (#184)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await on(page, BUILD_DAY, "/");
  const size = (selector: string) => page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await size("h1")).toBeGreaterThan(await size("h2.section-heading"));
});

test("at 320 px the event page sets its tile above the title, which gets the whole width (#184)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await on(page, BUILD_DAY, "/e/evt_e2e000000001");
  const tile = (await page.locator(".head .tile").boundingBox())!;
  const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
  expect(title.y).toBeGreaterThanOrEqual(tile.y + tile.height);
  expect(title.x).toBeLessThanOrEqual(tile.x + 1);
});

test.describe("a visitor's browser in Tokyo", () => {
  // Already Wednesday there; the page still goes by Kansas City time.
  test.use({ timezoneId: "Asia/Tokyo" });

  test("a pick today reads Today, then folds into the started line once its start has passed", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install({ time: new Date("2026-10-06T23:00:00Z") }); // 6:00 pm Tuesday in Chicago
    await page.goto("/");
    const card = page.locator("#pick-evt_e2e000000001");
    await expect(card.locator(".tile .top")).toHaveText("Today");
    await expect(card).not.toHaveClass(/started/);
    await expect(card).toContainText("7:00 pm");
    await page.clock.setFixedTime(new Date("2026-10-07T00:05:00Z")); // 7:05 pm
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    // No longer a card: a row in the fold at the section's end, which the week strip's Today opens.
    await expect(card).not.toHaveClass(/card/);
    const fold = page.locator("details.started");
    await expect(fold.locator("summary")).toHaveText("1 earlier today");
    await expect(card).toBeHidden();
    await page.goto("/#pick-evt_e2e000000001"); // a link straight to it opens the fold
    await expect(card).toBeVisible();
    await expect(card).toContainText("7:00 pm");
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

test("the about page's coffee badge links to the support page and is served from the site", async ({ page }) => {
  await page.goto("/about");
  const badge = page.getByRole("link", { name: "Support KC This Week on Buy Me a Coffee" });
  await expect(badge).toHaveAttribute("href", "https://buymeacoffee.com/EvanTrout");
  const img = badge.locator("img");
  await expect(img).toHaveAttribute("src", "/buy-me-a-coffee.png");
  expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
});

test.describe("a section's kind filter", () => {
  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("is a link to the explorer", async ({ page }) => {
      await page.goto("/");
      const kinds = page.getByRole("region").nth(0).getByRole("list", { name: "Picks by kind" });
      await expect(kinds.getByRole("link", { name: "1 Music" })).toHaveAttribute("href", "/explore?when=weekend&kind=music&picks=1");
      await expect(kinds.getByRole("button")).toHaveCount(0);
    });
  });

  test("hydrated, narrows its section in place, carries the kind to the explorer link, and says so", async ({ page }) => {
    await on(page, BUILD_DAY, "/");
    const week = page.getByRole("region").nth(0);
    const music = week.getByRole("button", { name: "1 Music" });
    await expect(music).toHaveAttribute("aria-pressed", "false");
    await music.click();
    await expect(music).toHaveAttribute("aria-pressed", "true");
    await expect(week.getByRole("heading", { level: 3 })).toHaveText(["Fabio Frizzi plays Fulci"]);
    await expect(week.getByRole("status")).toHaveText("Showing 1 music pick");
    await expect(week.getByRole("link", { name: "This week's picks in the explorer" })).toHaveAttribute("href", "/explore?when=weekend&kind=music&picks=1");
    await expect(page.getByRole("region").nth(1).getByRole("listitem")).toHaveText([/Mid-month reading/]);
    await music.click();
    await expect(week.getByRole("heading", { level: 3 })).toHaveText(["Closing exhibition", "Fabio Frizzi plays Fulci"]);
    await expect(week.getByRole("link", { name: "This week's picks in the explorer" })).toHaveAttribute("href", "/explore?when=weekend&picks=1");
  });

  /**
   * Presses the week's music chip, then watches frame by frame until the cards have changed: the most animations seen
   * running and the week's cards. A view transition updates the list a frame or two after the press, not at it.
   */
  async function pressMusic(page: Page): Promise<{ animations: number; cards: number }> {
    await on(page, BUILD_DAY, "/");
    // Pressed and measured in the page, so nothing has a chance to finish between the press and the count.
    return page.getByRole("region").nth(0).getByRole("button", { name: "1 Music" }).evaluate(async (music) => {
      const section = music.closest("section")!;
      const before = section.querySelectorAll("article").length;
      (music as HTMLButtonElement).click();
      // Half a second at most; and a few frames past the change, since the transition's animations start after it.
      const maxFrames = 30;
      const settleFrames = 3;
      let animations = 0;
      for (let frame = 0; frame < maxFrames; frame++) {
        await new Promise(requestAnimationFrame);
        animations = Math.max(animations, document.getAnimations().length);
        if (section.querySelectorAll("article").length !== before && frame >= settleFrames) break;
      }
      return { animations, cards: section.querySelectorAll("article").length };
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
  await expect(page.getByRole("status")).toHaveText("2 events this week");
  await expect(page.getByRole("article").getByRole("heading")).toHaveText(["Fabio Frizzi plays Fulci", "Friday night jazz"]);
  await page.getByRole("button", { name: /^Comedy\b/ }).click();
  await expect(page).toHaveURL(/\/explore\?kind=music&kind=comedy$/); // the week is the default, so the URL leaves it out
  await expect(page.getByRole("status")).toHaveText("3 events this week");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL("/explore");
});

test("the explorer's picks=1 shows only the picks, under a Don't miss pill, and writes it back (#185)", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore?when=all&picks=1");
  const rows = page.locator(".results article.row");
  await expect(rows.first()).toBeVisible();
  await expect(page.locator(".results article.row:not(.flagged)")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Active filters" }).getByRole("button", { name: "Remove Don't miss" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Don't miss only", exact: true })).toBeChecked();
  await page.getByRole("button", { name: /^Comedy\b/ }).click();
  await expect(page).toHaveURL(/[?&]picks=1(&|$)/);
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
    await on(page, BUILD_DAY, "/explore?when=30d&kind=music");
    // A kind is its pressed chip in the bar's row and a pill too, which stays in sight when the chip is swiped away.
    const pills = page.getByRole("list", { name: "Active filters" }).getByRole("button");
    await expect(pills).toHaveText(["Next 30 days", "Music"]);
    await expect(page.getByRole("group", { name: "Kinds" }).getByRole("button", { name: /^Music\b/ })).toHaveAttribute("aria-pressed", "true");
    for (const pill of await pills.all()) await expect(pill).toBeInViewport();
    await expect(page.locator("#filter-sheet")).toBeHidden();
    await page.getByRole("button", { name: "Remove Next 30 days" }).click();
    await expect(page).toHaveURL("/explore?when=all&kind=music");
    // Every date is not what the page opens on, so it is a filter too, with a pill that goes back to the week.
    await expect(pills).toHaveText(["Every date", "Music"]);
    // The kinds are the bar's on a phone, so Filters (n) counts the date alone.
    await expect(page.getByRole("button", { name: /^Filters/ })).toHaveText("Filters (1)");
  });

  test("scrolled, the bar keeps the kinds, the sort and Filters at the top and lets search go (the 2026-10-25 critique)", async ({ page }) => {
    await on(page, BUILD_DAY, "/explore?when=all");
    await expect(page.locator("article.row button.save").first()).toBeAttached(); // hydrated
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByRole("searchbox")).not.toBeInViewport();
    await expect(page.getByRole("group", { name: "Kinds" }).getByRole("button").first()).toBeInViewport();
    await expect(page.getByRole("button", { name: /^Filters/ })).toBeInViewport();
    await expect(page.getByRole("combobox", { name: "Sort" })).toBeInViewport();
    // Stuck, it is two lines at most: the controls, then the count and the pills.
    expect(await page.locator(".bar").evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThan(120);
    // Focused from down the list (the / shortcut; Shift+Tab and a removed last pill likewise), search comes back.
    await page.keyboard.press("/");
    await expect(page.getByRole("searchbox")).toBeFocused();
    await expect(page.getByRole("searchbox")).toBeInViewport({ ratio: 1 });
    // The day headings stick under the whole bar meanwhile.
    const bar = await page.locator(".bar").evaluate((el) => el.getBoundingClientRect().bottom);
    const heading = await page.locator(".section-heading.group").last().evaluate((el) => getComputedStyle(el).top);
    expect(Math.abs(parseFloat(heading) - bar)).toBeLessThan(2);
  });

  test("the saved view's stuck bar keeps to two lines too, Share and Export as their icons", async ({ page }) => {
    await on(page, BUILD_DAY, "/explore?when=all");
    await page.locator("article.row button.save").first().click();
    await page.goto("/explore?saved=1");
    await expect(page.getByRole("button", { name: /^Export saved/ })).toBeVisible();
    // What sticks: the bar's height less the search line that scrolls away (a short list may not scroll at all).
    expect(await page.locator(".bar").evaluate((el) => (el as HTMLElement).offsetHeight + parseFloat(getComputedStyle(el).top))).toBeLessThan(120);
  });

  test("the kinds swipe in one line, and a shared link's kind off its end is brought into view", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await on(page, BUILD_DAY, "/explore");
    const kinds = page.getByRole("group", { name: "Kinds" });
    await expect(kinds.getByRole("button").last()).not.toBeInViewport({ ratio: 1 }); // off the line's end
    const slug = (await kinds.getByRole("button").last().getAttribute("class"))!.match(/kind-([a-z-]+)/)![1];
    await on(page, BUILD_DAY, `/explore?kind=${slug}`);
    await expect(page.locator("article.row button.save").first()).toBeAttached(); // hydrated
    await expect(kinds.locator("[aria-pressed=true]")).toBeInViewport({ ratio: 1 });
    // The row fades at its end while swiping: the scroll-driven animation runs (a minified shorthand once dropped it).
    expect(await kinds.evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");
    // A chip tabbed to at the row's edge comes fully into view.
    await kinds.getByRole("button").nth(2).focus();
    await expect(kinds.getByRole("button").nth(2)).toBeInViewport({ ratio: 1 });
    // Still one line: the kinds and Filters share it.
    const [chip, filters] = await Promise.all([kinds.getByRole("button").first().boundingBox(), page.getByRole("button", { name: /^Filters/ }).boundingBox()]);
    expect(Math.abs(chip!.y + chip!.height / 2 - (filters!.y + filters!.height / 2))).toBeLessThan(2);
  });

  test("opening Filters puts focus in the sheet, not on the pills between it and the button", async ({ page }) => {
    await on(page, BUILD_DAY, "/explore?kind=music");
    await expect(page.locator("article.row button.save").first()).toBeAttached(); // hydrated
    await page.getByRole("button", { name: /^Filters/ }).click();
    // The first it shows: the kinds are the bar's on a phone, so the sheet starts at the dates.
    await expect(page.locator("#filter-sheet button").filter({ visible: true }).first()).toBeFocused();
    await expect(page.locator("#filter-sheet .kinds").first()).toBeHidden();
  });

  test("never leaves a control tabbed to under the sheet's Show button (WCAG 2.4.11)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 500 }); // short, so the sheet runs past the screen's foot
    await on(page, BUILD_DAY, "/explore");
    await page.getByRole("button", { name: /^Filters/ }).click();
    const sheet = page.locator("#filter-sheet");
    await sheet.locator("button, input").first().focus();
    let checked = 0;
    for (let i = 0; i < 60; i++) {
      const under = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const button = document.querySelector<HTMLElement>("#filter-sheet .show-results")!;
        if (!document.getElementById("filter-sheet")!.contains(el) || el === button) return undefined;
        return el.getBoundingClientRect().bottom > button.getBoundingClientRect().top + 1;
      });
      if (under === undefined) break;
      expect(under).toBe(false);
      checked++;
      await page.keyboard.press("Tab");
    }
    expect(checked).toBeGreaterThan(5);
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
    await expect(page.getByRole("status")).toHaveText("2 events this week");
    await expect(page.getByRole("region", { name: "Events" })).toBeVisible();
    // Any shift the hydrated render causes is laid out and observed by the second frame after load.
    await page.waitForLoadState("load");
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
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
  await page.getByRole("button", { name: /^Music\b/ }).click();
  await expectFirstResultInView(page);
});

test("without JavaScript, a filtered link says the filters need it", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const violations: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  await on(page, BUILD_DAY, "/explore?kind=music");
  // Playwright's text and role queries skip <noscript>, so find the notice by its class.
  const notice = page.locator(".no-js");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Filters need JavaScript.");
  // It points to pages that list further ahead without JavaScript.
  await expect(notice).toContainText("list three weeks ahead");
  await expect(notice.locator("a[href^='/k/']")).toHaveCount(1);
  await expect(notice.locator("a[href^='/r/']")).toHaveCount(1);
  // Hidden by the <noscript> style, which the CSP lets through by its hash.
  await expect(page.getByRole("button", { name: /^Filters/ })).toBeHidden();
  // So are the controls that would do nothing under it: search, sort, the phone bar's dates and export.
  await expect(page.getByRole("searchbox")).toBeHidden();
  await expect(page.getByRole("combobox", { name: "Sort" })).toBeHidden();
  await expect(page.locator(".bar-kinds")).toBeHidden();
  await expect(page.getByRole("button", { name: /^Export/ })).toBeHidden();
  expect(violations).toEqual([]);
  await context.close();
});

test("the region fallback places a region-named neighborhood", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore?region=johnson-county");
  await expect(page.getByRole("article").getByRole("heading")).toHaveText(["County fair talk", "Friday night jazz"]);
});

// The explorer's two row layouts: under day headings, and with the day first (the venue sort).
const EXPLORER_SORTS = ["/explore?when=all", "/explore?when=all&sort=venue"];

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
  test(`bare /explore opens on the week, a short On now open, with Keep going after Sunday, ${js ? "with" : "without"} JS (#183)`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: js });
    const page = await context.newPage();
    await on(page, BUILD_DAY, "/explore");
    const results = page.getByRole("region", { name: "Events" });
    await expect(results.getByRole("heading", { level: 2 })).toHaveText(["On now", "Tue Oct 6", "Thu Oct 8", "Fri Oct 9", "Sat Oct 10"]);
    await expect(results.locator("details")).toHaveCount(0);
    await expect(results.getByRole("heading", { name: "Closing exhibition" })).toBeVisible();
    const keep = results.getByRole("link", { name: /^Keep going/ });
    const all = results.getByRole("link", { name: "or every date · 9" });
    if (js) {
      await expect(keep).toHaveText("Keep going: next week · 1 event →");
      await expect(keep).toHaveAttribute("href", "/explore?when=2026-10-05..2026-10-18");
      await expect(all).toHaveAttribute("href", "/explore?when=all");
    } else {
      // Without JavaScript either link would reload this same week, so the noscript style hides them.
      await expect(keep).toBeHidden();
      await expect(all).toBeHidden();
    }
    await context.close();
  });
}

test("Keep going adds next week below where the reader is, without moving the page (#183)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await on(page, BUILD_DAY, "/explore");
  await expect(page.locator("article.row button.save").first()).toBeAttached(); // hydrated
  const keep = page.getByRole("link", { name: /^Keep going/ });
  await keep.scrollIntoViewIfNeeded();
  const before = await keep.evaluate((el) => el.getBoundingClientRect().top);
  await keep.click();
  await expect(page).toHaveURL("/explore?when=2026-10-05..2026-10-18");
  const next = page.getByRole("heading", { level: 2, name: "Sat Oct 17" });
  await expect(next).toBeFocused();
  await expect(next).toBeInViewport();
  // The new first day sits where the button was, the week above it unmoved.
  expect(Math.abs((await next.evaluate((el) => el.getBoundingClientRect().top)) - before)).toBeLessThan(2);
  await expect(page.getByRole("article").filter({ hasText: "Mid-month reading" })).toBeVisible();
  // Nothing is listed the week after, so only every date is left to offer.
  await expect(page.getByRole("link", { name: /^Keep going/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Every date · 9" })).toBeVisible();
});

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
      // Every active event but the always-there one, which the default filters leave out; the date sort lists the
      // three-day November festival under each of its days (#90).
      expect(rows.length).toBe(path === EXPLORER_SORTS[0] ? 11 : 9);
      expect(new Set(rows.map((r) => r.title)).size).toBe(9);
      for (const row of rows) {
        if (row.dated) expect(row.dateFits, `${row.title}: date fits`).toBe(true);
        expect(row.hood, `${row.title}: neighborhood`).toMatch(/ · \S/);
        expect(row.hoodShown, `${row.title}: neighborhood visible`).toBe(true);
      }
    });
  }
}

// A phone row has one shape: the date, the title, then the kind chip leading the venue line, with Save at the end. The
// title link, the chip and the venue are 24 px tall, so none crowds another under a finger (WCAG 2.5.8, #182).
for (const path of EXPLORER_SORTS) {
  test(`every explorer row has the same shape, 24 px links and a 44 px Save at 390 px on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await on(page, BUILD_DAY, path);
    await openOnNow(page);
    await expect(page.locator("article.row button.save").first()).toBeVisible();
    const rows = await page.locator("article.row").evaluateAll((els) =>
      els.map((row) => {
        const box = (sel: string) => row.querySelector<HTMLElement>(sel)!.getBoundingClientRect();
        const shown = (sel: string) => (row.querySelector<HTMLElement>(sel)?.getBoundingClientRect().width ?? 0) > 0;
        return {
          title: row.querySelector("h3")!.textContent,
          row: row.getBoundingClientRect(),
          when: box(".when"), heading: box(".title"), where: box(".where"), chip: box(".chip"), save: box("button.save"),
          link: box(".title a"), venue: box("a.venue"), verifiedShown: shown(".verified"),
        };
      }),
    );
    expect(rows.length).toBe(path === EXPLORER_SORTS[0] ? 11 : 9); // every row is dated: the default filters leave out the always-there one; the festival is under each of its days
    const chipLeft = rows[0]!.chip.left;
    for (const r of rows) {
      expect(r.when.bottom, `${r.title}: date above title`).toBeLessThanOrEqual(r.heading.top + 0.5);
      expect(r.heading.bottom, `${r.title}: title above venue`).toBeLessThanOrEqual(r.where.top + 0.5);
      expect(Math.abs(r.chip.top + r.chip.height / 2 - (r.where.top + r.where.height / 2)), `${r.title}: chip on the venue line`).toBeLessThan(2);
      expect(r.chip.left, `${r.title}: chip position`).toBeCloseTo(chipLeft, 0);
      expect(r.chip.right, `${r.title}: chip before venue`).toBeLessThanOrEqual(r.where.left + 0.5);
      expect(r.link.height, `${r.title}: title link height`).toBeGreaterThanOrEqual(24);
      expect(r.chip.height, `${r.title}: chip height`).toBeGreaterThanOrEqual(24);
      expect(r.venue.height, `${r.title}: venue link height`).toBeGreaterThanOrEqual(24);
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
          save: row.querySelector("button.save")!.getBoundingClientRect().left,
        })),
      );
      expect(lefts.length).toBeGreaterThan(5);
      for (const r of lefts) {
        expect(r.chip, `${r.title}: chip`).toBeCloseTo(lefts[0]!.chip, 0);
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
    // Once each: on the date line on a phone, so a wrapped title cannot throw it to the edge, beside the title wide (#184).
    const where = width < 1024 ? ".when-line" : ".title";
    for (const row of await flagged.all()) {
      const shown = row.getByText("Don't miss", { exact: true }).filter({ visible: true });
      await expect(shown).toHaveCount(1);
      await expect(row.locator(where).getByText("Don't miss", { exact: true })).toBeVisible();
    }
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
  await expect(page.getByRole("link", { name: "Tickets at tickets.example.com" })).toHaveAttribute("href", "https://tickets.example.com/frizzi");
  const verified = page.locator(".verified");
  await expect(verified).toContainText("Date and venue verified Oct 3 from the list at example.com. The reason and description are written by a model.");
  await expect(verified.getByRole("link", { name: "the list at example.com" })).toHaveAttribute("href", "https://example.com/recordbar/frizzi");
  await page.getByText("Wrong? Report it").click();
  await expect(page.getByRole("link", { name: "report it on GitHub" })).toHaveAttribute("href", /template=wrong-listing\.yml&.*event-page=https%3A%2F%2Ftickets\.example\.com%2Ffrizzi/);
});

test("an event page says what the event is when the job read a description, and nothing when it did not", async ({ page }) => {
  await on(page, BUILD_DAY, "/e/evt_e2e000000001");
  await expect(page.locator(".about")).toHaveText("The composer and his band play his scores for Lucio Fulci's films live, with clips on screen.");
  await on(page, BUILD_DAY, "/e/evt_e2e000000002");
  await expect(page.locator("article.event")).toBeVisible();
  await expect(page.locator(".about")).toHaveCount(0);
});

test("the price and age limit an own page gave show on the card and the event page, and in its offers (#133)", async ({ page }) => {
  await on(page, BUILD_DAY, "/");
  await expect(page.locator("#pick-evt_e2e000000001 .admission")).toHaveText("$20–$25 · 21+");
  await on(page, BUILD_DAY, "/e/evt_e2e000000001");
  await expect(page.locator(".admission")).toHaveText("$20–$25 · 21+");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
  expect(ld.offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: 20, highPrice: 25, priceCurrency: "USD" });
  await on(page, BUILD_DAY, "/e/evt_e2e000000002");
  await expect(page.locator("article.event")).toBeVisible();
  await expect(page.locator(".admission")).toHaveCount(0);
});

test("an event with no page of its own links its primary page and says so", async ({ page }) => {
  await on(page, BUILD_DAY, "/e/evt_e2e000000002");
  await expect(page.getByRole("link", { name: "Details at example.com" })).toHaveAttribute("href", "https://example.com/westport/comedy");
  await expect(page.locator(".verified")).toContainText("verified Oct 3 from the page linked above.");
});

// The explorer row leaves the source to the event page, which links it (#182).
test("the front page card links the event's own page too", async ({ page }) => {
  await on(page, BUILD_DAY, "/");
  await expect(page.locator("#pick-evt_e2e000000001 a.primary")).toHaveAttribute("href", "https://tickets.example.com/frizzi");
  await page.setViewportSize({ width: 1280, height: 800 });
  await on(page, BUILD_DAY, "/explore");
  const row = page.locator("article.row", { has: page.getByRole("heading", { name: "Fabio Frizzi plays Fulci" }) });
  await expect(row.locator('a[href="https://tickets.example.com/frizzi"]')).toHaveCount(0);
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
  await page.getByRole("button", { name: "Every date", exact: true }).focus();
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
    else expect(venue === heading || venue.startsWith(`${heading} · `), `a row (${venue}) sits under its venue's heading (${heading}), its room after it`).toBe(true);
  }
  expect(new Set(seen).size, "one heading per venue").toBe(seen.length);
  expect(seen.length).toBeGreaterThan(5);
});

// Every fixture event was last verified before the run, so every row has its stamp.
test("from 800 px a row shows its verified stamp again", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await on(page, BUILD_DAY, "/explore");
  await openOnNow(page);
  const row = page.locator("article.row").first();
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
    // From the results (On now, short, is open like a day): each row's title and Save, its venue and chip left out.
    const first = page.locator(".results > article.row").first();
    for (const stop of [first.locator("h3 a"), first.locator("button.save"), page.locator(".results > article.row").nth(1).locator("h3 a")]) {
      await page.keyboard.press("Tab");
      await expect(stop).toBeFocused();
    }
  });

  // Rows are two stops each, so a week is hundreds of stops from the footer (#194; audit 2026-10-21, A8).
  test(`the explorer's keyboard path at ${width} px: skip past results to Keep going`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await on(page, BUILD_DAY, "/explore");
    await expect(page.locator("article.row button.save").first()).toBeAttached(); // hydrated
    await page.getByRole("link", { name: "Skip to results" }).focus();
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip past results" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /^Keep going/ })).toBeFocused();
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
  await on(page, BUILD_DAY, "/explore?when=all");
  await openOnNow(page);
  const row = (title: string) => page.locator("article.row", { has: page.getByRole("heading", { name: title }) }).locator(".when");
  await expect(row("Closing exhibition")).toHaveText("Closes Sun Oct 11");
  await expect(row("Artboards")).toHaveText("Closes Thu Dec 31");
  // A multi-day one-off is under each of its days, never under On now (#90).
  await expect(row("November festival")).toHaveText(["Through Sun Nov 22", "Through Sun Nov 22", "Through Sun Nov 22"]);
  await expect(page.locator("details.collapsed article.row", { has: page.getByRole("heading", { name: "November festival" }) })).toHaveCount(0);
  await expect(page.locator(".count")).toHaveText("9 events"); // the festival's three rows count once
  await expect(row("Haunted house")).toHaveText("10:00 am–Wed Nov 18");
  const verified = page.locator("article.row", { has: page.getByRole("heading", { name: "Fabio Frizzi plays Fulci" }) }).locator(".verified");
  await expect(verified.locator('[aria-hidden="true"]')).toHaveText("✓ Oct 3");
  await expect(verified.locator(".visually-hidden")).toHaveText("Date and venue verified Oct 3");
  await expect(verified).toHaveAttribute("title", "Date and venue verified Oct 3");
  await on(page, BUILD_DAY, "/explore?when=all&sort=venue");
  await expect(row("Friday night jazz")).toHaveText("Fri Oct 9 · 8:00 pm");
  await expect(row("Haunted house")).toHaveText("Wed Oct 28, 10:00 am–Wed Nov 18");
});

test("an event page exists, downloads a calendar, and knows when it has passed", async ({ page }) => {
  await on(page, BUILD_DAY, "/e/evt_e2e000000001");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fabio Frizzi plays Fulci");
  await expect(page.getByText("Tuesday, October 6, 7:00 pm")).toBeVisible();
  // Playwright's text assertions skip <script> contents, so read the JSON-LD as text.
  expect(await page.locator('script[type="application/ld+json"]').first().textContent()).toContain('"@type":"Event"');
  const download = page.waitForEvent("download");
  await page.locator("summary", { hasText: "Add to calendar" }).click();
  await page.getByRole("link", { name: "Apple, Outlook and others (.ics)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("evt_e2e000000001.ics");
  const ics = readFileSync((await file.path())!, "utf8");
  expect(ics).toContain("BEGIN:VEVENT");
  expect(ics).toContain("SUMMARY:Fabio Frizzi plays Fulci");
  await expect(page.getByRole("status")).toHaveCount(0);
  await on(page, new Date("2026-10-12T17:00:00Z"), "/e/evt_e2e000000001");
  await expect(page.getByRole("status")).toContainText("This has already happened");
  // Gone: the week instead of tickets, and nothing to put in a calendar.
  await expect(page.getByRole("link", { name: "See what's on this week" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tickets at tickets.example.com" })).toBeHidden();
  await expect(page.locator("summary", { hasText: "Add to calendar" })).toBeHidden();
});

test("a past event has no page, and the 404 renders", async ({ page }) => {
  const res = await page.goto("/e/evt_e2e000000010");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nothing here");
});

test("the staleness banner appears after nine days", async ({ page }) => {
  await on(page, new Date("2026-10-15T17:00:00Z"), "/");
  // Each pick section has its own (empty) status region too, for its kind filter.
  const banner = page.getByRole("status").filter({ hasText: "last researched" });
  await expect(banner).toContainText("This list was last researched on Oct 5 and may have missed changes since.");
  // The header's one width (#181), and a warning sign and a lead in words (#184), on a page with no island (#195).
  await expect(banner.locator("p")).toHaveClass("wide");
  await expect(banner.locator("svg use")).toHaveAttribute("href", "#ui-icon-alert");
  await expect(banner.locator("strong")).toHaveText("Out of date.");
  await on(page, new Date("2026-10-14T17:00:00Z"), "/venues");
  await expect(page.locator("[data-staleness]")).toBeHidden();
  await on(page, new Date("2026-10-15T17:00:00Z"), "/venues");
  await expect(page.getByRole("status").filter({ hasText: "last researched" })).toBeVisible();
});

test("the dataset is published as the projection, and llms.txt and the sitemap point at the pages", async ({ request }) => {
  const json = await (await request.get("/events.json")).text();
  // Eleven in the fixture; the past one is not published, and no job internals are.
  const ids = JSON.parse(json).events.map((e: { id: string }) => e.id);
  expect(ids).toHaveLength(10);
  expect(ids).not.toContain("evt_e2e000000010");
  expect(json).not.toContain('"evidence"');
  expect(await (await request.get("/llms.txt")).text()).toContain("/events.json");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/e/evt_e2e000000001</loc>");
  expect(sitemap).toContain("/v/recordbar</loc>");
});

test("a venue page gives the venue's address, map, and site, then its events by day (#137)", async ({ page }) => {
  await on(page, BUILD_DAY, "/e/evt_e2e000000001");
  await page.locator(".where").getByRole("link", { name: "recordBar" }).click();
  await expect(page).toHaveURL(/\/v\/recordbar$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("recordBar");
  await expect(page.getByText("1520 Grand Blvd, Kansas City, MO 64108")).toBeVisible();
  await expect(page.getByRole("link", { name: "Map" })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=recordBar%2C%201520%20Grand%20Blvd%2C%20Kansas%20City%2C%20MO%2064108");
  await expect(page.getByRole("link", { name: "therecordbar.com" })).toHaveAttribute("href", "https://www.therecordbar.com/");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Tue Oct 6"]);
  await expect(page.getByRole("heading", { level: 3 })).toHaveText(["Fabio Frizzi plays Fulci"]);
  const place = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(place).toMatchObject({ "@type": "Place", name: "recordBar", address: { streetAddress: "1520 Grand Blvd", postalCode: "64108" }, geo: { latitude: 39.0929 } });
});

test("a venue with a row and nothing coming up still has its page (#137)", async ({ page }) => {
  await on(page, BUILD_DAY, "/v/kauffman-center-for-the-performing-arts");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kauffman Center for the Performing Arts");
  await expect(page.getByText("Nothing listed right now.")).toBeVisible();
});

test("the venue directory lists every venue by region, a row's venue with nothing coming up last, from a venue page (#137)", async ({ page }) => {
  await on(page, BUILD_DAY, "/v/kauffman-center-for-the-performing-arts");
  await page.getByRole("link", { name: "All venues" }).click();
  await expect(page).toHaveURL(/\/venues$/);
  const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
  expect(headings.at(-1)).toBe("Nothing listed right now");
  expect(headings.slice(0, -1).length).toBeGreaterThan(1);
  const recordBar = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "recordBar", exact: true }) });
  await expect(recordBar).toContainText("1 event · Crossroads");
  await expect(recordBar).toContainText("1520 Grand Blvd, Kansas City, MO 64108");
  await recordBar.getByRole("link", { name: "recordBar", exact: true }).click();
  await expect(page).toHaveURL(/\/v\/recordbar$/);
});

test("an explorer row's venue goes to the venue's page (#137)", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore");
  await page.locator("a.venue", { hasText: "recordBar" }).click();
  await expect(page).toHaveURL(/\/v\/recordbar$/);
});

test("a kind's page lists its events by day and leads into the explorer with the same filter (#138)", async ({ page }) => {
  await on(page, BUILD_DAY, "/k/music");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Music in Kansas City");
  await expect(page.getByRole("region", { name: "Events" }).getByRole("heading", { level: 2 })).toHaveText(["Tue Oct 6", "Fri Oct 9"]);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld).toMatchObject({ "@type": "ItemList", numberOfItems: 2 });
  await page.getByRole("link", { name: "Filter further in the explorer" }).click();
  await expect(page).toHaveURL(/\/explore\?when=all&kind=music$/);
});

test("a region with nothing listed still has its page, which says so (#138)", async ({ page }) => {
  await on(page, BUILD_DAY, "/r/northland");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Things to do in Northland");
  await expect(page.getByText("Nothing listed right now.")).toBeVisible();
});

test("an event page's kind goes to the kind's page, its breadcrumb's middle step (#138)", async ({ page }) => {
  await on(page, BUILD_DAY, "/e/evt_e2e000000001");
  const crumbs = JSON.parse((await page.locator('script[type="application/ld+json"]').nth(1).textContent())!);
  expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual(["Home", "Music", "Fabio Frizzi plays Fulci"]);
  await page.locator("article .kind a.chip").click();
  await expect(page).toHaveURL(/\/k\/music$/);
});

test("an event at a venue with a row is addressed to its street in its JSON-LD and its calendar file (#137)", async ({ page, request }) => {
  await on(page, BUILD_DAY, "/e/evt_e2e000000001");
  const event = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
  expect(event.location).toMatchObject({ address: { streetAddress: "1520 Grand Blvd", addressLocality: "Kansas City", addressRegion: "MO", postalCode: "64108" } });
  const ics = (await (await request.get("/e/evt_e2e000000001.ics")).text()).replace(/\r\n[ \t]/g, "");
  expect(ics).toContain("LOCATION:recordBar\\, 1520 Grand Blvd\\, Kansas City\\, MO 64108\r\n");
  expect(ics).toContain("GEO:39.0929;-94.5812\r\n");
});

test("the calendar feeds build from the fixture, each event with a UID, a start, a summary, and its page (#136)", async ({ request }) => {
  const feeds = { "/calendar/picks.ics": "KC This Week · Picks", "/calendar.ics": "KC This Week", "/calendar/music.ics": "KC This Week · Music" };
  const counts: Record<string, number> = {};
  for (const [path, name] of Object.entries(feeds)) {
    const ics = (await (await request.get(path)).text()).replace(/\r\n[ \t]/g, "");
    expect(ics, path).toContain(`\r\nX-WR-CALNAME:${name}\r\n`);
    const vevents = ics.split("BEGIN:VEVENT").slice(1);
    for (const v of vevents) {
      const id = /\r\nUID:(evt_\w+)@kc-events\r\n/.exec(v)?.[1];
      expect(id, path).toBeDefined();
      expect(v).toMatch(/\r\nDTSTART[;:]/);
      expect(v).toMatch(/\r\nSUMMARY:./);
      expect(v).toMatch(new RegExp(`\r\nURL:https?://[^/]+/e/${id}\r\n`));
    }
    counts[path] = vevents.length;
  }
  // The picks are a slice of everything, and so is one kind.
  expect(counts["/calendar/picks.ics"]).toBeGreaterThan(0);
  expect(counts["/calendar/music.ics"]).toBeGreaterThan(0);
  expect(counts["/calendar.ics"]).toBeGreaterThan(Math.max(counts["/calendar/picks.ics"]!, counts["/calendar/music.ics"]!));
});

test("the front page offers the picks as a calendar subscription, with the address to copy (#136)", async ({ page }) => {
  await on(page, BUILD_DAY, "/");
  await expect(page.getByRole("link", { name: "Subscribe to the picks" })).toHaveAttribute("href", /^webcal:\/\/[^/]+\/calendar\/picks\.ics$/);
  await expect(page.locator(".subscribe code")).toHaveText(/^https?:\/\/[^/]+\/calendar\/picks\.ics$/);
});

test("the subscription's https address copies in one tap, and comes first on a phone (#188), its steps behind a disclosure", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await on(page, BUILD_DAY, "/");
  await expect(page.locator(".subscribe code")).toBeHidden();
  await page.locator(".subscribe summary", { hasText: "Which to use" }).click();
  await expect(page.locator(".subscribe code")).toBeVisible();
  await expect(page.locator(".subscribe")).toContainText("Google Calendar (Other calendars, then From URL)");
  await page.locator(".subscribe").getByRole("button", { name: "Copy address" }).click();
  await expect(page.locator(".subscribe")).toContainText("Address copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^https?:\/\/[^/]+\/calendar\/picks\.ics$/);
  const left = async (sel: string) => (await page.locator(`.subscribe ${sel}`).boundingBox())!.x;
  expect(await left(".apple")).toBeLessThan(await left(".by-address"));
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await left(".by-address")).toBeLessThan(await left(".apple"));
});

// The explorer link carries a query so its inline script takes the slice-pending branch.
for (const path of ["/", "/explore?kind=music", "/e/evt_e2e000000001"]) {
  test(`${path} hydrates under its content security policy without a violation`, async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => console.error(`Content Security Policy: ${e.violatedDirective} ${e.blockedURI}`));
    });
    await on(page, BUILD_DAY, path);
    await page.waitForLoadState("networkidle");
    expect(await page.locator('head > meta[http-equiv="content-security-policy"]').getAttribute("content")).toContain("script-src 'self' 'sha256-");
    // An island that hydrated proves its bootstrap ran.
    await expect(page.locator("astro-island:not([ssr])").first()).toBeAttached();
    expect(violations).toEqual([]);
  });
}

for (const path of ["/", "/explore", "/e/evt_e2e000000001", "/v/recordbar", "/v/kauffman-center-for-the-performing-arts", "/venues", "/changes", "/about", "/404"]) {
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

test("the changes page lists the run's new picks, moves, new events by kind, and what went, against the run before (#135)", async ({ page }) => {
  await on(page, BUILD_DAY, "/changes");
  const section = (name: string) => page.getByRole("region", { name });
  await expect(section("New picks").getByRole("link", { name: "Fabio Frizzi plays Fulci", exact: true })).toHaveAttribute("href", "/e/evt_e2e000000001");
  await expect(section("Moved").getByRole("link", { name: "Friday night jazz", exact: true })).toBeVisible();
  await expect(section("Moved")).toContainText("Was Thu Oct 8 · 8:00 pm");
  await expect(section("New this week")).toContainText("10 events found for the first time in the seven days through this run.");
  await expect(section("New this week").locator("summary").first()).toHaveText("music 2");
  await expect(section("Cancelled or gone").locator("li").first()).toHaveText(/Thursday songwriter night\s*Olathe Jazz Hall · Thu Oct 8 · 7:00 pm\s*No longer on the page it was listed on/);
  await expect(section("Cancelled or gone").getByRole("link").first()).toHaveAttribute("href", "https://example.com/olathe/songwriters");
  await expect(section("Cancelled or gone").locator("li").nth(1)).toHaveText(/Cancelled matinee\s*Cancelled/);
  await expect(page.getByText("Compared with the run of Monday, September 28.")).toBeVisible();
  await expect(page.locator(".site-footer").getByRole("link", { name: "What changed" })).toHaveAttribute("href", "/changes");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

// Two defects the 2026-10-21 pre-launch audit measured (its lane A): an event page with a long kind label beside its
// Don't miss tag scrolled sideways at 320 px, and the explorer's sticky bar covered the row that Shift+Tab had just
// focused, because nothing told the browser to scroll focus clear of the bar.
test("an event page with a long kind label and a Don't miss tag does not scroll sideways at 320 px (WCAG 1.4.10)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await on(page, BUILD_DAY, "/e/evt_e2e000000005"); // a festivals/markets pick
  await expect(page.locator(".dont-miss")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});

test("tabbing backwards through the explorer never leaves the focused row under the sticky bar (WCAG 2.4.11)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.emulateMedia({ reducedMotion: "reduce" }); // instant scrolling, so each stop's position can be read at once
  await on(page, BUILD_DAY, "/explore");
  await page.getByRole("button", { name: /^Save / }).last().focus();
  for (let stop = 0; stop < 24; stop++) {
    await page.keyboard.press("Shift+Tab");
    await page.evaluate(() => new Promise(requestAnimationFrame));
    // Covered: the point at the focused element's centre paints something else (the bar, a sticky heading), or the
    // element sits outside the viewport.
    const covered = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return "none";
      const r = el.getBoundingClientRect();
      if (r.height === 0) return "none";
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const where = `${el.tagName} "${el.textContent?.trim().slice(0, 30)}" at ${Math.round(cx)},${Math.round(cy)} in ${innerWidth}x${innerHeight}`;
      if (cy < 0 || cy > innerHeight || cx < 0 || cx > innerWidth) return `${where}: outside the viewport`;
      const top = document.elementFromPoint(cx, cy);
      return el === top || (top !== null && el.contains(top)) ? "no" : `${where}: under ${top?.tagName}.${top?.className}`;
    });
    expect(covered, `stop ${stop}`).toMatch(/^(no|none)$/);
  }
});

test("the About page turns the explorer's / shortcut off, and back on (WCAG 2.1.4)", async ({ page }) => {
  await on(page, BUILD_DAY, "/about");
  const box = page.getByRole("checkbox", { name: "Jump to search with /" });
  await expect(box).toBeChecked();
  await box.uncheck();
  await page.goto("/explore");
  await expect(page.locator("article.row button.save").first()).toBeAttached(); // hydrated
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "Search" })).not.toBeFocused();
  await expect(page.locator("kbd.hint")).toHaveCount(0);
  await page.goto("/about");
  await expect(box).not.toBeChecked();
  await box.check();
  await page.goto("/explore");
  await expect(page.locator("kbd.hint")).toHaveCount(1);
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "Search" })).toBeFocused();
});

test("the header's Saved count follows a Save on the explorer, and a page with no island shows it without the Svelte runtime (#195)", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore");
  const saved = page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: /^Saved/ });
  await expect(saved).toHaveAccessibleName("Saved");
  await page.getByRole("button", { name: "Save Fabio Frizzi plays Fulci" }).click();
  await expect(saved).toHaveAccessibleName("Saved, 1");
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(new URL(r.url()).pathname);
  });
  await on(page, BUILD_DAY, "/venues");
  await expect(saved).toHaveAccessibleName("Saved, 1");
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((s) => /client|svelte|render/i.test(s))).toEqual([]);
  await expect(page.locator("astro-island")).toHaveCount(0);
});

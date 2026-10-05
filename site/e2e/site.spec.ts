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
  await expect(sections.nth(0)).toHaveAttribute("aria-label", "This week, Oct 5–11");
  await expect(sections.nth(0).getByRole("heading", { level: 3 })).toHaveText(["Fabio Frizzi plays Fulci", "Closing exhibition"]);
  await expect(sections.nth(1).getByRole("heading", { level: 3 })).toHaveText(["Mid-month reading"]);
  await expect(sections.nth(2).getByRole("heading", { level: 3 })).toHaveText(["November festival"]);
  await expect(page.getByText("Pub trivia")).toBeVisible();
  await expect(page.getByText("Browse all 9 events")).toBeVisible();
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

test("an unflagged explorer row is one line, at most 28 px tall, at 1280 px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await on(page, BUILD_DAY, "/explore");
  const rows = page.locator("article.row:not(.flagged)");
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    const box = await row.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(28);
  }
});

for (const width of [1024, 1280]) {
  test(`no explorer row truncates its date, and every row shows its neighborhood, at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await on(page, BUILD_DAY, "/explore");
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
    expect(rows.length).toBe(8); // every active event but the always-there one, which the default filters leave out
    for (const row of rows) {
      if (row.dated) expect(row.dateFits, `${row.title}: date fits`).toBe(true);
      expect(row.hood, `${row.title}: neighborhood`).toMatch(/ · \S/);
      expect(row.hoodShown, `${row.title}: neighborhood visible`).toBe(true);
    }
  });
}

test("explorer rows read their dates relative to the day headings and the sort", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore");
  const row = (title: string) => page.locator("article.row", { has: page.getByRole("heading", { name: title }) }).locator(".when");
  await expect(row("Closing exhibition")).toHaveText("Closes Sun Oct 11");
  await expect(row("Artboards")).toHaveText("Closes Thu Dec 31");
  await expect(row("November festival")).toHaveText("Runs through Sun Nov 22");
  await expect(page.locator("article.row", { has: page.getByRole("heading", { name: "Fabio Frizzi plays Fulci" }) }).locator(".verified")).toHaveText("✓ Oct 3Verified Oct 3");
  await on(page, BUILD_DAY, "/explore?sort=venue");
  await expect(row("Friday night jazz")).toHaveText("Fri Oct 9 · 8:00 pm");
});

test("an event page exists, downloads a calendar, and knows when it has passed", async ({ page }) => {
  await on(page, BUILD_DAY, "/e/evt_e2e000000001");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fabio Frizzi plays Fulci");
  await expect(page.getByText("Tuesday, October 6, 7:00 pm")).toBeVisible();
  // Playwright's text assertions skip <script> contents, so read the JSON-LD as text.
  expect(await page.locator('script[type="application/ld+json"]').textContent()).toContain('"@type":"Event"');
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Add to calendar" }).click();
  expect((await download).suggestedFilename()).toBe("evt_e2e000000001.ics");
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
  await expect(page.getByRole("status")).toContainText("This list was last researched on Oct 5 and may have missed changes since.");
});

test("the dataset is published verbatim, and llms.txt and the sitemap point at the pages", async ({ request }) => {
  const json = await (await request.get("/events.json")).text();
  expect(JSON.parse(json).events).toHaveLength(10);
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

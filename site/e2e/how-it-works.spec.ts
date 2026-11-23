import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const BUILD_DAY = new Date("2026-10-05T17:00:00Z"); // noon Monday in Chicago
const PATH = "/about/how-it-works";
async function open(page: Page) {
  await page.clock.setFixedTime(BUILD_DAY);
  await page.goto(PATH);
}

const built = (file: string) => readFileSync(fileURLToPath(new URL(`../dist-e2e/${file}`, import.meta.url)), "utf8");
const count = (html: string, tag: string) => html.split(`<${tag}`).length - 1;

test("the page is under About, with its way back above the heading", async ({ page }) => {
  const response = await page.goto(PATH);
  expect(response!.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How it works");
  await expect(page).toHaveTitle("How it works · KC This Week");
  const back = page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "About" });
  await expect(back).toHaveAttribute("href", "/about");
});

test("About links here as the longer account, and to the picks section from what a pick is", async ({ page }) => {
  await page.clock.setFixedTime(BUILD_DAY);
  await page.goto("/about");
  await page.getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/\/about\/how-it-works$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How it works");

  await page.goto("/about");
  await page.getByRole("link", { name: "How a pick is made" }).click();
  await expect(page).toHaveURL(/\/about\/how-it-works#picks$/);
  await expect(page.locator("#picks-heading")).toBeInViewport();
});

test("the strip gives the newest weekly run's figures, and says which run", async ({ page }) => {
  await open(page);
  const strip = page.locator(".how-strip");
  await expect(strip).toContainText("The weekly run of October 5");
  const figure = (term: string) => strip.locator("div", { has: page.getByText(term, { exact: true }) }).locator("dd");
  // Four were tried and one failed: three were read (the fixture's fifth is excluded from the run).
  await expect(figure("Sources read")).toHaveText("3");
  await expect(figure("Sources that failed")).toHaveText("1");
  // The report counts stored events a page sighted, and every record made, shown or not: the labels say so.
  await expect(strip.locator("dt")).toContainText(["Events sighted on their pages", "New records, shown or held back"]);
  await expect(figure("Model calls")).toHaveText("6");
  await expect(figure("Spent on models, of a $5.00 cap")).toHaveText("$0.42");
  await expect(figure("Start to finish")).toHaveText("30 min");
});

test("the key names the five roles, and every role tag on the page says its role in words", async ({ page }) => {
  await open(page);
  await expect(page.locator(".how-key .how-role")).toHaveText(["Network", "Extraction model", "Curation model", "Code", "By hand"]);
  for (const text of await page.locator(".how-role").allTextContents()) expect(text.trim()).not.toBe("");
});

test("every figure that scrolls sideways is a labelled region the keyboard can reach", async ({ page }) => {
  await open(page);
  expect(await page.locator(".how-scroll").count()).toBeGreaterThan(0);
  for (const region of await page.locator(".how-scroll").all()) {
    await expect(region).toHaveAttribute("tabindex", "0");
    await expect(region).toHaveAttribute("role", "region");
    expect((await region.getAttribute("aria-label"))!.trim()).not.toBe("");
  }
});

test("the contents row links every section, and every link lands on one", async ({ page }) => {
  await open(page);
  const hrefs = await page.locator(".how-contents a").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  expect(hrefs).toEqual(["#week", "#run", "#listing", "#matching", "#life", "#strikes", "#picks", "#safeguards", "#corrections"]);
  for (const href of hrefs) await expect(page.locator(`section${href} > h2.section-heading`)).toHaveCount(1);
});

test("the week gives the three scheduled times, from the schedule the scripts hold", async ({ page }) => {
  await open(page);
  const week = page.locator("#week");
  await expect(week.locator(".how-scroll")).toHaveAttribute("aria-label", /week/i);
  // Each says its day in words: the grid's columns are layout, which a screen reader does not hear.
  await expect(week.locator(".how-week-item time")).toHaveText(["Mondays, 6:17 am", "Thursdays, 6:17 am", "Every day, 12:05 am"]);
  await expect(week.locator(".how-week-day")).toHaveText(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  // The weekly run sits under Monday and the midweek pass under Thursday, placed from the cron lines.
  const column = (words: string) => week.locator(".how-week-item", { hasText: words }).evaluate((el) => getComputedStyle(el).gridColumnStart);
  expect(await column("Weekly run")).toBe("2");
  expect(await column("Midweek re-verification")).toBe("5");
  // The midweek pass is not only a re-reading: it also judges and writes what changed.
  await expect(week.locator(".how-week-item", { hasText: "Midweek re-verification" })).toContainText("Reads no list");
  // The audit is placed after the run, with no clock time of its own (it is scheduled outside the repository).
  await expect(week.locator(".how-week-item", { hasText: "Audit, after the run" })).not.toContainText(/\d:\d\d/);
});

test("a run is fourteen steps in six phases, each saying who does it and on which days", async ({ page }) => {
  await open(page);
  const steps = page.locator("#run .how-step");
  await expect(steps).toHaveCount(14);
  await expect(page.locator("#run .how-phase")).toHaveCount(6);
  await expect(page.locator("#run .how-step-n")).toHaveText(Array.from({ length: 14 }, (_, i) => String(i + 1)));
  for (const step of await steps.all()) {
    expect(await step.locator(".how-role").count()).toBeGreaterThan(0);
    const days = await step.locator(".how-mark").allTextContents();
    expect(days).toHaveLength(2);
    expect(days[0]).toMatch(/Monday/);
    expect(days[1]).toMatch(/Thursday/);
  }
  // The midweek pass reads no list: its first step is the clearing out before re-verification.
  await expect(steps.nth(0).locator(".how-mark").nth(1)).toHaveText("Does not run on Thursday");
  await expect(steps.nth(5).locator(".how-mark").nth(1)).toHaveText("Runs on Thursday");
  // A phase's name and its question are two things to a screen reader too.
  await expect(page.locator("#run .how-phase > b").first()).toHaveText("Find: What do the pages list right now?");
});

test("what the facts pass corrected stays corrected", async ({ page }) => {
  await open(page);
  const step = (n: number) => page.locator("#run .how-step").nth(n - 1);
  // The listing pages are fetched one at a time; it is the reads that run side by side, discovery's among them.
  await expect(page.locator("#run figcaption", { hasText: "pages at once" })).toContainText("Steps 2, 3, 6, 8 and 12");
  // Discovery makes no search for the catch-all kind.
  await expect(step(3)).toContainText("each of the ten kinds");
  await expect(step(3)).toContainText("fetched plainly and read once");
  // A place outside the area expires on Thursday too, so it is told in a step that runs then.
  await expect(step(4)).not.toContainText("outside the covered area");
  await expect(step(5)).toContainText("outside the covered area");
  await expect(step(12)).not.toContainText("no pick is published from its list line alone");
  await expect(step(14)).toContainText("one after another");
  await expect(page.locator("#safeguards .how-slab", { hasText: "The write" })).toContainText("one after another");
  // An excluded source's events run up outages like any other page that was not read.
  await expect(page.locator("#strikes .how-ladder > li").first().locator(".how-a")).toContainText("Counted as an outage");
  // An unverified record can be cancelled, struck or folded as an active one can.
  await expect(page.locator("#life svg[role=img]")).toHaveAttribute("aria-label", /Either expires when its last day passes, when its own page says it is cancelled, on a second strike in a row, as a duplicate/);
  await expect(page.locator("#matching .how-table tbody tr").nth(1)).toContainText("when its reading is verified");
  await expect(page.locator("#matching .how-ladder > li").nth(4)).toContainText("The team names are not compared");
  await expect(page.locator("#week")).toContainText("take effect at the next run");
});

test("a link inside a tinted box is ink, as every link on the site is: a role's colour is never a link's", async ({ page }) => {
  await open(page);
  const link = page.locator("#listing .how-a a").first();
  const [ink, linkColour, boxColour] = await link.evaluate((a) => [getComputedStyle(document.body).color, getComputedStyle(a).color, getComputedStyle(a.closest(".how-a")!).color]);
  expect(linkColour).toBe(ink);
  expect(boxColour).not.toBe(ink);
  await expect(link).toHaveCSS("text-decoration-line", "underline");
});

test("the spend bar has a segment for each stage that spent anything, and says each one's dollars", async ({ page }) => {
  await open(page);
  const bar = page.locator("#run .how-bar");
  await expect(bar.locator("> span")).toHaveCount(3);
  await expect(bar).toHaveAttribute("role", "img");
  await expect(bar).toHaveAttribute("aria-label", "Spend by stage in the weekly run of October 5: Curation $0.22, Reading list pages $0.15, Own pages $0.05.");
  await expect(page.locator("#run .how-bar-key li b")).toHaveText(["Curation: $0.22", "Reading list pages: $0.15", "Own pages: $0.05"]);
});

const rungs = (page: Page, section: string) => page.locator(`${section} .how-ladder > li:not(.how-end)`);

test("from a page to a listing: the page three ways, an example marked as one, and six questions before a sighting", async ({ page }) => {
  await open(page);
  await expect(page.locator("#listing .how-flow .how-box")).toHaveCount(3);
  await expect(page.locator("#listing .how-flow .how-box").nth(2)).toContainText("An example.");
  await expect(rungs(page, "#listing")).toHaveCount(6);
  await expect(page.locator("#listing .how-ladder .how-end")).toContainText("An active sighting.");
  // The page cap is the code's, with its comma.
  await expect(page.locator("#listing .how-flow")).toContainText("70,000 characters");
});

test("matching: eight rules tried in order, then which page has a say, each cell said in words", async ({ page }) => {
  await open(page);
  await expect(rungs(page, "#matching")).toHaveCount(8);
  await expect(rungs(page, "#matching").first().locator(".how-y")).toContainText("match");
  await expect(page.locator("#matching .how-ladder .how-end")).toContainText("A new event");
  const rows = page.locator("#matching .how-table tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator("td")).toHaveText([/Yes/, /Yes/, /Yes/, /Yes/]);
  await expect(rows.nth(1).locator("td")).toHaveText([/Yes/, /Yes/, /Yes/, /No/]);
  await expect(rows.nth(2).locator("td")).toHaveText([/No/, /No/, /No/, /No/]);
});

test("life of a listing: the drawing says in words what it shows, and carries no count from one day", async ({ page }) => {
  await open(page);
  const drawing = page.locator("#life svg[role=img]");
  for (const word of ["candidate", "active", "unverified", "held for promotion", "expired", "archive"]) await expect(drawing).toHaveAttribute("aria-label", new RegExp(word, "i"));
  // The explainer this page came from typed the dataset's counts into the boxes ("366 today").
  expect(await page.locator("main").innerText()).not.toMatch(/\b\d+ today\b/);
});

test("strike or outage opens with its principle, then eight questions before a strike", async ({ page }) => {
  await open(page);
  await expect(page.locator("#strikes > p").first()).toContainText("An outage holds an event; only a reading strikes it.");
  await expect(page.locator("#strikes > p").first().getByRole("link")).toHaveAttribute("href", /docs\/adr\/0008-/);
  await expect(rungs(page, "#strikes")).toHaveCount(8);
  await expect(page.locator("#strikes .how-ladder .how-end")).toContainText("Strike.");
});

test("picks: who is judged, the three verdicts, the six reasons in the site's words, and the pick tag once", async ({ page }) => {
  await open(page);
  const published = (await (await page.request.get("/events.json")).json()).events as { dontMiss: boolean }[];
  const picks = page.locator("#picks");
  await expect(picks.locator(".how-num")).toHaveText([String(published.length), String(published.filter((e) => e.dontMiss).length)]);
  await expect(picks.locator(".how-verdict > b")).toHaveText(["Pick", "Close", "No"]);
  await expect(picks.locator(".how-reason > b")).toHaveText(["Rare", "Big name", "Occasion", "Tradition", "Unusual", "Major run"]);
  // The one hue on the page that is not a role's: the site's own pick tag, where it means what it means everywhere.
  await expect(picks.locator(".dont-miss")).toHaveCount(1);
  await expect(page.locator("main .dont-miss")).toHaveCount(1);
});

test("safeguards: seven gates with the line where a run is published, and five kinds of guard", async ({ page }) => {
  await open(page);
  const gates = page.locator("#safeguards .how-gates > li");
  await expect(gates).toHaveCount(7);
  await expect(page.locator("#safeguards .how-gate-line")).toHaveCount(1);
  await expect(page.locator("#safeguards .how-gate-line")).toContainText("published");
  await expect(gates.nth(0)).toContainText("90-minute");
  await expect(gates.nth(4)).toContainText("15 minutes");
  await expect(gates.nth(5)).toContainText("IndexNow");
  await expect(page.locator("#safeguards .how-slab")).toHaveCount(5);
});

test("corrections: what a run leaves, who reads it, where a fix lands, and where each kind of wrong is fixed", async ({ page }) => {
  await open(page);
  const fixes = page.locator("#corrections");
  await expect(fixes.locator(".how-table thead th")).toHaveCount(2);
  await expect(fixes.locator(".how-table tbody tr")).toHaveCount(8);
  await expect(fixes.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about#wrong-listing");
  await expect(fixes.getByRole("link", { name: "What changed" })).toHaveAttribute("href", "/changes");
});

test("the page keeps the site's voice, and none of the operator's notes", async ({ page }) => {
  await open(page);
  const text = await page.locator("main").innerText();
  const found = (pattern: RegExp) => text.match(pattern)?.[0];
  expect(found(/\b(you|your|yours|we|our|us)\b/i)).toBeUndefined(); // no reader addressed, no "we"
  expect(found(/!/)).toBeUndefined();
  expect(found(/#\d{2,}/)).toBeUndefined(); // a ticket number
  expect(found(/\b[0-9a-f]{7}\b/)).toBeUndefined(); // a commit hash
  expect(found(/~\//)).toBeUndefined(); // a path on the machine that runs the job
  expect(found(/Slack|healthchecks|worktree|needs-triage|post-run-check|pnpm |crontab/i)).toBeUndefined();
});

test("the page carries no script or inline style of its own: its styles are a linked sheet", () => {
  const page = built("about/how-it-works.html");
  const plain = built("404.html");
  // An inline style or script would put its hash in every page's Content-Security-Policy, the explorer's included.
  expect(count(page, "style")).toBe(0);
  // What every page carries (analytics, the header's saved link, the staleness banner), and nothing of its own.
  expect(count(page, "script")).toBe(count(plain, "script"));
  expect(count(page, 'link rel="stylesheet"')).toBeGreaterThan(count(plain, 'link rel="stylesheet"'));
});

test("on a wide screen a figure is wider than the prose, up to 65rem", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  const lede = (await page.locator(".lede").boundingBox())!;
  const figure = (await page.locator(".how-figure").first().boundingBox())!;
  expect(figure.width).toBeGreaterThan(lede.width);
  expect(figure.width).toBeLessThanOrEqual(1040);
});

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

test("the strip gives the newest weekly run's figures, and says which run", async ({ page }) => {
  await open(page);
  const strip = page.locator(".how-strip");
  await expect(strip).toContainText("The weekly run of October 5");
  const figure = (term: string) => strip.locator("div", { has: page.getByText(term, { exact: true }) }).locator("dd");
  await expect(figure("Sources read")).toHaveText("4");
  await expect(figure("Sources that failed")).toHaveText("1");
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

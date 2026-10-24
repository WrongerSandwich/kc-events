import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/** Shareable shortlists and per-event share (#132). */

const BUILD_DAY = new Date("2026-10-05T17:00:00Z"); // noon Monday in Chicago

/**
 * Takes away the share sheet, so the clipboard fallback runs, and records what is copied instead of touching the real
 * clipboard. With `share`, a share sheet that records what it is handed.
 */
async function stubSharing(page: Page, { share = false } = {}) {
  await page.addInitScript((withShare) => {
    const w = window as unknown as { copied: string[]; shared: unknown[] };
    w.copied = [];
    w.shared = [];
    Object.defineProperty(navigator, "share", { configurable: true, value: withShare ? async (d: unknown) => void w.shared.push(d) : undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => void w.copied.push(t) } });
  }, share);
}

const copied = (page: Page) => page.evaluate(() => (window as unknown as { copied: string[] }).copied);

async function on(page: Page, path: string) {
  await page.clock.setFixedTime(BUILD_DAY);
  await page.goto(path);
}

test("a shortlist link shows only its events, in its order, under Shortlist · N events", async ({ page }) => {
  await on(page, "/explore?ids=evt_e2e000000004,evt_e2e000000099,evt_e2e000000001,evt_e2e000000010,evt_e2e000000003");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Shortlist · 3 events");
  await expect(page.getByRole("article").getByRole("heading")).toHaveText(["Mid-month reading", "Fabio Frizzi plays Fulci", "Friday night jazz"]);
  // Another filter narrows it; the shortlist's pill takes only the shortlist away.
  await page.getByRole("button", { name: /^Music\b/ }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Shortlist · 2 events");
  await page.getByRole("button", { name: "Remove Shortlist (3)" }).click();
  await expect(page).toHaveURL("/explore?when=all&kind=music");
  await expect(page.getByText(/Shortlist/)).toHaveCount(0);
});

test.describe("the saved view", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("kc-events.saved.v2", JSON.stringify([{ id: "evt_e2e000000003" }, { id: "evt_e2e000000001" }, { id: "evt_e2e000000010" }]));
    });
  });

  test("Share saved copies a shortlist link of the saves still to come, and the link opens them", async ({ page }) => {
    await stubSharing(page);
    await on(page, "/explore?saved=1");
    await page.getByRole("button", { name: "Share saved" }).click();
    await expect(page.getByText("Link copied")).toBeVisible();
    const [link] = await copied(page);
    expect(link).toBe("http://localhost:4321/explore?ids=evt_e2e000000001,evt_e2e000000003");
    await on(page, link!.replace("http://localhost:4321", ""));
    await expect(page.getByRole("heading", { level: 2 })).toHaveText("Shortlist · 2 events");
  });

  test("Export saved downloads the saves still to come as a named calendar", async ({ page }) => {
    await on(page, "/explore?saved=1");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export saved to calendar" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("kc-this-week-saved.ics");
    const ics = readFileSync((await file.path())!, "utf8");
    expect(ics).toContain("X-WR-CALNAME:KC This Week · saved");
    expect(ics).toContain("SUMMARY:Friday night jazz");
    expect(ics).toContain("SUMMARY:Fabio Frizzi plays Fulci");
    expect(ics).not.toContain("SUMMARY:Already happened");
  });
});

test.describe("an event page's Share", () => {
  test("copies the page's link where there is no share sheet", async ({ page }) => {
    await stubSharing(page);
    await on(page, "/e/evt_e2e000000001");
    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByText("Link copied")).toBeVisible();
    expect(await copied(page)).toEqual(["http://localhost:4321/e/evt_e2e000000001"]);
  });

  test("hands the share sheet the title, the date line and venue, and the link", async ({ page }) => {
    await stubSharing(page, { share: true });
    await on(page, "/e/evt_e2e000000001");
    await page.getByRole("button", { name: "Share" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { shared: unknown[] }).shared)).toEqual([
      { title: "Fabio Frizzi plays Fulci", text: "Tuesday, October 6, 7:00 pm · recordBar", url: "http://localhost:4321/e/evt_e2e000000001" },
    ]);
    expect(await copied(page)).toEqual([]);
  });
});

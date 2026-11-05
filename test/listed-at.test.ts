import { describe, expect, it } from "vitest";
import { emptyDataset, type Dataset } from "../src/dataset.js";
import { parseRegistry } from "../src/registry.js";
import type { CannedPage, ScriptedReply } from "./fakes/ports.js";
import { testConfig } from "./fakes/config.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, knuckleheads, reply, source, WEEK_1, WEEK_2 } from "./fakes/fixtures.js";

/**
 * A calendar that pages by script is read through its feed's pages, each a URL of the source, and
 * they are one listing at the calendar's own URL (`listedAt`, #226): every sighting cites it, and
 * what the run makes of a page it makes of all of them together, so an event moving between pages
 * as the calendar fills is the same event on the same page.
 */
const CALENDAR = "https://artscouncil.test/calendar-of-events/";
const feedPage = (n: number) => `https://artscouncil.test/wp-admin/admin-ajax.php?action=feed&page=${n}`;
const council = { ...source("Arts Council"), urls: [feedPage(1), feedPage(2)], listedAt: CALENDAR };

const at = (overrides: Record<string, unknown>) => candidateAt(council, { venue: "Arts Hall", venueEvidence: "Arts Hall, 1 Main St", ...overrides });
const choir = at({ title: "Choir Night", startDate: "2026-10-20", dateEvidence: "Tue, Oct 20 @ 7:00 pm" });
const quartet = at({ title: "String Quartet", startDate: "2026-11-14", dateEvidence: "Sat, Nov 14 @ 7:30 pm" });
const pottery = at({ title: "Pottery Night", startDate: "2026-10-23", dateEvidence: "Fri, Oct 23 @ 6:00 pm" });
const winter = at({ title: "Winter Concert", startDate: "2026-12-05", dateEvidence: "Sat, Dec 5 @ 7:00 pm" });

const page: CannedPage = { status: 200, body: "<html><body><div>Arts Council calendar</div></body></html>" };
const bothPages = { [feedPage(1)]: page, [feedPage(2)]: page };

const runAt = (now: Date, dataset: Dataset, completions: ScriptedReply[], pages: Record<string, CannedPage> = bothPages) =>
  runWith(now, dataset, { sources: [council], pages, completions });

const titled = (dataset: Dataset, title: string) => dataset.events.filter((e) => e.title === title);

describe("a source listed at one URL and read through its feed's pages (#226)", () => {
  it("cites the listing's URL on every sighting, from whichever page, and never fetches it", async () => {
    const { dataset, calls } = await runAt(WEEK_1, emptyDataset(), [reply(choir), reply(quartet)]);

    expect(dataset.events.map((e) => [e.title, e.status, e.primaryUrl])).toEqual([
      ["Choir Night", "active", CALENDAR],
      ["String Quartet", "active", CALENDAR],
    ]);
    expect(calls.filter((c) => c.startsWith("fetch:"))).toEqual([`fetch:${feedPage(1)}`, `fetch:${feedPage(2)}`]);
  });

  it("an event that moves to another page as the calendar fills is the same record, verified, not a duplicate or a strike", async () => {
    const week1 = (await runAt(WEEK_1, emptyDataset(), [reply(choir), reply(quartet)])).dataset;

    // A week on, String Quartet has moved up to page 1, and page 2 lists a show added since.
    const { dataset } = await runAt(WEEK_2, week1, [reply(choir, quartet), reply(winter)]);

    const [record] = titled(dataset, "String Quartet");
    expect(titled(dataset, "String Quartet")).toHaveLength(1);
    expect(record).toMatchObject({ id: titled(week1, "String Quartet")[0]!.id, status: "active", primaryUrl: CALENDAR, verificationFailures: 0 });
  });

  it("strikes an event no page lists once every page was read, as one page that stopped listing it would", async () => {
    const week1 = (await runAt(WEEK_1, emptyDataset(), [reply(pottery), reply(quartet)])).dataset;

    const { dataset } = await runAt(WEEK_2, week1, [reply(quartet), reply(winter)]);

    expect(titled(dataset, "Pottery Night")[0]).toMatchObject({ verificationFailures: 1 });
    expect(titled(dataset, "String Quartet")[0]).toMatchObject({ verificationFailures: 0 });
  });

  it.each([
    ["could not be loaded", new Error("ECONNRESET")],
    ["is gone", "gone" as const],
  ])("holds every event it has not read when one page %s, and refreshes those the others list", async (_, failed) => {
    const week1 = (await runAt(WEEK_1, emptyDataset(), [reply(pottery), reply(quartet)])).dataset;

    // Pottery Night was on page 1, which lists only String Quartet now; page 2 did not come back. Another source did, so the run goes on.
    const { dataset } = await runWith(WEEK_2, week1, {
      sources: [council, knuckleheads],
      pages: { [feedPage(1)]: page, [feedPage(2)]: failed, [knuckleheads.urls[0]!]: page },
      completions: [reply(quartet), reply()],
    });

    expect(titled(dataset, "Pottery Night")[0]).toMatchObject({ status: "active", verificationFailures: 0 });
    expect(titled(dataset, "String Quartet")[0]).toMatchObject({ status: "active", lastVerified: expect.stringContaining("2026-10-09") });
  });

  it("holds every event it has not read when one page came back but its reading failed", async () => {
    const week1 = (await runAt(WEEK_1, emptyDataset(), [reply(pottery), reply(quartet)])).dataset;

    const { dataset } = await runAt(WEEK_2, week1, [reply(quartet), new TypeError("terminated")]);

    expect(titled(dataset, "Pottery Night")[0]).toMatchObject({ status: "active", verificationFailures: 0 });
  });

  it("holds every event it has not read when one page reads as listing nothing, and says so", async () => {
    const week1 = (await runAt(WEEK_1, emptyDataset(), [reply(pottery), reply(quartet)])).dataset;

    const { dataset, report } = await runAt(WEEK_2, week1, [reply(), reply(quartet)]);

    expect(titled(dataset, "Pottery Night")[0]).toMatchObject({ status: "active", verificationFailures: 0 });
    expect(report.sources[0]!.detail).toContain(`${feedPage(1)} read as listing nothing, so the events listed at ${CALENDAR} are held, not struck`);
  });

  describe("a page whose every event starts after the horizon (#264)", () => {
    /** A reply listing these candidates inside the horizon, and reporting what the page lists after it. */
    const pastHorizon = (latestStart: string | null, ...candidates: unknown[]) => ({ ...reply(...candidates), value: { events: candidates, afterHorizon: { listed: true, latestStart } } });

    it("is not read as listing nothing, so an event no page lists is struck as usual", async () => {
      const week1 = (await runAt(WEEK_1, emptyDataset(), [reply(pottery, quartet), reply()])).dataset;

      // Page 1 no longer lists Pottery Night; page 2 lists only a season past the horizon.
      const { dataset, report } = await runAt(WEEK_2, week1, [reply(quartet), pastHorizon("2027-03-27")]);

      expect(titled(dataset, "Pottery Night")[0]).toMatchObject({ verificationFailures: 1 });
      expect(report.sources[0]!.detail ?? "").not.toContain("read as listing nothing");
    });

    it("but a reply that says nothing of after the horizon still holds the listing", async () => {
      const week1 = (await runAt(WEEK_1, emptyDataset(), [reply(pottery, quartet), reply()])).dataset;

      const { dataset, report } = await runAt(WEEK_2, week1, [reply(quartet), { ...reply(), value: { events: [] } }]);

      expect(titled(dataset, "Pottery Night")[0]).toMatchObject({ status: "active", verificationFailures: 0 });
      expect(report.sources[0]!.detail).toContain(`${feedPage(2)} read as listing nothing, so the events listed at ${CALENDAR} are held, not struck`);
    });

    it("nor does a last page listing inside the horizon and after it ask for the next page (#229)", async () => {
      const { report } = await runAt(WEEK_2, emptyDataset(), [reply(choir), pastHorizon("2027-03-27", quartet)]);

      expect(report.sources[0]!.detail ?? "").not.toContain("add the next page");
    });

    it.each([
      ["gives no latest start", null],
      ["gives one inside the horizon", "2026-11-20"],
    ])("nor when it %s, and the listing reaches past the horizon all the same", async (_, latestStart) => {
      const recital = at({ title: "Holiday Recital", startDate: "2026-11-28", dateEvidence: "Sat, Nov 28 @ 6:00 pm" });
      const week1 = (await runAt(WEEK_1, emptyDataset(), [reply(choir), reply(quartet, recital)])).dataset;

      // Holiday Recital (Nov 28) is past String Quartet (Nov 14) but inside the horizon, which the page reaches past: struck.
      const { dataset, report } = await runAt(WEEK_2, week1, [reply(choir), pastHorizon(latestStart, quartet)]);

      expect(report.sources[0]!.detail ?? "").not.toContain("add the next page");
      expect(titled(dataset, "Holiday Recital")[0]).toMatchObject({ verificationFailures: 1 });
    });
  });

  it("holds every event it has not read when one page was cut at the cap, so what fell past the cut is not struck", async () => {
    const week1 = (await runAt(WEEK_1, emptyDataset(), [reply(pottery), reply(quartet)])).dataset;
    const long: CannedPage = { status: 200, body: `<html><body>${"<div>A long description of the calendar, nothing on this night</div>\n".repeat(1_500)}</body></html>` };

    const { dataset, report } = await runAt(WEEK_2, week1, [reply(quartet), reply(choir)], { [feedPage(1)]: long, [feedPage(2)]: page });

    expect(titled(dataset, "Pottery Night")[0]).toMatchObject({ status: "active", verificationFailures: 0 });
    expect(report.sources[0]!.detail).toContain(`${feedPage(1)} was cut at the cap, so the events listed at ${CALENDAR} are held, not struck`);
  });

  it("takes the latest start any page lists as how far the listing reaches, whichever page gives it", async () => {
    const recital = at({ title: "Holiday Recital", startDate: "2026-11-28", dateEvidence: "Sat, Nov 28 @ 6:00 pm" });
    const week1 = (await runAt(WEEK_1, emptyDataset(), [reply(recital, winter), reply(quartet)])).dataset;

    // Page 1 lists Winter Concert (Dec 5); page 2, read last, only String Quartet (Nov 14). Holiday Recital (Nov 28), listed by
    // neither, falls inside the listing's reach though past the last page's: it is struck, not held as beyond the listing.
    const { dataset } = await runAt(WEEK_2, week1, [reply(winter), reply(quartet)]);

    expect(titled(dataset, "Holiday Recital")[0]).toMatchObject({ verificationFailures: 1 });
  });

  describe("says when the last page still lists inside the horizon, so the next page may be needed (#229)", () => {
    // WEEK_2's run date is 2026-10-09; its eight-week horizon ends 2026-12-04.
    const nextPage = (latest: string) =>
      `${feedPage(2)} lists through ${latest}, inside the horizon (2026-12-04); events past it may be on a page not read, so add the next page`;
    const detail = (report: { sources: { detail?: string }[] }) => report.sources[0]!.detail ?? "";

    it("when the last page's latest start falls inside the horizon", async () => {
      const { report } = await runAt(WEEK_2, emptyDataset(), [reply(winter), reply(choir, quartet)]);

      expect(detail(report)).toContain(nextPage("2026-11-14"));
    });

    it("when the last page's latest start is the horizon's last day", async () => {
      const finale = at({ title: "Season Finale", startDate: "2026-12-04", dateEvidence: "Fri, Dec 4 @ 7:00 pm" });
      const { report } = await runAt(WEEK_2, emptyDataset(), [reply(choir), reply(quartet, finale)]);

      expect(detail(report)).toContain(nextPage("2026-12-04"));
    });

    it("from the wider of the last page's two reads", async () => {
      const recital = at({ title: "Holiday Recital", startDate: "2026-11-28", dateEvidence: "Sat, Nov 28 @ 6:00 pm" });
      const { report } = await runWith(WEEK_2, emptyDataset(), {
        sources: [council],
        pages: bothPages,
        completions: [reply(winter), reply(winter), reply(quartet), reply(recital)],
        config: testConfig({ extractionReads: 2 }),
      });

      expect(detail(report)).toContain(nextPage("2026-11-28"));
    });

    it("not when the last page's latest start falls past the horizon", async () => {
      const { report } = await runAt(WEEK_2, emptyDataset(), [reply(choir), reply(quartet, winter)]);

      expect(detail(report)).not.toContain("add the next page");
    });

    it("not when only an earlier page reaches inside the horizon", async () => {
      const { report } = await runAt(WEEK_2, emptyDataset(), [reply(quartet), reply(winter)]);

      expect(detail(report)).not.toContain("add the next page");
    });

    it.each([
      ["is empty", reply()],
      ["lists only what is skipped", reply(at({ title: "Trivia Night", startDate: "2026-10-22", dateEvidence: "Thu, Oct 22 @ 7:00 pm" }))],
      ["lists only what recurs", reply(at({ title: "Open Studio", startDate: null, startTime: null, schedule: "Every Saturday", dateEvidence: "Every Saturday" }))],
    ])("not when the last page %s", async (_, last) => {
      const { report } = await runAt(WEEK_2, emptyDataset(), [reply(quartet), last]);

      expect(detail(report)).not.toContain("add the next page");
    });

    it("not when the last page did not come back", async () => {
      const { report } = await runWith(WEEK_2, emptyDataset(), {
        sources: [council, knuckleheads],
        pages: { [feedPage(1)]: page, [feedPage(2)]: new Error("ECONNRESET"), [knuckleheads.urls[0]!]: page },
        completions: [reply(quartet), reply()],
      });

      expect(detail(report)).not.toContain("add the next page");
    });

    it("not for a source read without listedAt", async () => {
      const { listedAt: _, ...plain } = council;
      const plainAt = (title: string, startDate: string) => candidateAt(plain, { title, startDate, venue: "Arts Hall", venueEvidence: "Arts Hall, 1 Main St", dateEvidence: startDate });
      const { report } = await runWith(WEEK_2, emptyDataset(), {
        sources: [plain],
        pages: bothPages,
        completions: [reply(plainAt("Choir Night", "2026-10-20")), reply(plainAt("String Quartet", "2026-11-14"))],
      });

      expect(report.sources[0]!.extracted).toBeGreaterThan(0);
      expect(detail(report)).not.toContain("add the next page");
    });
  });

  it("is a URL", () => {
    expect(() => parseRegistry({ sources: [{ ...council, listedAt: "the calendar" }] })).toThrow();
  });
});

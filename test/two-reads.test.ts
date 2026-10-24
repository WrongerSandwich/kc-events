import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, type Dataset } from "../src/dataset.js";
import type { CompletionRequest, ModelPort } from "../src/ports.js";
import { parseConfig } from "../src/config.js";
import { fakePorts, type CannedPage, type ScriptedReply } from "./fakes/ports.js";
import { TEST_MODELS, testConfig, testPrompts } from "./fakes/config.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, knuckleheads, PAGE, reply, source, WEEK_1, WEEK_1_ISO, WEEK_2, WEEK_2_ISO } from "./fakes/fixtures.js";

const CALENDAR_URL = knuckleheads.urls[0]!;
const candidate = (overrides: Record<string, unknown> = {}) => candidateAt(knuckleheads, overrides);
const twice = testConfig({ extractionReads: 2 });
const RESET = new TypeError("terminated");

/** The calendar as a venue writes it, carrying only the quotes in it (`pagesCarryQuotes: false`). */
const LISTING: CannedPage = {
  status: 200,
  body: `<html><body><h1>Knuckleheads</h1>
<div>Big Show</div><div>Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM</div>
<div>Second Show</div><div>Sat, Nov 7 · 8:00 PM</div>
<div>Knuckleheads, 1 Main St</div></body></html>`,
};
const bigShow = candidate();
const secondShow = candidate({ title: "Second Show", startDate: "2026-11-07", dateEvidence: "Sat, Nov 7 · 8:00 PM" });

const runAt = (now: Date, dataset: Dataset, completions: ScriptedReply[], config = twice) =>
  runWith(now, dataset, { sources: [knuckleheads], pages: { [CALENDAR_URL]: LISTING }, completions, config, pagesCarryQuotes: false });

/** The extraction requests about one page. */
const readsOf = (requests: CompletionRequest[], url: string) =>
  requests.filter((r) => r.model === TEST_MODELS.extraction && r.messages.some((m) => m.content.includes(url)));

/** Week one, read once: both shows stored, verified. */
const stored = async () => (await runAt(WEEK_1, emptyDataset(), [reply(bigShow, secondShow)], testConfig())).dataset;

const knuckleheadsLine = (report: { sources: { name: string; extracted: number; detail?: string }[] }) => report.sources.find((s) => s.name === "Knuckleheads")!;

describe("two reads of each registry page (#224)", () => {
  it("a candidate only the second read returns is verified, and the source's line says the second read added it", async () => {
    const { dataset, report } = await runAt(WEEK_1, emptyDataset(), [reply(bigShow), reply(bigShow, secondShow)]);

    expect(dataset.events.map((e) => [e.title, e.status])).toEqual([
      ["Big Show", "active"],
      ["Second Show", "active"],
    ]);
    expect(knuckleheadsLine(report)).toMatchObject({ extracted: 1, detail: "the second read added 1" });
  });

  it("a first read that cannot be cited on its page, then a second read that verifies, leaves the stored record active and verified", async () => {
    const week1 = await stored();

    const { dataset, report } = await runAt(WEEK_2, week1, [reply(candidate({ dateEvidence: "October 31st" }), secondShow), reply(bigShow, secondShow)]);

    expect(dataset.events.find((e) => e.title === "Big Show")).toMatchObject({ status: "active", lastVerified: WEEK_2_ISO, verificationFailures: 0 });
    expect(report.counts.unverifiedByUncitableReading).toBe(0);
  });

  it.each([
    ["first", [RESET, reply(bigShow, secondShow)]],
    ["second", [reply(bigShow, secondShow), RESET]],
  ])("when the %s call of a page throws, the page is extracted from the other read: nothing is struck and no page is reported not extracted", async (_, completions) => {
    const week1 = await stored();

    const { dataset, report } = await runAt(WEEK_2, week1, completions);

    for (const e of dataset.events) expect(e).toMatchObject({ status: "active", lastVerified: WEEK_2_ISO, verificationFailures: 0 });
    expect(knuckleheadsLine(report)).toMatchObject({ extracted: 2 });
    expect(knuckleheadsLine(report).detail).not.toContain("not extracted");
    expect(report.spend.shortfall.pagesNotExtracted).toBe(0);
  });

  it("when both calls of a page fail, the page is reported not extracted and its events are held", async () => {
    const week1 = await stored();
    const alpha = source("Alpha");

    // Alpha's page is read first, so the run has a call that came back and is not stopped by the fuse.
    const { dataset, report } = await runWith(WEEK_2, week1, {
      sources: [alpha, knuckleheads],
      pages: { [alpha.urls[0]!]: PAGE, [CALENDAR_URL]: LISTING },
      completions: [reply(candidateAt(alpha, { title: "Alpha Show" })), reply(candidateAt(alpha, { title: "Alpha Show" })), RESET, RESET],
      config: twice,
    });

    expect(dataset.events.filter((e) => e.title !== "Alpha Show")).toEqual(week1.events);
    expect(knuckleheadsLine(report)).toMatchObject({ extracted: 0, detail: `${CALENDAR_URL} not extracted: the model call failed (terminated)` });
  });

  it("when the spend cap refuses both calls of a page, the page counts once as not extracted", async () => {
    const week1 = await stored();
    const alpha = source("Alpha");
    const config = testConfig({ extractionReads: 2, spendCapUsd: 0.01 });

    const { report } = await runWith(WEEK_2, week1, {
      sources: [alpha, knuckleheads],
      pages: { [alpha.urls[0]!]: PAGE, [CALENDAR_URL]: LISTING },
      completions: [reply(candidateAt(alpha, { title: "Alpha Show" })), reply(candidateAt(alpha, { title: "Alpha Show" }))],
      config,
    });

    expect(report.spend.shortfall.pagesNotExtracted).toBe(1);
    expect(knuckleheadsLine(report).detail).toBe(`${CALENDAR_URL} not extracted: spend cap reached`);
  });

  it("the skip counts come from the first read, not doubled when both reads skip the same candidate", async () => {
    const happyHour = candidate({ title: "Happy Hour at Pizza Bar" });

    const { report } = await runAt(WEEK_1, emptyDataset(), [reply(happyHour, bigShow), reply(happyHour, bigShow, secondShow)]);

    expect(report.counts.skippedPromotion).toBe(1);
    expect(knuckleheadsLine(report)).toMatchObject({ extracted: 2, detail: "the second read added 1" });
  });

  it("a page with one read over a cap and one read in full counts as read in full: an event neither read lists is struck", async () => {
    const week1 = await stored();
    const overlong = candidate({ title: "x".repeat(201) });

    const { dataset, report } = await runAt(WEEK_2, week1, [reply(overlong, secondShow), reply(secondShow)]);

    expect(report.counts.overCap).toBe(1);
    expect(dataset.events.find((e) => e.title === "Big Show")).toMatchObject({ verificationFailures: 1 });
  });

  it("the two calls for a page start together", async () => {
    const fakes = fakePorts(WEEK_1, { pages: { [CALENDAR_URL]: LISTING }, completions: [reply(bigShow), reply(bigShow)], pagesCarryQuotes: false });
    let inFlight = 0;
    let most = 0;
    const model: ModelPort = {
      async complete(request) {
        inFlight++;
        most = Math.max(most, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        try {
          return await fakes.ports.model.complete(request);
        } finally {
          inFlight--;
        }
      },
    };

    await run({ config: twice, prompts: testPrompts(), dataset: emptyDataset(), registry: { sources: [knuckleheads] }, ports: { ...fakes.ports, model } });

    expect(most).toBe(2);
  });

  it("at one read, each registry page gets one call", async () => {
    const { requests, report } = await runAt(WEEK_1, emptyDataset(), [reply(bigShow, secondShow)], testConfig({ extractionReads: 1 }));

    expect(readsOf(requests, CALENDAR_URL)).toHaveLength(1);
    expect(knuckleheadsLine(report).detail).toBeUndefined();
  });

  it("the config defaults to two reads", () => {
    expect(parseConfig({}).extractionReads).toBe(2);
  });
});

describe("reads that stay single at two reads (#224)", () => {
  const PROMOTER_PAGE = "https://promoter.test/shows/promoter-night";
  const promoter = source("Promoter", { urls: [PROMOTER_PAGE] });
  const promoterNight = candidateAt(promoter, { title: "Promoter Night", venue: "The Truman", venueEvidence: "The Truman, 801 Westport Rd" });
  const withDiscovery = (config = twice) => ({ ...config, discovery: { ...config.discovery, enabled: true } });
  const QUERY = "music events in Kansas City, October to November 2026";
  const searches = { [QUERY]: [{ url: PROMOTER_PAGE, title: "Promoter Night", snippet: "Live at The Truman" }] };

  it("a discovery lead is read once", async () => {
    const { requests, dataset } = await runWith(WEEK_1, emptyDataset(), {
      sources: [knuckleheads],
      pages: { [CALENDAR_URL]: PAGE, [PROMOTER_PAGE]: PAGE },
      completions: [reply(bigShow), reply(bigShow), reply(promoterNight)],
      config: withDiscovery(),
      searches,
    });

    expect(readsOf(requests, CALENDAR_URL)).toHaveLength(2);
    expect(readsOf(requests, PROMOTER_PAGE)).toHaveLength(1);
    expect(dataset.events.find((e) => e.title === "Promoter Night")).toMatchObject({ lastVerified: WEEK_1_ISO });
  });

  it("a page re-verified is read once", async () => {
    const SHOWS_URL = "https://knuckleheads.test/shows";
    const twoPages = { ...knuckleheads, urls: [CALENDAR_URL, SHOWS_URL] };
    const pages = { [CALENDAR_URL]: PAGE, [SHOWS_URL]: PAGE };
    const week1 = await runWith(WEEK_1, emptyDataset(), { sources: [twoPages], pages, completions: [reply(bigShow), reply(secondShow)] });

    // The shows page has left the registry, so the event cited from it is re-verified: one call.
    const week2 = await runWith(WEEK_2, week1.dataset, { sources: [knuckleheads], pages, completions: [reply(bigShow), reply(bigShow), reply(secondShow)], config: twice });

    expect(readsOf(week2.requests, CALENDAR_URL)).toHaveLength(2);
    expect(readsOf(week2.requests, SHOWS_URL)).toHaveLength(1);
    expect(week2.dataset.events.find((e) => e.title === "Second Show")).toMatchObject({ lastVerified: WEEK_2_ISO });
  });

  it("an own page is read once", async () => {
    const lied = source("Lied", { neighborhood: "Lawrence", readEventPages: true });
    const LIST_URL = lied.urls[0]!;
    const OWN_URL = "https://lied.test/event/music-and-mental-health/";
    const TIME_QUOTE = "Monday • October 12, 2026 • 7:00 pm";
    const listed = reply(
      candidateAt(lied, { title: "Music and Mental Health", startDate: "2026-10-12", startTime: null, eventLink: 1, dateEvidence: "Monday, October 12", venueEvidence: "Lied Center" }),
    );
    const timed: ScriptedReply = {
      value: { date: "2026-10-12", time: "19:00", timeEvidence: TIME_QUOTE, price: null, priceEvidence: null, ages: null, agesEvidence: null, days: null, daysEvidence: null, daysLink: null, description: null },
      costUsd: 0.002,
    };

    const { requests, dataset } = await runWith(WEEK_1, emptyDataset(), {
      sources: [lied],
      pages: {
        [LIST_URL]: { status: 200, body: `<html><body><div><a href="/event/music-and-mental-health/">Music and Mental Health</a> Monday, October 12 · Lied Center</div></body></html>` },
        [OWN_URL]: { status: 200, body: `<html><body><h1>Music and Mental Health</h1><p>${TIME_QUOTE}</p></body></html>` },
      },
      completions: [listed, listed, timed],
      config: twice,
    });

    expect(readsOf(requests, LIST_URL)).toHaveLength(2);
    expect(requests.filter((r) => r.messages.some((m) => m.content.includes(OWN_URL)) && !r.messages.some((m) => m.content.includes(LIST_URL)))).toHaveLength(1);
    expect(dataset.events[0]!.start).toContain("19:00");
  });
});

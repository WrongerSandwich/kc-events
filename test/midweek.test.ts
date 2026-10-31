import { describe, expect, it } from "vitest";
import { emptyDataset, type Dataset, type Event } from "../src/dataset.js";
import type { CompletionRequest } from "../src/ports.js";
import { EVENTS_TO_JUDGE } from "../src/curation.js";
import { renderReportMarkdown } from "../src/report.js";
import { TEST_MODELS } from "./fakes/config.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, judging, knuckleheads, PAGE, reply, source, WEEK_1 } from "./fakes/fixtures.js";

// A midweek pass (#253): the events whose span covers a day from today through today + N have their
// primary pages re-read, and nothing else happens: no list read, no search, no own page, nothing created.

const CALENDAR_URL = knuckleheads.urls[0]!;
const elsewhere = source("Elsewhere");
const ELSEWHERE_URL = elsewhere.urls[0]!;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Three days after WEEK_1's run (local 2026-10-02): local 2026-10-05, a window through 2026-10-15. */
const MIDWEEK = new Date(WEEK_1.getTime() + 3 * DAY_MS);
const TEN_DAYS = { days: 10 };

const near = candidateAt(knuckleheads, { title: "Near Show", startDate: "2026-10-08", dateEvidence: "Thu, Oct 8" });
const late = candidateAt(knuckleheads, { title: "Late Show", startDate: "2026-11-21", dateEvidence: "Sat, Nov 21" });
const far = candidateAt(elsewhere, { title: "Far Show", startDate: "2026-11-20", dateEvidence: "Fri, Nov 20" });
const nearby = candidateAt(elsewhere, { title: "Nearby Show", startDate: "2026-10-10", dateEvidence: "Sat, Oct 10" });
const PAGES = { [CALENDAR_URL]: PAGE, [ELSEWHERE_URL]: PAGE };

/** The weekly run before the pass: Knuckleheads lists Near Show and Late Show, Elsewhere the given shows. */
async function weekly(elsewhereLists: unknown[] = [far]) {
  const result = await runWith(WEEK_1, emptyDataset(), { sources: [knuckleheads, elsewhere], pages: PAGES, completions: [reply(near, late), reply(...elsewhereLists)] });
  return result.dataset;
}

function midweek(dataset: Dataset, completions: ReturnType<typeof reply>[], options: { pages?: typeof PAGES; curate?: (r: CompletionRequest) => ReturnType<typeof judging> } = {}) {
  return runWith(MIDWEEK, dataset, { sources: [knuckleheads, elsewhere], pages: options.pages ?? PAGES, completions, reverifyOnly: TEN_DAYS, ...(options.curate && { curate: options.curate }) });
}

const titled = (dataset: Dataset, title: string): Event => dataset.events.find((e) => e.title === title)!;
const fetches = (calls: string[]) => calls.filter((c) => c.startsWith("fetch:"));

describe("a midweek re-verification pass", () => {
  it("fetches only the primary pages of the events in its window, and makes one extraction call a page", async () => {
    const before = await weekly([far, nearby]);

    const { calls, report } = await midweek(before, [reply(near, late), reply(far, nearby)]);

    expect(fetches(calls)).toEqual([`fetch:${CALENDAR_URL}`, `fetch:${ELSEWHERE_URL}`]);
    expect(calls.filter((c) => c === `model:${TEST_MODELS.extraction}`)).toHaveLength(2);
    expect(report.reverification.pagesRead).toBe(2);
    expect(report.counts.reverified).toBe(2);
  });

  it("fetches nothing, and calls no model, when no event is in its window", async () => {
    const before = await weekly();
    const notNear = { ...before, events: before.events.filter((e) => e.title !== "Near Show") };

    const { calls, dataset, report } = await midweek(notNear, []);

    expect(calls).toEqual([]);
    expect(dataset.events).toEqual(notNear.events);
    expect(report.reverification.pagesRead).toBe(0);
  });

  it("creates nothing from what a page lists that no stored event is", async () => {
    const before = await weekly();
    const brandNew = candidateAt(knuckleheads, { title: "Brand New", startDate: "2026-10-09", dateEvidence: "Fri, Oct 9" });

    const { dataset, report } = await midweek(before, [reply(near, brandNew, late)]);

    expect(dataset.events.map((e) => e.title).sort()).toEqual(["Far Show", "Late Show", "Near Show"]);
    expect(report.counts.new).toBe(0);
  });

  it("strikes an event in its window that its page no longer lists, and leaves the rest of the page's events alone", async () => {
    const before = await weekly();

    const { dataset } = await midweek(before, [reply()]);

    expect(titled(dataset, "Near Show").verificationFailures).toBe(1);
    expect(titled(dataset, "Late Show")).toEqual(titled(before, "Late Show"));
  });

  it("expires an event its page now says is cancelled, and the report's changes list it as gone", async () => {
    const before = await weekly();

    const { dataset, report } = await midweek(before, [reply({ ...near, notice: "cancelled" }, late)]);

    expect(titled(dataset, "Near Show")).toMatchObject({ status: "expired", expiryReason: "cancelled" });
    expect(report.changes?.gone).toEqual([expect.objectContaining({ title: "Near Show", reason: "cancelled" })]);
  });

  it("moves a pick to the date its page now gives and has curation judge it again", async () => {
    const before = await weekly();
    const id = titled(before, "Near Show").id;
    const picked: Dataset = {
      ...before,
      events: before.events.map((e) => (e.id === id ? { ...e, dontMiss: true, whyLine: "A rare one.", lastJudged: e.lastChanged, eventUrl: "https://knuckleheads.test/near" } : e)),
    };
    const judged: string[] = [];
    const curate = (request: CompletionRequest) => {
      const sent = JSON.parse(request.messages[1]!.content.slice(EVENTS_TO_JUDGE.length)) as { id: string }[];
      judged.push(...sent.map((e) => e.id));
      return judging(0.01, { id, dontMiss: true, why: "Still a rare one." });
    };

    const { dataset, report, calls } = await midweek(picked, [reply({ ...near, startDate: "2026-10-09", dateEvidence: "Fri, Oct 9" }, late)], { curate });

    expect(titled(dataset, "Near Show").start).toMatch(/^2026-10-09/);
    expect(judged).toEqual([id]);
    expect(report.changes?.moved).toEqual([expect.objectContaining({ id })]);
    // No own page is read midweek, a pick's included.
    expect(calls).not.toContain("fetch:https://knuckleheads.test/near");
    expect(report.ownPages).toEqual([]);
  });

  it("holds an event through an outage of its page", async () => {
    const before = await weekly([far, nearby]);

    const { dataset, report } = await midweek(before, [reply(far, nearby)], { pages: { [CALENDAR_URL]: { status: 503, body: "down" }, [ELSEWHERE_URL]: PAGE } });

    expect(titled(dataset, "Near Show")).toEqual({ ...titled(before, "Near Show"), consecutiveOutages: 1 });
    expect(report.counts.heldThroughOutage).toBe(1);
  });

  it("stops, writing nothing, when none of the pages it fetches comes back", async () => {
    const before = await weekly([far, nearby]);
    const down = { status: 503, body: "down" };

    await expect(midweek(before, [], { pages: { [CALENDAR_URL]: down, [ELSEWHERE_URL]: down } })).rejects.toThrow("no page could be fetched for re-verification (2 pages tried)");
  });

  it("keeps the sources' state and reads no source, so a midweek pass is not a weekly run's failure or success", async () => {
    const before = await weekly();
    const failing = { ...before, sourceState: { Knuckleheads: { consecutiveFailures: 2 } } };

    const { dataset, report } = await midweek(failing, [reply(near, late)]);

    expect(dataset.sourceState).toEqual(failing.sourceState);
    expect(report.sources).toEqual([]);
    expect(report.discovery.enabled).toBe(false);
  });

  it("is reported as a midweek pass, with its window, under its own heading", async () => {
    const before = await weekly();

    const { report } = await midweek(before, [reply(near, late)]);

    expect(report).toMatchObject({ mode: "reverify-only", windowDays: 10 });
    const markdown = renderReportMarkdown(report);
    expect(markdown.split("\n")[0]).toBe("# Midweek re-verification 2026-10-05");
    expect(markdown).toContain("Re-verified the events of today and the next 10 days only");
    expect(markdown).toContain("1 page re-read.");
  });

  it("leaves a weekly run reported as one", async () => {
    const { report } = await runWith(WEEK_1, emptyDataset(), { sources: [knuckleheads], pages: { [CALENDAR_URL]: PAGE }, completions: [reply(near)] });

    expect(report.mode).toBe("weekly");
    expect(report.windowDays).toBeUndefined();
    expect(renderReportMarkdown(report).split("\n")[0]).toBe("# Run report 2026-10-02");
  });
});

import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, parseDataset, type Dataset, type Event } from "../src/dataset.js";
import type { CompletionResult } from "../src/ports.js";
import { fakePorts, type CannedPage } from "./fakes/ports.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { renderReportMarkdown } from "../src/report.js";
import { toLocalIso } from "../src/time.js";
import { candidateAt, costing, PAGE, source, WEEK_1 } from "./fakes/fixtures.js";

const knuckleheads = source("Knuckleheads", { neighborhood: "East Bottoms" });
const CALENDAR_URL = knuckleheads.urls[0]!;
// Another source that always answers: a run in which every source fails stops instead (see the run tests).
const elsewhere = source("Elsewhere");
// A show far enough out that it is not past for any run here.
const candidate = (overrides: Record<string, unknown> = {}) =>
  candidateAt(knuckleheads, { startDate: "2026-12-12", dateEvidence: "Sat, Dec 12 · Show 8:00 PM", ...overrides });
/** The weekly run n weeks after the first: week(1) is WEEK_1. */
const week = (n: number) => new Date(WEEK_1.getTime() + (n - 1) * 7 * 24 * 60 * 60 * 1000);
const weekIso = (n: number) => toLocalIso(week(n), "America/Chicago");
const reply = (...candidates: unknown[]) => costing(0.01, ...candidates);

/** One run over Knuckleheads and Elsewhere; Elsewhere's page lists nothing. */
async function runAt(now: Date, dataset: Dataset, knuckleheadsPage: CannedPage, completions: CompletionResult[] = []) {
  const fakes = fakePorts(now, { pages: { [CALENDAR_URL]: knuckleheadsPage, [elsewhere.urls[0]!]: PAGE }, completions });
  const result = await run({ config: testConfig(), prompts: testPrompts(), dataset, registry: { sources: [knuckleheads, elsewhere] }, ports: fakes.ports });
  expect(parseDataset(result.dataset)).toEqual(result.dataset);
  return { ...result, calls: fakes.calls };
}

/** A run in which Knuckleheads lists the Big Show, verified; the first run when no dataset is given. */
const seen = (now = WEEK_1, dataset = emptyDataset()) => runAt(now, dataset, PAGE, [reply(candidate()), reply()]);
/** A run in which Knuckleheads' page loads and no longer lists the Big Show. */
const missing = (now: Date, dataset: Dataset) => runAt(now, dataset, PAGE, [reply(), reply()]);
const FORBIDDEN: CannedPage = { status: 403, body: "Forbidden" };
/** A run in which Knuckleheads' page cannot be loaded (a 403 unless given). */
const down = (now: Date, dataset: Dataset, page: CannedPage = FORBIDDEN) => runAt(now, dataset, page, [reply()]);

/** Runs the steps in order from the given dataset, one week apart starting at week `from`. */
async function weeks(from: number, dataset: Dataset, ...steps: ((now: Date, dataset: Dataset) => ReturnType<typeof runAt>)[]) {
  let last: Awaited<ReturnType<typeof runAt>> | undefined;
  for (const [i, step] of steps.entries()) {
    last = await step(week(from + i), last?.dataset ?? dataset);
  }
  return last!;
}

const only = (dataset: Dataset): Event => {
  expect(dataset.events).toHaveLength(1);
  return dataset.events[0]!;
};

describe("outages", () => {
  it.each<[string, CannedPage]>([
    ["a network error", new Error("read ECONNRESET")],
    ["HTTP 403", { status: 403, body: "Forbidden" }],
    ["HTTP 429", { status: 429, body: "Too Many Requests" }],
    ["HTTP 503", { status: 503, body: "Service Unavailable" }],
    ["an unreachable robots.txt", "robots-unreachable"],
  ])("%s holds an active event as it was, with one outage and no strike", async (_, page) => {
    const first = await seen();

    const second = await down(week(2), first.dataset, page);

    expect(second.dataset.events).toEqual([{ ...first.dataset.events[0], consecutiveOutages: 1 }]);
    expect(second.report.counts).toMatchObject({ heldThroughOutage: 1, unverifiedByOutageLimit: 0, expired: { "two-strike": 0 } });
  });

  it("a registry source that fails is not fetched again by re-verification", async () => {
    const first = await seen();

    const second = await down(week(2), first.dataset);

    expect(second.calls.filter((c) => c.includes("knuckleheads"))).toEqual([`fetch:${CALENDAR_URL}`]);
  });

  it("a registry source that 403s holds the events read from it even when re-verification re-fetches a separate page that also fails", async () => {
    const first = await seen();
    // The venue moved its calendar; the event's primary page is still the old one.
    const moved = { ...knuckleheads, urls: ["https://knuckleheads.test/shows"] };
    const fakes = fakePorts(week(2), { pages: { [moved.urls[0]!]: FORBIDDEN, [CALENDAR_URL]: FORBIDDEN, [elsewhere.urls[0]!]: PAGE }, completions: [reply()] });

    const second = await run({ config: testConfig(), prompts: testPrompts(), dataset: first.dataset, registry: { sources: [moved, elsewhere] }, ports: fakes.ports });

    expect(fakes.calls).toContain(`fetch:${CALENDAR_URL}`);
    expect(second.dataset.events).toEqual([{ ...first.dataset.events[0], consecutiveOutages: 1 }]);
  });

  it("the third consecutive outage makes an active event unverified, never expired, keeping its reading and curation", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), PAGE, [reply(candidate()), reply()]);
    const flagged = { ...first.dataset, events: first.dataset.events.map((e) => ({ ...e, dontMiss: true, whyLine: "The one show this fall." })) };

    const second = await down(week(2), flagged);
    const third = await down(week(3), second.dataset);
    expect(only(third.dataset)).toEqual({ ...flagged.events[0], consecutiveOutages: 2 });

    const fourth = await down(week(4), third.dataset);
    expect(only(fourth.dataset)).toEqual({ ...flagged.events[0], status: "unverified", consecutiveOutages: 3, lastChanged: weekIso(4) });
    expect(fourth.report.counts).toMatchObject({ heldThroughOutage: 0, unverifiedByOutageLimit: 1, expired: { "two-strike": 0 } });
    expect(fourth.report.outageLimited).toEqual([{ title: "Big Show", primaryUrl: CALENDAR_URL }]);
    const markdown = renderReportMarkdown(fourth.report);
    expect(markdown).toContain("| Held through an outage | 0 |");
    expect(markdown).toContain("| Unverified by outage limit | 1 |");
    expect(markdown).toContain(`## Unverified by outage limit\n\n- Big Show: ${CALENDAR_URL}`);
  });

  it("an event at the outage limit is re-checked each run and is active again under its id when its page lists it", async () => {
    const first = await seen();
    const hidden = await weeks(2, first.dataset, down, down, down, down);
    expect(only(hidden.dataset)).toMatchObject({ status: "unverified", consecutiveOutages: 4 });
    expect(hidden.report.counts).toMatchObject({ heldThroughOutage: 0, unverifiedByOutageLimit: 0 });

    const back = await seen(week(6), hidden.dataset);

    expect(only(back.dataset)).toMatchObject({ id: first.dataset.events[0]!.id, status: "active", consecutiveOutages: 0, lastVerified: weekIso(6) });
  });

  it("an event at the outage limit whose page is re-fetched and lists it is active again", async () => {
    const first = await seen();
    const hidden = await weeks(2, first.dataset, down, down, down);
    // The venue moved its calendar, so only re-verification reads the old page.
    const moved = { ...knuckleheads, urls: ["https://knuckleheads.test/shows"] };
    const fakes = fakePorts(week(5), {
      pages: { [moved.urls[0]!]: PAGE, [CALENDAR_URL]: PAGE, [elsewhere.urls[0]!]: PAGE },
      completions: [reply(), reply(), reply(candidate())],
    });

    const back = await run({ config: testConfig(), prompts: testPrompts(), dataset: hidden.dataset, registry: { sources: [moved, elsewhere] }, ports: fakes.ports });

    expect(only(back.dataset)).toMatchObject({ id: first.dataset.events[0]!.id, status: "active", consecutiveOutages: 0, lastVerified: weekIso(5) });
    expect(back.report.counts.reverified).toBe(1);
  });

  it("an event at the outage limit whose page loads without it takes a strike; a second expires it as two-strike", async () => {
    const first = await seen();
    const hidden = await weeks(2, first.dataset, down, down, down);

    const struck = await missing(week(5), hidden.dataset);
    expect(only(struck.dataset)).toMatchObject({ status: "unverified", verificationFailures: 1, consecutiveOutages: 0 });

    const gone = await missing(week(6), struck.dataset);
    expect(only(gone.dataset)).toMatchObject({ status: "expired", expiryReason: "two-strike", verificationFailures: 2 });
    expect(gone.report.counts.expired["two-strike"]).toBe(1);
  });

  it("strikes count only across runs that read the page: a strike, an outage, then a strike expires the event", async () => {
    const first = await seen();

    const last = await weeks(2, first.dataset, missing, down, missing);

    expect(only(last.dataset)).toMatchObject({ status: "expired", expiryReason: "two-strike", verificationFailures: 2 });
  });

  it("an outage between two sightings leaves no strike and no outage behind", async () => {
    const first = await seen();

    const last = await weeks(2, first.dataset, down, seen);

    expect(only(last.dataset)).toMatchObject({ status: "active", verificationFailures: 0, consecutiveOutages: 0, lastVerified: weekIso(3) });
  });

  it("an outage neither adds a strike nor clears one", async () => {
    const first = await seen();

    const last = await weeks(2, first.dataset, missing, down);

    expect(only(last.dataset)).toMatchObject({ status: "active", verificationFailures: 1, consecutiveOutages: 1 });
  });

  it.each<[string, CannedPage]>([
    ["HTTP 404", { status: 404, body: "Not Found" }],
    ["HTTP 410", { status: 410, body: "Gone" }],
    ["a robots.txt that now disallows the job", "robots-blocked"],
  ])("%s is a strike, not an outage", async (_, page) => {
    const first = await seen();

    const second = await down(week(2), first.dataset, page);

    expect(second.dataset.events).toEqual([{ ...first.dataset.events[0], verificationFailures: 1 }]);
    expect(second.report.counts.heldThroughOutage).toBe(0);
  });

  it("a page that loads and no longer lists the event is a strike, and ends a run of outages", async () => {
    const first = await seen();

    const last = await weeks(2, first.dataset, down, missing);

    expect(only(last.dataset)).toMatchObject({ status: "active", verificationFailures: 1, consecutiveOutages: 0 });
  });

  it("an unverified event that never met cite-or-drop is not re-fetched", async () => {
    // The page names no venue, so the event is held unverified from the start.
    const first = await runAt(WEEK_1, emptyDataset(), PAGE, [reply(candidate({ venue: null, venueEvidence: null })), reply()]);
    expect(only(first.dataset)).toMatchObject({ status: "unverified" });
    // The venue moved its calendar; the event's page is the old one, which nothing reads now.
    const moved = { ...knuckleheads, urls: ["https://knuckleheads.test/shows"] };
    const fakes = fakePorts(week(2), { pages: { [moved.urls[0]!]: PAGE, [elsewhere.urls[0]!]: PAGE }, completions: [reply(), reply()] });

    const second = await run({ config: testConfig(), prompts: testPrompts(), dataset: first.dataset, registry: { sources: [moved, elsewhere] }, ports: fakes.ports });

    expect(fakes.calls).not.toContain(`fetch:${CALENDAR_URL}`);
    expect(second.dataset.events).toEqual(first.dataset.events);
  });
});

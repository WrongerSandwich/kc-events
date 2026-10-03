import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, parseDataset, type Dataset } from "../src/dataset.js";
import type { CompletionResult } from "../src/ports.js";
import { fakePorts, type CannedPage } from "./fakes/ports.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { candidateAt, costing, PAGE, source, WEEK_1, WEEK_1_ISO, WEEK_2, WEEK_2_ISO, WEEK_3, WEEK_3_ISO } from "./fakes/fixtures.js";

const knuckleheads = source("Knuckleheads", { neighborhood: "East Bottoms" });
const CALENDAR_URL = knuckleheads.urls[0]!;
const candidate = (overrides: Record<string, unknown> = {}) => candidateAt(knuckleheads, overrides);
const reply = (...candidates: unknown[]) => costing(0.01, ...candidates);

/** One run over the Knuckleheads calendar with the given canned pages and model replies. */
async function runAt(
  now: Date,
  dataset: Dataset,
  {
    pages = { [CALENDAR_URL]: PAGE },
    completions,
    source = knuckleheads,
  }: { pages?: Record<string, CannedPage>; completions: CompletionResult[]; source?: typeof knuckleheads },
) {
  const fakes = fakePorts(now, { pages, completions });
  const result = await run({ config: testConfig(), prompts: testPrompts(), dataset, registry: { sources: [source] }, ports: fakes.ports });
  expect(parseDataset(result.dataset)).toEqual(result.dataset);
  return { ...result, calls: fakes.calls };
}

describe("incremental update", () => {
  it("a second run over unchanged pages advances last-verified and creates nothing", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), { completions: [reply(candidate(), candidate({ title: "Other Band" }))] });
    const second = await runAt(WEEK_2, first.dataset, { completions: [reply(candidate(), candidate({ title: "Other Band" }))] });

    expect(second.dataset.events).toHaveLength(2);
    expect(second.dataset.events.map((e) => e.id)).toEqual(first.dataset.events.map((e) => e.id));
    expect(second.dataset.events.map((e) => e.lastVerified)).toEqual([WEEK_2_ISO, WEEK_2_ISO]);
    expect(second.dataset.events.every((e) => e.firstSeen === WEEK_1_ISO)).toBe(true);
    expect(second.report.counts).toMatchObject({ found: 2, new: 0, updated: 2 });
    expect(second.dataset.events.map((e) => e.lastChanged)).toEqual([WEEK_1_ISO, WEEK_1_ISO]);
  });

  it("a venue the model spells with different case, punctuation, or a leading article is not a change", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), { completions: [reply(candidate())] });

    const second = await runAt(WEEK_2, first.dataset, { completions: [reply(candidate({ venue: "The KNUCKLEHEADS." }))] });

    expect(second.dataset.events[0]).toMatchObject({ venue: "The KNUCKLEHEADS.", lastVerified: WEEK_2_ISO, lastChanged: WEEK_1_ISO });
  });

  it("a date change keeps the id and marks the event as changed for curation", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), { completions: [reply(candidate())] });
    expect(first.dataset.events[0]!.lastChanged).toBe(WEEK_1_ISO);

    const second = await runAt(WEEK_2, first.dataset, {
      completions: [reply(candidate({ startDate: "2026-11-07", dateEvidence: "Sat, Nov 7 · Show 8:00 PM" }))],
    });

    expect(second.dataset.events).toEqual([
      {
        ...first.dataset.events[0],
        start: "2026-11-07T20:00:00-06:00",
        evidence: { ...first.dataset.events[0]!.evidence, date: "Sat, Nov 7 · Show 8:00 PM" },
        lastVerified: WEEK_2_ISO,
        lastChanged: WEEK_2_ISO,
        lastJudged: WEEK_2_ISO,
      },
    ]);
    expect(second.report.counts).toMatchObject({ new: 0, updated: 1 });
  });

  it("a recurring event's schedule is its date: a new schedule marks it changed, the same schedule does not", async () => {
    const trivia = (schedule: string) =>
      candidate({ title: "Trivia", startDate: null, startTime: null, schedule, dateEvidence: `Trivia ${schedule}` });
    const first = await runAt(WEEK_1, emptyDataset(), { completions: [reply(trivia("every Tuesday"))] });
    const same = await runAt(WEEK_2, first.dataset, { completions: [reply(trivia("every Tuesday"))] });
    const moved = await runAt(WEEK_3, same.dataset, { completions: [reply(trivia("every Wednesday"))] });

    expect(same.dataset.events[0]).toMatchObject({ recurrence: "recurring", lastChanged: WEEK_1_ISO });
    expect(moved.dataset.events[0]).toMatchObject({ id: first.dataset.events[0]!.id, schedule: "every Wednesday", lastChanged: WEEK_3_ISO });
  });

  it("a postponement with a new date is a date change on the same event, not an expiry", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), { completions: [reply(candidate())] });

    const second = await runAt(WEEK_2, first.dataset, {
      completions: [
        reply(
          candidate({
            title: "BIG SHOW",
            startDate: "2026-11-02",
            dateEvidence: "POSTPONED to Mon, Nov 2",
            notice: "postponed",
          }),
        ),
      ],
    });

    expect(second.dataset.events).toHaveLength(1);
    expect(second.dataset.events[0]).toMatchObject({
      id: first.dataset.events[0]!.id,
      status: "active",
      start: "2026-11-02T20:00:00-06:00",
      lastChanged: WEEK_2_ISO,
    });
  });
});

describe("re-verification and expiry", () => {
  it("an event missing from its page once stays active with one strike; missing twice expires it with reason two-strike", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), { completions: [reply(candidate())] });

    const second = await runAt(WEEK_2, first.dataset, { completions: [reply()] });
    expect(second.dataset.events).toEqual([{ ...first.dataset.events[0], verificationFailures: 1 }]);
    expect(second.report.counts.expired["two-strike"]).toBe(0);

    const third = await runAt(WEEK_3, second.dataset, { completions: [reply()] });
    expect(third.dataset.events).toEqual([
      { ...first.dataset.events[0], status: "expired", expiryReason: "two-strike", verificationFailures: 2, lastChanged: "2026-10-16T22:15:00-05:00" },
    ]);
    expect(third.report.counts.expired["two-strike"]).toBe(1);
  });

  describe("an active event the registry lane did not read", () => {
    // The venue moved its calendar between runs; the event's primary page is still the old one.
    const NEW_CALENDAR_URL = "https://knuckleheads.test/shows";
    const moved = { ...knuckleheads, urls: [NEW_CALENDAR_URL] };

    it("has its primary page re-fetched, and is re-verified when the page still lists it", async () => {
      const first = await runAt(WEEK_1, emptyDataset(), { completions: [reply(candidate())] });

      const second = await runAt(WEEK_2, first.dataset, {
        source: moved,
        pages: { [NEW_CALENDAR_URL]: PAGE, [CALENDAR_URL]: PAGE },
        completions: [reply(), reply(candidate())],
      });

      expect(second.calls).toEqual(["fetch:https://knuckleheads.test/shows", "model:test/extraction", "fetch:https://knuckleheads.test/calendar", "model:test/extraction"]);
      expect(second.dataset.events).toEqual([{ ...first.dataset.events[0], lastVerified: WEEK_2_ISO }]);
      expect(second.report.counts).toMatchObject({ found: 0, new: 0, updated: 0, reverified: 1 });
      expect(second.report.spend.totalUsd).toBeCloseTo(0.02);
    });

    it("expires with reason cancelled when the re-fetched page says so, and takes a strike when it no longer lists the event", async () => {
      const first = await runAt(WEEK_1, emptyDataset(), { completions: [reply(candidate(), candidate({ title: "Other Band" }))] });

      const second = await runAt(WEEK_2, first.dataset, {
        source: moved,
        pages: { [NEW_CALENDAR_URL]: PAGE, [CALENDAR_URL]: PAGE },
        completions: [reply(), reply(candidate({ notice: "cancelled" }))],
      });

      expect(second.calls.filter((c) => c === `fetch:${CALENDAR_URL}`)).toHaveLength(1);
      expect(second.dataset.events).toEqual([
        { ...first.dataset.events[0], status: "expired", expiryReason: "cancelled", lastChanged: WEEK_2_ISO },
        { ...first.dataset.events[1], verificationFailures: 1 },
      ]);
      expect(second.report.counts).toMatchObject({ reverified: 0, expired: { past: 0, "two-strike": 0, cancelled: 1 } });
    });

    it("takes a strike when the re-fetch fails", async () => {
      const first = await runAt(WEEK_1, emptyDataset(), { completions: [reply(candidate())] });

      const second = await runAt(WEEK_2, first.dataset, {
        source: moved,
        pages: { [NEW_CALENDAR_URL]: PAGE, [CALENDAR_URL]: { status: 404, body: "gone" } },
        completions: [reply()],
      });

      expect(second.dataset.events).toEqual([{ ...first.dataset.events[0], verificationFailures: 1 }]);
      expect(second.report.counts.reverified).toBe(0);
    });
  });

  it("an event whose source failed this run takes a strike without its page being fetched twice", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), { completions: [reply(candidate())] });

    const second = await runAt(WEEK_2, first.dataset, { pages: { [CALENDAR_URL]: new Error("connect ECONNREFUSED") }, completions: [] });

    expect(second.calls).toEqual(["fetch:https://knuckleheads.test/calendar"]);
    expect(second.dataset.events).toEqual([{ ...first.dataset.events[0], verificationFailures: 1 }]);
  });

  it("a page saying cancelled expires the known event with reason cancelled", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), { completions: [reply(candidate())] });

    const second = await runAt(WEEK_2, first.dataset, { completions: [reply(candidate({ notice: "cancelled" }))] });

    expect(second.dataset.events).toEqual([{ ...first.dataset.events[0], status: "expired", expiryReason: "cancelled", lastChanged: WEEK_2_ISO }]);
    expect(second.report.counts).toMatchObject({ found: 1, updated: 0, expired: { past: 0, "two-strike": 0, cancelled: 1 } });

    const third = await runAt(WEEK_3, second.dataset, { completions: [reply(candidate({ notice: "cancelled" }))] });
    expect(third.dataset.events).toEqual(second.dataset.events);
    expect(third.report.counts.expired.cancelled).toBe(0);
  });

  it("an event whose date has passed expires with reason past and is not re-checked", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), { completions: [reply(candidate({ startDate: "2026-10-05", dateEvidence: "Mon, Oct 5" }))] });

    const second = await runAt(WEEK_2, first.dataset, { completions: [reply()] });

    expect(second.dataset.events).toEqual([{ ...first.dataset.events[0], status: "expired", expiryReason: "past", lastChanged: WEEK_2_ISO }]);
    expect(second.report.counts.expired).toEqual({ past: 1, "two-strike": 0, cancelled: 0 });
  });

  it("a past-dated candidate the page still shows is not recorded as a new event", async () => {
    const { dataset, report } = await runAt(WEEK_2, emptyDataset(), {
      completions: [reply(candidate({ startDate: "2026-10-05", dateEvidence: "Mon, Oct 5" }))],
    });

    expect(dataset.events).toEqual([]);
    expect(report.counts).toMatchObject({ found: 0, new: 0 });
  });

  it("two strikes must be consecutive: a run that lists the event, even without anything citable, clears its strike", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), { completions: [reply(candidate())] });
    const struck = await runAt(WEEK_2, first.dataset, { completions: [reply()] });
    expect(struck.dataset.events[0]!.verificationFailures).toBe(1);

    const listed = await runAt(WEEK_3, struck.dataset, {
      completions: [reply(candidate({ startDate: null, startTime: null, dateEvidence: null }))],
    });

    expect(listed.dataset.events[0]).toMatchObject({ status: "active", verificationFailures: 0, lastVerified: WEEK_1_ISO });
  });

  it("a model reply that cannot be read is not a strike against the events on that page", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), { completions: [reply(candidate())] });

    const second = await runAt(WEEK_2, first.dataset, { completions: [{ value: { nonsense: true }, costUsd: 0.01 }] });

    expect(second.dataset.events).toEqual(first.dataset.events);
  });

  it("an event seen twice in one run is new, not also updated", async () => {
    const { report } = await runAt(WEEK_1, emptyDataset(), { completions: [reply(candidate(), candidate({ title: "big show" }))] });

    expect(report.counts).toMatchObject({ found: 1, new: 1, updated: 0 });
  });
});

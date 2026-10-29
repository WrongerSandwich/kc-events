import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { cleanWhyLine, EVENTS_TO_JUDGE, markChanged } from "../src/curation.js";
import { emptyDataset, parseDataset, type Dataset } from "../src/dataset.js";
import type { CompletionResult } from "../src/ports.js";
import { newEventId } from "../src/extraction.js";
import { fakePorts } from "./fakes/ports.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { candidateAt, costing, judging, PAGE, source, WEEK_1, WEEK_1_ISO, WEEK_2, WEEK_2_ISO } from "./fakes/fixtures.js";

const recordbar = source("recordBar");
const CALENDAR_URL = recordbar.urls[0]!;
const candidate = (overrides: Record<string, unknown> = {}) => candidateAt(recordbar, overrides);
const extracted = (...candidates: unknown[]) => costing(0.01, ...candidates);
const SHOW_ID = newEventId(CALENDAR_URL, "Big Show", WEEK_1_ISO, "2026-10-31");
const tour = candidate({ title: "Gallery Tour", startDate: null, startTime: null, schedule: "every Tuesday", dateEvidence: "Gallery Tour every Tuesday" });

/** One run over the recordBar calendar with one scripted extraction reply and, when given, one scripted curation reply. */
async function runAt(now: Date, dataset: Dataset, [extraction, curation]: [CompletionResult, CompletionResult?], spendCapUsd = 5) {
  const fakes = fakePorts(now, { pages: { [CALENDAR_URL]: PAGE }, completions: [extraction], curations: curation ? [curation] : [] });
  const result = await run({ config: testConfig({ spendCapUsd }), prompts: testPrompts(), dataset, registry: { sources: [recordbar] }, ports: fakes.ports });
  expect(parseDataset(result.dataset)).toEqual(result.dataset);
  const curationCalls = fakes.calls.filter((c) => c === "model:test/curation");
  const curationRequests = fakes.requests.filter((r) => r.model === "test/curation");
  return { ...result, calls: fakes.calls, curationCalls, curationRequests };
}

describe("don't-miss curation", () => {
  it("a new one-off is judged with the curation prompt, and its flag and why-line are stored", async () => {
    const { dataset, report, curationRequests } = await runAt(WEEK_1, emptyDataset(), [
      extracted(candidate()),
      judging(0.02, { id: SHOW_ID, dontMiss: true, why: "A touring act that rarely plays a room this small." }),
    ]);

    expect(curationRequests).toHaveLength(1);
    expect(curationRequests[0]!.messages[0]).toMatchObject({ role: "system", content: expect.stringContaining("TEST CURATION PROMPT") });
    expect(curationRequests[0]!.messages[1]!.content).toContain(SHOW_ID);
    expect(dataset.events[0]).toMatchObject({
      dontMiss: true,
      whyLine: "A touring act that rarely plays a room this small.",
      lastJudged: WEEK_1_ISO,
    });
    expect(report.curation).toEqual({ calls: 1, judged: 1, flagged: 1, problems: [], datedWhyLines: [] });
    expect(report.spend.totalUsd).toBeCloseTo(0.03);
  });
});

describe("what is sent for curation", () => {
  it("a recurring event and an unverified event are never sent; only the active one-off is judged", async () => {
    const unverified = candidate({ title: "Mystery Show", venue: null, venueEvidence: null });
    const { dataset, curationRequests } = await runAt(WEEK_1, emptyDataset(), [
      extracted(candidate(), tour, unverified),
      judging(0.02, { id: SHOW_ID, dontMiss: false, why: "" }),
    ]);

    expect(curationRequests).toHaveLength(1);
    const sent = curationRequests[0]!.messages[1]!.content;
    expect(sent).toContain(SHOW_ID);
    expect(sent).not.toContain("Gallery Tour");
    expect(sent).not.toContain("Mystery Show");
    expect(dataset.events.map((e) => [e.title, e.dontMiss, e.lastJudged])).toEqual([
      ["Big Show", false, WEEK_1_ISO],
      ["Gallery Tour", false, undefined],
      ["Mystery Show", false, undefined],
    ]);
  });

  it("an unchanged event is not re-judged: a second run over the same page makes zero curation calls", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate(), tour), judging(0.02, { id: SHOW_ID, dontMiss: true, why: "Why." })]);

    const second = await runAt(WEEK_2, first.dataset, [extracted(candidate(), tour)]);

    expect(second.curationCalls).toEqual([]);
    expect(second.report.curation).toEqual({ calls: 0, judged: 0, flagged: 0, problems: [], datedWhyLines: [] });
    expect(second.dataset.events[0]).toMatchObject({ dontMiss: true, whyLine: "Why.", lastJudged: WEEK_1_ISO, lastVerified: WEEK_2_ISO });
  });

  it("a date change causes a re-judge, and the new judgment replaces the old flag and why-line", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, dontMiss: true, why: "Why." })]);

    const second = await runAt(WEEK_2, first.dataset, [
      extracted(candidate({ startDate: "2026-11-07", dateEvidence: "Sat, Nov 7 · Show 8:00 PM" })),
      judging(0.02, { id: SHOW_ID, dontMiss: false, why: "" }),
    ]);

    expect(second.curationCalls).toHaveLength(1);
    expect(second.dataset.events[0]).toMatchObject({ dontMiss: false, lastChanged: WEEK_2_ISO, lastJudged: WEEK_2_ISO });
    expect(second.dataset.events[0]).not.toHaveProperty("whyLine");
  });

  it("a flagged one-off re-read as recurring loses its flag and why-line and is not judged again", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, dontMiss: true, why: "Why." })]);

    const second = await runAt(WEEK_2, first.dataset, [extracted(candidate({ startDate: null, startTime: null, schedule: "every Saturday", dateEvidence: "Big Show every Saturday" }))]);

    expect(second.curationCalls).toEqual([]);
    expect(second.dataset.events[0]).toMatchObject({ id: SHOW_ID, recurrence: "recurring", dontMiss: false });
    expect(second.dataset.events[0]).not.toHaveProperty("whyLine");
  });

  it("a judgment naming no event in the batch is reported, not silently dropped", async () => {
    const { dataset, report } = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: "evt_000000000000", dontMiss: true, why: "Why." })]);

    expect(dataset.events[0]).not.toHaveProperty("lastJudged");
    expect(report.curation.problems).toEqual([expect.stringContaining("named no event"), expect.stringContaining("not answered")]);
  });

  it("a flag with no why-line is not applied: the event is left unjudged, reported, and comes up again next run", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, dontMiss: true, why: "  " })]);
    expect(first.dataset.events[0]).toMatchObject({ dontMiss: false });
    expect(first.dataset.events[0]).not.toHaveProperty("lastJudged");
    expect(first.report.curation).toMatchObject({ calls: 1, judged: 0, problems: [expect.stringContaining("no why-line")] });

    const second = await runAt(WEEK_2, first.dataset, [extracted(candidate()), judging(0.02, { id: SHOW_ID, dontMiss: true, why: "Why." })]);
    expect(second.curationCalls).toHaveLength(1);
    expect(second.dataset.events[0]).toMatchObject({ dontMiss: true, whyLine: "Why.", lastJudged: WEEK_2_ISO });
  });
});

describe("curation and the spend cap", () => {
  it("a curation call counts against the cap, and once the cap is reached no curation call is made and the shortfall says so", async () => {
    const cut = await runAt(WEEK_1, emptyDataset(), [costing(0.05, candidate())], 0.05);

    expect(cut.curationCalls).toEqual([]);
    expect(cut.report.spend).toMatchObject({ capHit: true, shortfall: { eventsNotCurated: 1 } });
    expect(cut.dataset.events[0]).not.toHaveProperty("lastJudged");

    const next = await runAt(WEEK_2, cut.dataset, [extracted(candidate()), judging(0.02, { id: SHOW_ID, dontMiss: true, why: "Why." })]);
    expect(next.report.spend).toMatchObject({ totalUsd: 0.03, capHit: false });
    expect(next.dataset.events[0]).toMatchObject({ dontMiss: true, lastJudged: WEEK_2_ISO });
  });
});

describe("cleaning a why-line", () => {
  it("strips a trailing brace left over from the JSON around it", () => {
    expect(cleanWhyLine("In a church sanctuary rather than a large hall.}")).toBe("In a church sanctuary rather than a large hall.");
  });

  it.each([
    ['{"A rare visit."}', '"A rare visit."'],
    ['"A rare visit."}', '"A rare visit."'],
    ['{"A rare visit.', "A rare visit."],
    ['A rare visit."}', "A rare visit."],
    ['  A rare visit.", ', "A rare visit."],
    ['["A rare visit."]', '"A rare visit."'],
    ['[{"A rare visit."}],', '"A rare visit."'],
  ])("strips stray braces, brackets, commas and quotes from either end of %j", (raw, clean) => {
    expect(cleanWhyLine(raw)).toBe(clean);
  });

  it.each([
    'Plays the "Four Seasons" complete.',
    "A rare visit (their first since 2019).",
    "The program notes call it a premiere [sic].",
    '"Four Seasons" in full, and then "Winter" again',
    "Worth the drive!",
    '"Four Seasons" and "Winter"',
  ])("leaves %j unchanged", (line) => {
    expect(cleanWhyLine(line)).toBe(line);
  });

  it.each([
    ["Likely to bring John Cameron Mitchell to Kansas City in person.  .", "Likely to bring John Cameron Mitchell to Kansas City in person."],
    ["A rare visit. .", "A rare visit."],
    ["Worth the drive! .", "Worth the drive!"],
    ['A rare visit.  ."}', "A rare visit."],
    ["A rare  visit,   once.", "A rare visit, once."],
  ])("takes a doubled sentence end and doubled spaces out of %j", (raw, clean) => {
    expect(cleanWhyLine(raw)).toBe(clean);
  });

  it.each(["And then some...", "Two dates. One night.", "And then . . ."])("leaves the sentence's own end of %j alone", (line) => {
    expect(cleanWhyLine(line)).toBe(line);
  });

  it("cleans a line of nothing but punctuation to empty", () => {
    expect(cleanWhyLine(' }", ')).toBe("");
  });
});

/** The committed Modigliani Quartet why-line, with the brace the curation model left on it. */
const MODIGLIANI_WHY = "A string quartet of international standing playing a single Kansas City chamber-series date, in a church sanctuary rather than a large hall.";

describe("why-lines already stored", () => {
  it("every run cleans a stored why-line without a curation call, and the event does not count as changed or judged", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, dontMiss: true, why: "Why." })]);
    const stored = {
      ...first.dataset,
      events: first.dataset.events.map((e) => ({ ...e, whyLine: `${MODIGLIANI_WHY}}` })),
    };

    const second = await runAt(WEEK_2, stored, [extracted(candidate())]);

    expect(second.curationCalls).toEqual([]);
    expect(second.dataset.events[0]).toMatchObject({
      dontMiss: true,
      whyLine: MODIGLIANI_WHY,
      lastChanged: WEEK_1_ISO,
      lastJudged: WEEK_1_ISO,
    });
  });

  it("a stored flag whose why-line cleans to empty is no longer a flag", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, dontMiss: true, why: "Why." })]);
    const stored = { ...first.dataset, events: first.dataset.events.map((e) => ({ ...e, whyLine: '"}' })) };

    const second = await runAt(WEEK_2, stored, [extracted(candidate())]);

    expect(second.curationCalls).toEqual([]);
    expect(second.dataset.events[0]).toMatchObject({ dontMiss: false, lastJudged: WEEK_1_ISO });
    expect(second.dataset.events[0]).not.toHaveProperty("whyLine");
  });
});

describe("a judgment's why-line", () => {
  it("is cleaned before it is stored", async () => {
    const { dataset } = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, dontMiss: true, why: 'A rare visit."}' })]);

    expect(dataset.events[0]).toMatchObject({ dontMiss: true, whyLine: "A rare visit." });
  });

  it("that cleans to empty leaves the event unflagged", async () => {
    const { dataset, report } = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, dontMiss: true, why: ' }", ' })]);

    expect(dataset.events[0]).toMatchObject({ dontMiss: false });
    expect(dataset.events[0]).not.toHaveProperty("whyLine");
    expect(report.curation.problems).toEqual([expect.stringContaining("no why-line")]);
  });

  it("that cleans to empty, on a re-judge of a flagged event, takes the old flag away", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, dontMiss: true, why: "Why." })]);

    const second = await runAt(WEEK_2, first.dataset, [
      extracted(candidate({ startDate: "2026-11-07", dateEvidence: "Sat, Nov 7 · Show 8:00 PM" })),
      judging(0.02, { id: SHOW_ID, dontMiss: true, why: '"}' }),
    ]);

    expect(second.curationCalls).toHaveLength(1);
    expect(second.dataset.events[0]).toMatchObject({ dontMiss: false, lastChanged: WEEK_2_ISO, lastJudged: WEEK_1_ISO });
    expect(second.dataset.events[0]).not.toHaveProperty("whyLine");
  });
});

describe("what counts as a change for curation (#79)", () => {
  it("a start read with a time where it had none, or without one where it had one, is the same date: no re-judge", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate({ startTime: null })), judging(0.02, { id: SHOW_ID, dontMiss: true, why: "Why." })]);
    expect(first.dataset.events[0]!.start).toBe("2026-10-31");

    const timed = await runAt(WEEK_2, first.dataset, [extracted(candidate())]);
    expect(timed.dataset.events[0]!.start).toMatch(/^2026-10-31T20:00/);
    const untimed = await runAt(WEEK_2, timed.dataset, [extracted(candidate({ startTime: null }))]);

    expect([timed.curationCalls, untimed.curationCalls]).toEqual([[], []]);
    expect(untimed.dataset.events[0]).toMatchObject({ dontMiss: true, whyLine: "Why.", lastChanged: WEEK_1_ISO, lastJudged: WEEK_1_ISO });
  });

  it("a start whose time moves, both readings carrying one, is a change and is re-judged", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, dontMiss: true, why: "Why." })]);

    const second = await runAt(WEEK_2, first.dataset, [extracted(candidate({ startTime: "19:00" })), judging(0.02, { id: SHOW_ID, dontMiss: true, why: "Why." })]);

    expect(second.curationCalls).toHaveLength(1);
    expect(second.dataset.events[0]).toMatchObject({ lastChanged: WEEK_2_ISO, lastJudged: WEEK_2_ISO });
  });

  // A reading changes a known event's title past case and punctuation only when the title rules make
  // another form of a variant title (#217, ruledTitle), so this is held at markChanged itself.
  it("marks a retitled event changed, and not one whose title only changed case or punctuation", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, dontMiss: true, why: "Why." })]);
    const event = first.dataset.events[0]!;
    const marked = (title: string) => markChanged([event], [{ ...event, title }], WEEK_2_ISO)[0]!.lastChanged;

    expect(marked("Legacy Tour 2026")).toBe(WEEK_2_ISO);
    expect(marked("BIG SHOW!")).toBe(WEEK_1_ISO);
  });

  it("sends the event's description, so the model knows what an unfamiliar title is", async () => {
    const description = "The trio's only Midwest date, playing the 1972 album in full.";
    const { curationRequests } = await runAt(WEEK_1, emptyDataset(), [extracted(candidate({ description })), judging(0.02, { id: SHOW_ID, dontMiss: false, why: "" })]);

    const sent = JSON.parse(curationRequests[0]!.messages[1]!.content.slice(EVENTS_TO_JUDGE.length));
    expect(sent).toEqual([expect.objectContaining({ id: SHOW_ID, description })]);
  });
});

describe("a why-line that states its pick's end date (#234)", () => {
  const closing = candidate({ endDate: "2026-12-13", dateEvidence: "Oct 31 – Dec 13" });
  const judgedWith = (why: string) => runAt(WEEK_1, emptyDataset(), [extracted(closing), judging(0.02, { id: SHOW_ID, dontMiss: true, why })]);

  it.each([
    "A retrospective that closes December 13, its only stop in the region.",
    "A retrospective that closes Dec 13, its only stop in the region.",
    "A retrospective that closes Dec. 13, its only stop in the region.",
    "A retrospective that closes 13 December, its only stop in the region.",
    "A retrospective that closes December 13th, its only stop in the region.",
  ])("is named in the report, and the flag still stands: %s", async (why) => {
    const { dataset, report } = await judgedWith(why);

    expect(dataset.events[0]).toMatchObject({ id: SHOW_ID, end: expect.stringMatching(/^2026-12-13/), dontMiss: true, whyLine: why });
    expect(report.curation.datedWhyLines).toEqual([{ id: SHOW_ID, title: "Big Show", primaryUrl: CALENDAR_URL, whyLine: why }]);
  });

  it.each(["A retrospective on its only stop in the region.", "A retrospective that opened December 1, its only stop here.", "Closing Dec 130 is no date."])(
    "is not named when the line gives no date, or another day: %s",
    async (why) => {
      const { report } = await judgedWith(why);

      expect(report.curation.datedWhyLines).toEqual([]);
    },
  );

  it("is not named for a pick with no end date", async () => {
    const { dataset, report } = await runAt(WEEK_1, emptyDataset(), [
      extracted(candidate()),
      judging(0.02, { id: SHOW_ID, dontMiss: true, why: "A touring act's one night here, October 31." }),
    ]);

    expect(dataset.events[0]).not.toHaveProperty("end");
    expect(report.curation.datedWhyLines).toEqual([]);
  });
});

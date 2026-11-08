import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { cleanWhyLine, EVENTS_TO_JUDGE, markChanged, withLaterJudgment } from "../src/curation.js";
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
async function runAt(now: Date, dataset: Dataset, [extraction, curation]: [CompletionResult, CompletionResult?], spendCapUsd = 5, curationPrompt = testPrompts().curationPrompt) {
  const fakes = fakePorts(now, { pages: { [CALENDAR_URL]: PAGE }, completions: [extraction], curations: curation ? [curation] : [] });
  const result = await run({ config: testConfig({ spendCapUsd }), prompts: { ...testPrompts(), curationPrompt }, dataset, registry: { sources: [recordbar] }, ports: fakes.ports });
  expect(parseDataset(result.dataset)).toEqual(result.dataset);
  const curationCalls = fakes.calls.filter((c) => c === "model:test/curation");
  const curationRequests = fakes.requests.filter((r) => r.model === "test/curation");
  return { ...result, calls: fakes.calls, curationCalls, curationRequests };
}

describe("don't-miss curation", () => {
  it("a new one-off is judged with the curation prompt, and its flag and why-line are stored", async () => {
    const { dataset, report, curationRequests } = await runAt(WEEK_1, emptyDataset(), [
      extracted(candidate()),
      judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "A touring act that rarely plays a room this small." }),
    ]);

    expect(curationRequests).toHaveLength(1);
    expect(curationRequests[0]!.messages[0]).toMatchObject({ role: "system", content: expect.stringContaining("TEST CURATION PROMPT") });
    expect(curationRequests[0]!.messages[1]!.content).toContain(SHOW_ID);
    expect(dataset.events[0]).toMatchObject({
      dontMiss: true,
      whyLine: "A touring act that rarely plays a room this small.",
      lastJudged: WEEK_1_ISO,
    });
    expect(report.curation).toEqual({ calls: 1, judged: 1, flagged: 1, close: 0, rejudgedForPrompt: 0, problems: [], datedWhyLines: [], handPicks: { applied: 0, stale: [], changed: [] } });
    expect(report.spend.totalUsd).toBeCloseTo(0.03);
  });
});

describe("how a batch is formed", () => {
  it("batches are formed by kind, then date, with an undated event last in its kind, and the second batch continues the order", async () => {
    // 27 one-offs of the test config's two kinds in a scrambled order, so the two batches cut across a kind.
    const kinds = ["music", "other"];
    const candidates = Array.from({ length: 27 }, (_, i) => {
      const day = String(1 + ((i * 7) % 27)).padStart(2, "0");
      return candidate({ title: `Show ${i}`, kind: kinds[i % 2], startDate: `2026-11-${day}`, dateEvidence: `Nov ${day} · Show 8:00 PM` });
    });
    const undatedIndex = 5; // an "other" with no start
    candidates[undatedIndex] = candidate({ title: "Show 5", kind: "other", startDate: null, startTime: null, endDate: "2026-11-30", dateEvidence: "Through Nov 30" });

    const { curationRequests, dataset } = await runAt(WEEK_1, emptyDataset(), [extracted(...candidates)]);

    expect(curationRequests).toHaveLength(2);
    const sentIds = curationRequests.flatMap((r) => (JSON.parse(r.messages[1]!.content.split(`${EVENTS_TO_JUDGE}\n\n`)[1]!) as { id: string }[]).map((e) => e.id));
    const byId = new Map(dataset.events.map((e) => [e.id, e]));
    const sent = sentIds.map((id) => byId.get(id)!);
    const expected = [...sent].sort((a, b) => a.kind.localeCompare(b.kind) || (a.start ?? "￿").localeCompare(b.start ?? "￿") || a.id.localeCompare(b.id));
    expect(sent.map((e) => `${e.kind} ${e.start ?? "undated"}`)).toEqual(expected.map((e) => `${e.kind} ${e.start ?? "undated"}`));
    expect(sentIds.slice(0, 25)).toHaveLength(25);
    expect(sent.filter((e) => e.kind === "other").at(-1)!.start).toBeUndefined();
    expect(sent.filter((e) => e.kind === "music")).toHaveLength(14);
  });
});

describe("picks with reasons, close calls and nos (ADR 0014)", () => {
  const second = candidate({ title: "Second Show", startDate: "2026-11-01", dateEvidence: "Sun, Nov 1 · Show 8:00 PM" });
  const third = candidate({ title: "Third Show", startDate: "2026-11-02", dateEvidence: "Mon, Nov 2 · Show 8:00 PM" });
  const SECOND_ID = newEventId(CALENDAR_URL, "Second Show", WEEK_1_ISO, "2026-11-01");
  const THIRD_ID = newEventId(CALENDAR_URL, "Third Show", WEEK_1_ISO, "2026-11-02");
  const byId = (events: { id: string }[], id: string) => events.find((e) => e.id === id)!;

  it("a pick is stored with its reason and why-line; a close call with its note; a no with neither", async () => {
    const { dataset, report } = await runAt(WEEK_1, emptyDataset(), [
      extracted(candidate(), second, third),
      judging(
        0.02,
        { id: SHOW_ID, verdict: "pick", reason: "tradition", why: "The city's one holiday market with a season to it." },
        { id: SECOND_ID, verdict: "close", reason: "none", why: "Nearly an occasion, but the page gives no sense of its size." },
        { id: THIRD_ID, verdict: "no", reason: "none", why: "" },
      ),
    ]);

    expect(byId(dataset.events, SHOW_ID)).toMatchObject({ dontMiss: true, pickReason: "tradition", whyLine: "The city's one holiday market with a season to it." });
    expect(byId(dataset.events, SHOW_ID)).not.toHaveProperty("closeCall");
    expect(byId(dataset.events, SECOND_ID)).toMatchObject({ dontMiss: false, closeCall: true, closeNote: "Nearly an occasion, but the page gives no sense of its size." });
    expect(byId(dataset.events, SECOND_ID)).not.toHaveProperty("pickReason");
    expect(byId(dataset.events, THIRD_ID)).toMatchObject({ dontMiss: false, lastJudged: WEEK_1_ISO });
    expect(byId(dataset.events, THIRD_ID)).not.toHaveProperty("closeCall");
    expect(byId(dataset.events, THIRD_ID)).not.toHaveProperty("closeNote");
    expect(report.curation).toMatchObject({ judged: 3, flagged: 1, close: 1 });
  });

  it("a pick with reason none, or a close with no note, is left unjudged and reported; the rest of the batch applies", async () => {
    const { dataset, report } = await runAt(WEEK_1, emptyDataset(), [
      extracted(candidate(), second, third),
      judging(
        0.02,
        { id: SHOW_ID, verdict: "pick", reason: "none", why: "A reason with no name." },
        { id: SECOND_ID, verdict: "close", reason: "none", why: "  " },
        { id: THIRD_ID, verdict: "pick", reason: "unusual", why: "Theater staged in a cemetery at sunset." },
      ),
    ]);

    expect(byId(dataset.events, SHOW_ID)).toMatchObject({ dontMiss: false });
    expect(byId(dataset.events, SHOW_ID)).not.toHaveProperty("lastJudged");
    expect(byId(dataset.events, SECOND_ID)).not.toHaveProperty("lastJudged");
    expect(byId(dataset.events, SECOND_ID)).not.toHaveProperty("closeCall");
    expect(byId(dataset.events, THIRD_ID)).toMatchObject({ dontMiss: true, pickReason: "unusual" });
    expect(report.curation).toMatchObject({
      judged: 1,
      flagged: 1,
      problems: [expect.stringContaining('"Big Show" was picked with no reason'), expect.stringContaining('"Second Show" was a close call with no note')],
    });
  });

  it("a re-judgment that says no clears a stored close call and its note", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "close", reason: "none", why: "Nearly rare." })]);
    expect(first.dataset.events[0]).toMatchObject({ closeCall: true, closeNote: "Nearly rare." });

    const next = await runAt(WEEK_2, first.dataset, [
      extracted(candidate({ startDate: "2026-11-07", dateEvidence: "Sat, Nov 7 · Show 8:00 PM" })),
      judging(0.02, { id: SHOW_ID, verdict: "no", reason: "none", why: "" }),
    ]);

    expect(next.dataset.events[0]).toMatchObject({ dontMiss: false, lastJudged: WEEK_2_ISO });
    expect(next.dataset.events[0]).not.toHaveProperty("closeCall");
    expect(next.dataset.events[0]).not.toHaveProperty("closeNote");
  });

  it("a reading that makes a close call recurring drops the close call as it drops a flag", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "close", reason: "none", why: "Nearly rare." })]);

    const next = await runAt(WEEK_2, first.dataset, [extracted(candidate({ startDate: null, startTime: null, schedule: "every Saturday", dateEvidence: "Big Show every Saturday" }))]);

    expect(next.curationCalls).toEqual([]);
    expect(next.dataset.events[0]).toMatchObject({ recurrence: "recurring", dontMiss: false });
    expect(next.dataset.events[0]).not.toHaveProperty("closeCall");
    expect(next.dataset.events[0]).not.toHaveProperty("closeNote");
  });

  it("a fold keeps the later judgment, reason and close call included", () => {
    const base = { ...emptyDataset().events[0], recurrence: "one-off" as const };
    const earlierPick = { ...base, dontMiss: true, pickReason: "rare" as const, whyLine: "Rare.", lastJudged: WEEK_1_ISO, judgedWith: "abcdefabcdef" };
    const laterClose = { ...base, dontMiss: false, closeCall: true as const, closeNote: "Nearly.", lastJudged: WEEK_2_ISO, judgedWith: "abcdefabcdef" };

    const kept = withLaterJudgment(earlierPick as never, laterClose as never);
    expect(kept).toMatchObject({ dontMiss: false, closeCall: true, closeNote: "Nearly.", lastJudged: WEEK_2_ISO });
    expect(kept).not.toHaveProperty("pickReason");
    expect(kept).not.toHaveProperty("whyLine");

    const back = withLaterJudgment(laterClose as never, { ...earlierPick, lastJudged: "2026-10-20T06:00:00-05:00" } as never);
    expect(back).toMatchObject({ dontMiss: true, pickReason: "rare", whyLine: "Rare." });
    expect(back).not.toHaveProperty("closeCall");
  });

  it("a stored pick whose why-line cleans to empty loses its flag and its reason, and a stored close note is cleaned too", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate(), second), judging(0.02,
      { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." },
      { id: SECOND_ID, verdict: "close", reason: "none", why: "Nearly." },
    )]);
    const stored = {
      ...first.dataset,
      events: first.dataset.events.map((e) => (e.id === SHOW_ID ? { ...e, whyLine: '"}' } : { ...e, closeNote: "Nearly.}" })),
    };

    const next = await runAt(WEEK_2, stored, [extracted(candidate(), second)]);

    expect(next.curationCalls).toEqual([]);
    expect(byId(next.dataset.events, SHOW_ID)).toMatchObject({ dontMiss: false, lastJudged: WEEK_1_ISO });
    expect(byId(next.dataset.events, SHOW_ID)).not.toHaveProperty("pickReason");
    expect(byId(next.dataset.events, SECOND_ID)).toMatchObject({ closeCall: true, closeNote: "Nearly." });
  });
});

describe("what is sent for curation", () => {
  it("a recurring event and an unverified event are never sent; only the active one-off is judged", async () => {
    const unverified = candidate({ title: "Mystery Show", venue: null, venueEvidence: null });
    const { dataset, curationRequests } = await runAt(WEEK_1, emptyDataset(), [
      extracted(candidate(), tour, unverified),
      judging(0.02, { id: SHOW_ID, verdict: "no", reason: "none", why: "" }),
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
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate(), tour), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." })]);

    const second = await runAt(WEEK_2, first.dataset, [extracted(candidate(), tour)]);

    expect(second.curationCalls).toEqual([]);
    expect(second.report.curation).toEqual({ calls: 0, judged: 0, flagged: 0, close: 0, rejudgedForPrompt: 0, problems: [], datedWhyLines: [], handPicks: { applied: 0, stale: [], changed: [] } });
    expect(second.dataset.events[0]).toMatchObject({ dontMiss: true, whyLine: "Why.", lastJudged: WEEK_1_ISO, lastVerified: WEEK_2_ISO });
  });

  it("a date change causes a re-judge, and the new judgment replaces the old flag and why-line", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." })]);

    const second = await runAt(WEEK_2, first.dataset, [
      extracted(candidate({ startDate: "2026-11-07", dateEvidence: "Sat, Nov 7 · Show 8:00 PM" })),
      judging(0.02, { id: SHOW_ID, verdict: "no", reason: "none", why: "" }),
    ]);

    expect(second.curationCalls).toHaveLength(1);
    expect(second.dataset.events[0]).toMatchObject({ dontMiss: false, lastChanged: WEEK_2_ISO, lastJudged: WEEK_2_ISO });
    expect(second.dataset.events[0]).not.toHaveProperty("whyLine");
  });

  it("a flagged one-off re-read as recurring loses its flag and why-line and is not judged again", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." })]);

    const second = await runAt(WEEK_2, first.dataset, [extracted(candidate({ startDate: null, startTime: null, schedule: "every Saturday", dateEvidence: "Big Show every Saturday" }))]);

    expect(second.curationCalls).toEqual([]);
    expect(second.dataset.events[0]).toMatchObject({ id: SHOW_ID, recurrence: "recurring", dontMiss: false });
    expect(second.dataset.events[0]).not.toHaveProperty("whyLine");
  });

  it("a judgment naming no event in the batch is reported, not silently dropped", async () => {
    const { dataset, report } = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: "evt_000000000000", verdict: "pick", reason: "rare", why: "Why." })]);

    expect(dataset.events[0]).not.toHaveProperty("lastJudged");
    expect(report.curation.problems).toEqual([expect.stringContaining("named no event"), expect.stringContaining("not answered")]);
  });

  it("a flag with no why-line is not applied: the event is left unjudged, reported, and comes up again next run", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "  " })]);
    expect(first.dataset.events[0]).toMatchObject({ dontMiss: false });
    expect(first.dataset.events[0]).not.toHaveProperty("lastJudged");
    expect(first.report.curation).toMatchObject({ calls: 1, judged: 0, problems: [expect.stringContaining("no why-line")] });

    const second = await runAt(WEEK_2, first.dataset, [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." })]);
    expect(second.curationCalls).toHaveLength(1);
    expect(second.dataset.events[0]).toMatchObject({ dontMiss: true, whyLine: "Why.", lastJudged: WEEK_2_ISO });
  });
});

describe("the prompt a judgment was made under (#256)", () => {
  const REVISED = "TEST CURATION PROMPT, revised";
  const flaggedFirst = () => runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." })]);

  it("stamps a judgment with the curation prompt's hash: the first 12 hex digits of its sha256", async () => {
    const { dataset } = await flaggedFirst();

    // sha256("TEST CURATION PROMPT"), computed outside the code under test.
    expect(dataset.events[0]).toMatchObject({ lastJudged: WEEK_1_ISO, judgedWith: "f4a91bd160cd" });
  });

  it("an unchanged event judged under an earlier prompt is judged again, and the report counts it", async () => {
    const first = await flaggedFirst();

    const second = await runAt(WEEK_2, first.dataset, [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "no", reason: "none", why: "" })], 5, REVISED);

    expect(second.curationRequests[0]!.messages[0]!.content).toContain(REVISED);
    expect(second.dataset.events[0]).toMatchObject({ dontMiss: false, lastChanged: WEEK_1_ISO, lastJudged: WEEK_2_ISO });
    expect(second.dataset.events[0]!.judgedWith).not.toBe(first.dataset.events[0]!.judgedWith);
    expect(second.report.curation).toMatchObject({ calls: 1, judged: 1, rejudgedForPrompt: 1 });
  });

  it("an event judged before judgments carried a prompt hash is judged again", async () => {
    const first = await flaggedFirst();
    const { judgedWith: _, ...unstamped } = first.dataset.events[0]!;

    const second = await runAt(WEEK_2, { ...first.dataset, events: [unstamped] }, [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." })]);

    expect(second.curationCalls).toHaveLength(1);
    expect(second.dataset.events[0]).toMatchObject({ lastJudged: WEEK_2_ISO, judgedWith: "f4a91bd160cd" });
    expect(second.report.curation.rejudgedForPrompt).toBe(1);
  });

  it("an event judged under the current prompt is not judged again, and a re-judge for a change is not counted as one for the prompt", async () => {
    const first = await flaggedFirst();

    const same = await runAt(WEEK_2, first.dataset, [extracted(candidate())]);
    const moved = await runAt(WEEK_2, first.dataset, [
      extracted(candidate({ startDate: "2026-11-07", dateEvidence: "Sat, Nov 7 · Show 8:00 PM" })),
      judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." }),
    ], 5, REVISED);

    expect(same.curationCalls).toEqual([]);
    expect(same.report.curation.rejudgedForPrompt).toBe(0);
    expect(moved.report.curation).toMatchObject({ judged: 1, rejudgedForPrompt: 0 });
  });
});

describe("curation and the spend cap", () => {
  it("a curation call counts against the cap, and once the cap is reached no curation call is made and the shortfall says so", async () => {
    const cut = await runAt(WEEK_1, emptyDataset(), [costing(0.05, candidate())], 0.05);

    expect(cut.curationCalls).toEqual([]);
    expect(cut.report.spend).toMatchObject({ capHit: true, shortfall: { eventsNotCurated: 1 } });
    expect(cut.dataset.events[0]).not.toHaveProperty("lastJudged");

    const next = await runAt(WEEK_2, cut.dataset, [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." })]);
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
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." })]);
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
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." })]);
    const stored = { ...first.dataset, events: first.dataset.events.map((e) => ({ ...e, whyLine: '"}' })) };

    const second = await runAt(WEEK_2, stored, [extracted(candidate())]);

    expect(second.curationCalls).toEqual([]);
    expect(second.dataset.events[0]).toMatchObject({ dontMiss: false, lastJudged: WEEK_1_ISO });
    expect(second.dataset.events[0]).not.toHaveProperty("whyLine");
  });
});

describe("a judgment's why-line", () => {
  it("is cleaned before it is stored", async () => {
    const { dataset } = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: 'A rare visit."}' })]);

    expect(dataset.events[0]).toMatchObject({ dontMiss: true, whyLine: "A rare visit." });
  });

  it("that cleans to empty leaves the event unflagged", async () => {
    const { dataset, report } = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: ' }", ' })]);

    expect(dataset.events[0]).toMatchObject({ dontMiss: false });
    expect(dataset.events[0]).not.toHaveProperty("whyLine");
    expect(report.curation.problems).toEqual([expect.stringContaining("no why-line")]);
  });

  it("that cleans to empty, on a re-judge of a flagged event, takes the old flag away", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." })]);

    const second = await runAt(WEEK_2, first.dataset, [
      extracted(candidate({ startDate: "2026-11-07", dateEvidence: "Sat, Nov 7 · Show 8:00 PM" })),
      judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: '"}' }),
    ]);

    expect(second.curationCalls).toHaveLength(1);
    expect(second.dataset.events[0]).toMatchObject({ dontMiss: false, lastChanged: WEEK_2_ISO, lastJudged: WEEK_1_ISO });
    expect(second.dataset.events[0]).not.toHaveProperty("whyLine");
  });
});

describe("what counts as a change for curation (#79)", () => {
  it("a start read with a time where it had none, or without one where it had one, is the same date: no re-judge", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate({ startTime: null })), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." })]);
    expect(first.dataset.events[0]!.start).toBe("2026-10-31");

    const timed = await runAt(WEEK_2, first.dataset, [extracted(candidate())]);
    expect(timed.dataset.events[0]!.start).toMatch(/^2026-10-31T20:00/);
    const untimed = await runAt(WEEK_2, timed.dataset, [extracted(candidate({ startTime: null }))]);

    expect([timed.curationCalls, untimed.curationCalls]).toEqual([[], []]);
    expect(untimed.dataset.events[0]).toMatchObject({ dontMiss: true, whyLine: "Why.", lastChanged: WEEK_1_ISO, lastJudged: WEEK_1_ISO });
  });

  it("a start whose time moves, both readings carrying one, is a change and is re-judged", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." })]);

    const second = await runAt(WEEK_2, first.dataset, [extracted(candidate({ startTime: "19:00" })), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." })]);

    expect(second.curationCalls).toHaveLength(1);
    expect(second.dataset.events[0]).toMatchObject({ lastChanged: WEEK_2_ISO, lastJudged: WEEK_2_ISO });
  });

  // A reading changes a known event's title past case and punctuation only when the title rules make
  // another form of a variant title (#217, ruledTitle), so this is held at markChanged itself.
  it("marks a retitled event changed, and not one whose title only changed case or punctuation", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate()), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "Why." })]);
    const event = first.dataset.events[0]!;
    const marked = (title: string) => markChanged([event], [{ ...event, title }], WEEK_2_ISO)[0]!.lastChanged;

    expect(marked("Legacy Tour 2026")).toBe(WEEK_2_ISO);
    expect(marked("BIG SHOW!")).toBe(WEEK_1_ISO);
  });

  it("sends the event's description, so the model knows what an unfamiliar title is", async () => {
    const description = "The trio's only Midwest date, playing the 1972 album in full.";
    const { curationRequests } = await runAt(WEEK_1, emptyDataset(), [extracted(candidate({ description })), judging(0.02, { id: SHOW_ID, verdict: "no", reason: "none", why: "" })]);

    const sent = JSON.parse(curationRequests[0]!.messages[1]!.content.slice(EVENTS_TO_JUDGE.length));
    expect(sent).toEqual([expect.objectContaining({ id: SHOW_ID, description })]);
  });
});

describe("a why-line that states its pick's end date (#234)", () => {
  const closing = candidate({ endDate: "2026-12-13", dateEvidence: "Oct 31 – Dec 13" });
  const judgedWith = (why: string) => runAt(WEEK_1, emptyDataset(), [extracted(closing), judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why })]);

  it.each([
    "A retrospective that closes December 13, its only stop in the region.",
    "A retrospective that closes Dec 13, its only stop in the region.",
    "A retrospective that closes Dec. 13, its only stop in the region.",
    "A retrospective that closes 13 December, its only stop in the region.",
    "A retrospective that closes December 13th, its only stop in the region.",
    "A retrospective on view December 1–13, its only stop in the region.",
    "A retrospective on view Dec. 1 through 13, its only stop in the region.",
  ])("is named in the report, and the flag still stands: %s", async (why) => {
    const { dataset, report } = await judgedWith(why);

    expect(dataset.events[0]).toMatchObject({ id: SHOW_ID, end: expect.stringMatching(/^2026-12-13/), dontMiss: true, whyLine: why });
    expect(report.curation.datedWhyLines).toEqual([{ id: SHOW_ID, title: "Big Show", primaryUrl: CALENDAR_URL, whyLine: why }]);
  });

  it.each(["A retrospective on its only stop in the region.", "A retrospective that opened December 1, its only stop here.", "Closing Dec 130 is no date.", "Its last show is Dec 1 – 13 p.m. on the dot."])(
    "is not named when the line gives no date, or another day: %s",
    async (why) => {
      const { report } = await judgedWith(why);

      expect(report.curation.datedWhyLines).toEqual([]);
    },
  );

  it("is not named for a pick with no end date", async () => {
    const { dataset, report } = await runAt(WEEK_1, emptyDataset(), [
      extracted(candidate()),
      judging(0.02, { id: SHOW_ID, verdict: "pick", reason: "rare", why: "A touring act's one night here, October 31." }),
    ]);

    expect(dataset.events[0]).not.toHaveProperty("end");
    expect(report.curation.datedWhyLines).toEqual([]);
  });
});

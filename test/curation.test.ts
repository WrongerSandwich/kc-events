import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
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
const SHOW_ID = newEventId(CALENDAR_URL, "Big Show", WEEK_1_ISO);
const trivia = candidate({ title: "Trivia", startDate: null, startTime: null, schedule: "every Tuesday", dateEvidence: "Trivia every Tuesday" });

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
    expect(report.curation).toEqual({ calls: 1, judged: 1, flagged: 1, problems: [] });
    expect(report.spend.totalUsd).toBeCloseTo(0.03);
  });
});

describe("what is sent for curation", () => {
  it("a recurring event and an unverified event are never sent; only the active one-off is judged", async () => {
    const unverified = candidate({ title: "Mystery Show", venue: null, venueEvidence: null });
    const { dataset, curationRequests } = await runAt(WEEK_1, emptyDataset(), [
      extracted(candidate(), trivia, unverified),
      judging(0.02, { id: SHOW_ID, dontMiss: false, why: "" }),
    ]);

    expect(curationRequests).toHaveLength(1);
    const sent = curationRequests[0]!.messages[1]!.content;
    expect(sent).toContain(SHOW_ID);
    expect(sent).not.toContain("Trivia");
    expect(sent).not.toContain("Mystery Show");
    expect(dataset.events.map((e) => [e.title, e.dontMiss, e.lastJudged])).toEqual([
      ["Big Show", false, WEEK_1_ISO],
      ["Trivia", false, undefined],
      ["Mystery Show", false, undefined],
    ]);
  });

  it("an unchanged event is not re-judged: a second run over the same page makes zero curation calls", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [extracted(candidate(), trivia), judging(0.02, { id: SHOW_ID, dontMiss: true, why: "Why." })]);

    const second = await runAt(WEEK_2, first.dataset, [extracted(candidate(), trivia)]);

    expect(second.curationCalls).toEqual([]);
    expect(second.report.curation).toEqual({ calls: 0, judged: 0, flagged: 0, problems: [] });
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

import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, parseDataset } from "../src/dataset.js";
import { newEventId } from "../src/extraction.js";
import { renderReportMarkdown } from "../src/report.js";
import { fakePorts } from "./fakes/ports.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { candidateAt, costing, judging, PAGE, source, WEEK_1, WEEK_1_ISO } from "./fakes/fixtures.js";

const recordBar = source("recordBar", { neighborhood: "Crossroads" });
const CALENDAR_URL = recordBar.urls[0]!;
const candidate = (overrides: Record<string, unknown> = {}) => candidateAt(recordBar, overrides);

async function runOver(candidates: unknown[], curations = [judging(0.01)]) {
  const fakes = fakePorts(WEEK_1, { pages: { [CALENDAR_URL]: PAGE }, completions: [costing(0.01, ...candidates)], curations });
  const result = await run({ config: testConfig(), prompts: testPrompts(), dataset: emptyDataset(), registry: { sources: [recordBar] }, ports: fakes.ports });
  expect(parseDataset(result.dataset)).toEqual(result.dataset);
  return result;
}

describe("dates and times the model wrote that do not exist", () => {
  it.each([
    ["a start date that rolls over", { startDate: "2026-02-30" }, '"2026-02-30" is not a real date'],
    ["an end date that rolls over", { endDate: "2026-11-31" }, '"2026-11-31" is not a real date'],
    ["hour 24", { startTime: "24:00" }, '"24:00" is not a real time'],
    ["hour 25", { startTime: "25:30" }, '"25:30" is not a real time'],
    ["minute 60", { startTime: "20:60" }, '"20:60" is not a real time'],
    ["an end before the start", { endDate: "2026-10-30" }, "an end (2026-10-30) before its start"],
  ])("%s makes the candidate uncitable, reported on its source and counted", async (_, overrides, problem) => {
    const { dataset, report } = await runOver([candidate(overrides)]);

    expect(dataset.events).toHaveLength(1);
    expect(dataset.events[0]!.status).toBe("unverified");
    expect(report.counts.unusableDates).toBe(1);
    expect(report.sources[0]!.detail).toContain(problem);
    expect(renderReportMarkdown(report)).toContain("| Uncitable: a date or time that does not exist, or an end before the start | 1 |");
  });

  it("an end before the start is not stored", async () => {
    const { dataset } = await runOver([candidate({ endDate: "2026-10-30" })]);

    expect(dataset.events[0]).toMatchObject({ start: "2026-10-31T20:00:00-05:00" });
    expect(dataset.events[0]).not.toHaveProperty("end");
  });

  it("a date that exists, an empty time, and an end later on the start's day are fine", async () => {
    const { dataset, report } = await runOver([
      candidate({ title: "Leap", startDate: "2028-02-29", startTime: "", dateEvidence: "Feb 29" }),
      candidate({ title: "Late Set", startTime: "23:59", endDate: "2026-10-31", endTime: "23:00" }),
      candidate({ title: "Early Set", startTime: "8:30" }),
    ]);

    expect(dataset.events.map((e) => e.status)).toEqual(["active", "active", "active"]);
    expect(dataset.events[0]!.start).toBe("2028-02-29");
    expect(dataset.events[2]!.start).toBe("2026-10-31T08:30:00-05:00");
    expect(report.counts.unusableDates).toBe(0);
  });
});

describe("length caps on what the model writes", () => {
  it.each([
    ["title", 201],
    ["venue", 151],
    ["description", 301],
    ["dateEvidence", 501],
    ["venueEvidence", 501],
    ["schedule", 201],
  ])("a candidate whose %s runs past the cap is dropped, reported and counted", async (field, length) => {
    const { dataset, report } = await runOver([candidate({ title: "Runaway", [field]: "x".repeat(length) }), candidate()]);

    expect(dataset.events.map((e) => e.title)).toEqual(["Big Show"]);
    expect(report.counts.overCap).toBe(1);
    expect(report.sources[0]!.detail).toContain(`ran past the ${length - 1}-character cap on ${field}`);
    expect(renderReportMarkdown(report)).toContain("| Dropped: a field past its length cap | 1 |");
  });

  it("a candidate at the caps is kept", async () => {
    const { dataset, report } = await runOver([candidate({ title: "x".repeat(200), venue: "v".repeat(150), description: "d".repeat(300) })]);

    expect(dataset.events).toHaveLength(1);
    expect(report.counts.overCap).toBe(0);
  });

  it("a flag whose why-line runs past 200 characters is not applied: left unjudged and reported", async () => {
    const id = newEventId(CALENDAR_URL, "Big Show", WEEK_1_ISO);
    const { dataset, report } = await runOver([candidate()], [judging(0.01, { id, dontMiss: true, why: "w".repeat(201) })]);

    expect(dataset.events[0]).toMatchObject({ dontMiss: false });
    expect(dataset.events[0]).not.toHaveProperty("lastJudged");
    expect(report.curation.judged).toBe(0);
    expect(report.curation.problems).toContain('"Big Show" was flagged with a why-line past the 200-character cap and was left unjudged');
  });
});

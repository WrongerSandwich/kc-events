import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, parseDataset, type Dataset } from "../src/dataset.js";
import { renderReportMarkdown } from "../src/report.js";
import { fakePorts } from "./fakes/ports.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { candidateAt, costing, PAGE, source, WEEK_1, WEEK_2 } from "./fakes/fixtures.js";

// #104: the report's unmappable neighborhoods come from the records as the run ends, and repeat nothing the last report listed.
const recordBar = source("recordBar", { neighborhood: "Crossroads" });
const CALENDAR_URL = recordBar.urls[0]!;
const candidate = (overrides: Record<string, unknown> = {}) => candidateAt(recordBar, overrides);
const olathe = (overrides: Record<string, unknown> = {}) =>
  candidate({ title: "Suburban Show", venue: "Some Hall", venueEvidence: "Some Hall, 123 Main St, Olathe", neighborhood: "Olathe", ...overrides });

async function runOver(candidates: unknown[], { dataset = emptyDataset(), now = WEEK_1 }: { dataset?: Dataset; now?: Date } = {}) {
  const fakes = fakePorts(now, { pages: { [CALENDAR_URL]: PAGE }, completions: [costing(0.01, ...candidates)] });
  const result = await run({ config: testConfig(), prompts: testPrompts(), dataset, registry: { sources: [recordBar] }, ports: fakes.ports });
  expect(parseDataset(result.dataset)).toEqual(result.dataset);
  return result;
}

describe("unmappable neighborhoods in the run report", () => {
  it("a reading in the catch-all that does not reach the stored record, placed by another reading, is not listed", async () => {
    // The page lists the film twice, once at the museum and once at its cinema with no neighborhood (the Tivoli films, 10-12):
    // the first verified reading stands, so the record ends the run placed.
    const { dataset, report } = await runOver([
      candidate({ title: "Coco", venue: "The Museum", venueEvidence: "The Museum", neighborhood: "Crossroads" }),
      candidate({ title: "Coco", venue: "Tivoli Cinema", venueEvidence: "Tivoli Cinema", neighborhood: null }),
    ]);

    expect(dataset.events.map((e) => [e.title, e.neighborhood])).toEqual([["Coco", "Crossroads"]]);
    expect(report.unmappableNeighborhoods).toEqual([]);
  });

  it("the first run, with no record before it, lists every record in the catch-all with what the extractor proposed", async () => {
    const { dataset, report } = await runOver([olathe(), candidate({ title: "Nowhere Show", neighborhood: null })]);

    expect(dataset.events.map((e) => e.proposedNeighborhood)).toEqual(["Olathe", undefined]);
    expect(report.unmappableNeighborhoods).toEqual([
      { eventId: dataset.events[0]!.id, eventTitle: "Suburban Show", venue: "Some Hall", proposed: "Olathe", listedBefore: false },
      { eventId: dataset.events[1]!.id, eventTitle: "Nowhere Show", venue: "recordBar", listedBefore: false },
    ]);
    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain("2 events end the run in the catch-all, none of them listed in an earlier report.");
    expect(markdown).toContain('- Suburban Show at Some Hall: the extractor proposed "Olathe"');
    expect(markdown).toContain("- Nowhere Show at recordBar: no neighborhood proposed");
  });

  it("a record still in the catch-all with the same proposal is counted, not listed again", async () => {
    const first = await runOver([olathe(), candidate({ title: "Nowhere Show", neighborhood: null })]);
    // The second run reads only the Olathe show; the other record is not sighted and stays as it was.
    const { report } = await runOver([olathe()], { dataset: first.dataset, now: WEEK_2 });

    expect(report.unmappableNeighborhoods.map((u) => [u.eventTitle, u.listedBefore])).toEqual([
      ["Suburban Show", true],
      ["Nowhere Show", true],
    ]);
    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain("2 events end the run in the catch-all, all of them listed in an earlier report.");
    expect(markdown).not.toContain("- Suburban Show at Some Hall");
  });

  it("a record whose proposal changed, or that comes back to the catch-all after being placed, is listed again", async () => {
    const first = await runOver([olathe(), candidate({ title: "Placed Show", neighborhood: "Westport" })]);
    const { report } = await runOver([olathe({ neighborhood: "Lenexa" }), candidate({ title: "Placed Show", neighborhood: "Blue Springs" })], {
      dataset: first.dataset,
      now: WEEK_2,
    });

    expect(report.unmappableNeighborhoods.map((u) => [u.eventTitle, u.proposed, u.listedBefore])).toEqual([
      ["Suburban Show", "Lenexa", false],
      ["Placed Show", "Blue Springs", false],
    ]);
    expect(renderReportMarkdown(report)).toContain('- Suburban Show at Some Hall: the extractor proposed "Lenexa"');
  });

  it("a record that leaves the catch-all drops its proposal and is not listed", async () => {
    const first = await runOver([olathe()]);
    const { dataset, report } = await runOver([olathe({ neighborhood: "Westport" })], { dataset: first.dataset, now: WEEK_2 });

    expect(dataset.events[0]).toMatchObject({ neighborhood: "Westport" });
    expect(dataset.events[0]).not.toHaveProperty("proposedNeighborhood");
    expect(report.unmappableNeighborhoods).toEqual([]);
  });

  it("new records with no venue are counted in one line, not listed one by one", async () => {
    const { report } = await runOver([
      candidate({ title: "Mystery Night", venue: null, venueEvidence: null, neighborhood: null }),
      candidate({ title: "Secret Show", venue: null, venueEvidence: null, neighborhood: "Overland Park" }),
      olathe(),
    ]);

    expect(report.unmappableNeighborhoods).toHaveLength(3);
    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain("3 events end the run in the catch-all, none of them listed in an earlier report.");
    expect(markdown).toContain("- 2 new ones with no venue");
    expect(markdown).not.toContain("Mystery Night");
    expect(markdown).toContain('- Suburban Show at Some Hall: the extractor proposed "Olathe"');
  });
});

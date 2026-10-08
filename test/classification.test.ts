import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, parseDataset } from "../src/dataset.js";
import type { RunConfig } from "../src/config.js";
import { renderReportMarkdown } from "../src/report.js";
import { fakePorts } from "./fakes/ports.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { candidateAt, costing, PAGE, source, WEEK_1 } from "./fakes/fixtures.js";

const recordBar = source("recordBar", { neighborhood: "Crossroads" });
const CALENDAR_URL = recordBar.urls[0]!;
const candidate = (overrides: Record<string, unknown> = {}) => candidateAt(recordBar, overrides);

async function runOver(candidates: unknown[], config: RunConfig = testConfig()) {
  const fakes = fakePorts(WEEK_1, { pages: { [CALENDAR_URL]: PAGE }, completions: [costing(0.01, ...candidates)] });
  const result = await run({ config, prompts: testPrompts(), dataset: emptyDataset(), registry: { sources: [recordBar] }, ports: fakes.ports });
  expect(parseDataset(result.dataset)).toEqual(result.dataset);
  return { ...result, requests: fakes.requests };
}

describe("recurrence, kind, geography, and neighborhood", () => {
  it("weekly trivia is an active recurring event with a schedule phrase and no start date", async () => {
    const { dataset } = await runOver([
      candidate({
        title: "Tuesday Trivia",
        startDate: null,
        startTime: null,
        schedule: "Every Tuesday, 7pm",
        kind: "other",
        dateEvidence: "Trivia every Tuesday at 7pm",
      }),
    ]);

    expect(dataset.events).toHaveLength(1);
    expect(dataset.events[0]).toMatchObject({
      title: "Tuesday Trivia",
      schedule: "Every Tuesday, 7pm",
      recurrence: "recurring",
      status: "active",
      evidence: { date: "Trivia every Tuesday at 7pm" },
    });
    expect(dataset.events[0]).not.toHaveProperty("start");
    expect(dataset.events[0]).not.toHaveProperty("end");
  });

  it("a team's home season is one recurring event carrying its schedule, not a one-off per game", async () => {
    const { dataset } = await runOver([
      candidate({
        title: "Sporting KC home matches",
        startDate: "2026-03-01",
        endDate: "2026-10-18",
        schedule: "Home matches, March through October",
        sportsSeason: true,
        kind: "sports",
        venue: "Children's Mercy Park",
        dateEvidence: "2026 home schedule: Mar 1 – Oct 18",
        venueEvidence: "Children's Mercy Park",
      }),
    ]);

    expect(dataset.events).toHaveLength(1);
    expect(dataset.events[0]).toMatchObject({ recurrence: "recurring", schedule: "Home matches, March through October", status: "active" });
    expect(dataset.events[0]).not.toHaveProperty("start");
  });

  it("a program a page titles month by month is one recurring event, read with rules that say so, and a dated series still ends", async () => {
    const museum = source("National WWI Museum and Memorial", { kind: "other", neighborhood: "Crossroads" });
    const url = museum.urls[0]!;
    const page = `<html><body>
      <h3>Main Gallery Tours (Oct. 2026)</h3><p>Daily, 10:30am and 1:30pm. Meet at the Paul Sunderland Glass Bridge.</p>
      <h3>Main Gallery Tours (Nov. 2026)</h3><p>Daily, 10:30am and 1:30pm. Meet at the Paul Sunderland Glass Bridge.</p>
      <h3>Hands-on History (Oct. 2026)</h3><p>Saturdays, 11am–2pm, in the Main Gallery.</p>
      <h3>Hands-on History (Nov. 2026)</h3><p>Saturdays, 11am–2pm, in the Main Gallery.</p>
      <h3>Film Series: The Great War on Screen</h3><p>Thursdays, Oct. 15 through Nov. 12, 6pm.</p>
    </body></html>`;
    const rules = readFileSync(new URL("../prompts/extraction-rules.md", import.meta.url), "utf8");
    const at = (overrides: Record<string, unknown>) => candidateAt(museum, { startDate: null, startTime: null, venueEvidence: "National WWI Museum and Memorial", ...overrides });
    const fakes = fakePorts(WEEK_1, {
      pages: { [url]: { status: 200, body: page } },
      completions: [
        costing(
          0.01,
          at({ title: "Main Gallery Tours", schedule: "Daily, 10:30am and 1:30pm", dateEvidence: "Daily, 10:30am and 1:30pm" }),
          at({ title: "Hands-on History", schedule: "Saturdays, 11am–2pm", dateEvidence: "Saturdays, 11am–2pm" }),
          at({ title: "Film Series: The Great War on Screen", startDate: "2026-10-15", startTime: "18:00", endDate: "2026-11-12", dateEvidence: "Thursdays, Oct. 15 through Nov. 12, 6pm" }),
        ),
      ],
    });

    const { dataset } = await run({
      config: testConfig(),
      prompts: { ...testPrompts(), extractionRules: rules },
      dataset: emptyDataset(),
      registry: { sources: [museum] },
      ports: fakes.ports,
    });

    // The model is told to fold month-titled entries into one recurring candidate, and that a stated end still makes a limited run.
    const system = fakes.requests.find((r) => r.model === "test/extraction")!.messages[0]!.content;
    expect(system).toContain("with the month in the title");
    expect(system).toContain("is not recurring: give its `startDate` and `endDate`");

    expect(dataset.events.map((e) => [e.title, e.recurrence, e.status])).toEqual([
      ["Main Gallery Tours", "recurring", "active"],
      ["Hands-on History", "recurring", "active"],
      ["Film Series: The Great War on Screen", "limited-run", "active"],
    ]);
    for (const e of dataset.events.slice(0, 2)) expect(e).not.toHaveProperty("start");
    expect(dataset.events[0]).toMatchObject({ schedule: "Daily, 10:30am and 1:30pm" });
  });

  it("a kind from the taxonomy is kept, and the model's kind wins over the source's", async () => {
    const { dataset } = await runOver([candidate({ kind: "comedy" })], testConfig({ kinds: ["music", "comedy", "other"] }));

    expect(dataset.events[0]).toMatchObject({ kind: "comedy" });
  });

  it("a kind outside the taxonomy becomes other", async () => {
    const { dataset } = await runOver([candidate({ title: "A", kind: "polka" }), candidate({ title: "B", kind: "MUSIC" })]);

    expect(dataset.events.map((e) => e.kind)).toEqual(["other", "music"]);
  });

  it("the extraction request lists the taxonomy so the model can choose from it", async () => {
    const { requests } = await runOver([candidate()]);

    expect(requests[0]!.messages[0]!.content).toContain("- Kinds: music, other");
  });

  it("a neighborhood on the list keeps the list's spelling, and the list is seeded from the registry's sources", async () => {
    // Westport is in the config list; Crossroads only in the registry.
    const { dataset, report } = await runOver([
      candidate({ title: "A", neighborhood: "westport" }),
      candidate({ title: "B", neighborhood: "Crossroads" }),
      candidate({ title: "C", neighborhood: "Lawrence" }),
    ]);

    expect(dataset.events.map((e) => e.neighborhood)).toEqual(["Westport", "Crossroads", "Lawrence"]);
    expect(report.unmappableNeighborhoods).toEqual([]);
  });

  it("an address that maps to nothing on the list lands in the catch-all and appears in the report", async () => {
    const { dataset, report } = await runOver([
      candidate({ title: "Suburban Show", venue: "Some Hall", venueEvidence: "Some Hall, 123 Main St, Olathe", neighborhood: "Olathe" }),
      candidate({ title: "Nowhere Show", neighborhood: null }),
    ]);

    expect(dataset.events.map((e) => e.neighborhood)).toEqual(["Elsewhere in the metro", "Elsewhere in the metro"]);
    expect(report.unmappableNeighborhoods).toEqual([
      { eventTitle: "Suburban Show", venue: "Some Hall", proposed: "Olathe" },
      { eventTitle: "Nowhere Show", venue: "recordBar" },
    ]);
    expect(renderReportMarkdown(report)).toContain('- Suburban Show at Some Hall: the extractor proposed "Olathe"');
  });

  it("the extraction request lists every region's neighborhoods, then the catch-all", async () => {
    const { requests } = await runOver([candidate()]);

    expect(requests[0]!.messages[0]!.content).toContain("- Neighborhoods: Westport, East Bottoms, Crossroads, Lawrence, Elsewhere in the metro");
  });

  it("an event outside the geography is dropped and counted, never recorded", async () => {
    const { dataset, report } = await runOver([
      candidate({ title: "Tour Stop In St. Louis", venue: "The Pageant", venueEvidence: "The Pageant, St. Louis, MO", outsideGeography: true }),
      candidate(),
    ]);

    expect(dataset.events.map((e) => e.title)).toEqual(["Big Show"]);
    expect(report.counts).toMatchObject({ found: 1, new: 1, outsideGeography: 1 });
    expect(report.sources).toEqual([{ name: "recordBar", result: "fetched", extracted: 2 }]);
    expect(report.unmappableNeighborhoods).toEqual([]);
    expect(renderReportMarkdown(report)).toContain("| Dropped: outside geography | 1 |");
  });

  it("an exhibition already underway, with only its closing date on the page, is an active limited run", async () => {
    const { dataset } = await runOver([
      candidate({ title: "Glass", startDate: null, startTime: null, endDate: "2027-01-17", dateEvidence: "On view through January 17, 2027" }),
    ]);

    expect(dataset.events[0]).toMatchObject({ recurrence: "limited-run", end: "2027-01-17", status: "active" });
    expect(dataset.events[0]).not.toHaveProperty("start");
  });

  it("an address the extractor itself put in the catch-all is flagged without a proposal, not as a page with no location", async () => {
    const { report } = await runOver([candidate({ neighborhood: "Elsewhere in the metro" })]);

    expect(report.unmappableNeighborhoods).toEqual([{ eventTitle: "Big Show", venue: "recordBar" }]);
    expect(renderReportMarkdown(report)).toContain("- Big Show at recordBar: no neighborhood proposed");
  });
});

import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { emptyDataset, type Dataset, type Event } from "../src/dataset.js";
import type { CompletionResult } from "../src/ports.js";
import { renderReportMarkdown } from "../src/report.js";
import { run } from "../src/run.js";
import { neighborhoodList, regionOf } from "../src/taxonomy.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { candidateAt, knuckleheads, PAGE, reply, source, WEEK_1, WEEK_2 } from "./fakes/fixtures.js";
import { fakePorts, type CannedPage } from "./fakes/ports.js";
import { runWith } from "./fakes/run.js";

const config = parseConfig({
  neighborhoods: {
    "Central KC": ["Crossroads", "Westport"],
    "Johnson County": ["Olathe", "Overland Park"],
    Lawrence: ["Lawrence"],
  },
});

describe("regions", () => {
  it("a neighborhood's region is the one listing it", () => {
    expect(regionOf("Olathe", config)).toBe("Johnson County");
    expect(regionOf("Crossroads", config)).toBe("Central KC");
    expect(regionOf("Lawrence", config)).toBe("Lawrence");
  });

  it("the catch-all, and anything no region lists, is in no region", () => {
    expect(regionOf("Elsewhere in the metro", config)).toBeUndefined();
    expect(regionOf("Topeka", config)).toBeUndefined();
  });

  it("the extractor's list is every region's neighborhoods, then the catch-all", () => {
    const registry = { sources: [source("recordBar", { neighborhood: "Crossroads" })] };

    expect(neighborhoodList(config, registry)).toEqual([
      "Crossroads",
      "Westport",
      "Olathe",
      "Overland Park",
      "Lawrence",
      "Elsewhere in the metro",
    ]);
  });

  it("a source may name a listed neighborhood in any spelling, or the catch-all", () => {
    const registry = {
      sources: [source("recordBar", { neighborhood: "crossroads" }), source("Roaming Fest", { neighborhood: "Elsewhere in the metro" })],
    };

    expect(() => neighborhoodList(config, registry)).not.toThrow();
  });

  it("a source naming a neighborhood no region lists fails, naming the source and the neighborhood", () => {
    const registry = { sources: [source("recordBar", { neighborhood: "Crossroads" }), source("Liberty Hall", { neighborhood: "Topeka" })] };

    expect(() => neighborhoodList(config, registry)).toThrow(/Liberty Hall.*"Topeka"/);
  });

  it("a run over such a registry fails before fetching anything", async () => {
    const offList = source("Liberty Hall", { neighborhood: "Topeka" });
    const fakes = fakePorts(WEEK_1, { pages: { [offList.urls[0]!]: PAGE }, completions: [] });

    await expect(
      run({ config: testConfig(), prompts: testPrompts(), dataset: emptyDataset(), registry: { sources: [offList] }, ports: fakes.ports }),
    ).rejects.toThrow(/Liberty Hall.*"Topeka"/);
    expect(fakes.calls).toEqual([]);
  });
});

describe("the neighborhoods config", () => {
  it("defaults to the Lawrence region alone", () => {
    expect(parseConfig({}).neighborhoods).toEqual({ Lawrence: ["Lawrence"] });
  });

  it("rejects a neighborhood listed under two regions", () => {
    expect(() => parseConfig({ neighborhoods: { "Central KC": ["Westport"], "South KC": ["westport"], Lawrence: ["Lawrence"] } })).toThrow(
      /westport.*listed under both Central KC and South KC/,
    );
  });

  it("rejects the catch-all listed under a region", () => {
    expect(() => parseConfig({ neighborhoods: { "Central KC": ["Westport", "Elsewhere in the metro"], Lawrence: ["Lawrence"] } })).toThrow(/catch-all/);
  });

  it("rejects a list no region of which holds Lawrence", () => {
    expect(() => parseConfig({ neighborhoods: { "Central KC": ["Westport"] } })).toThrow(/must list .*Lawrence/);
  });

  it("rejects the old flat list", () => {
    expect(() => parseConfig({ neighborhoods: ["Westport", "Lawrence", "Elsewhere in the metro"] })).toThrow();
  });
});

describe("stored neighborhoods off the list", () => {
  const calendar = knuckleheads.urls[0]!;
  // Always answers, so a run in which Knuckleheads is down is still a run.
  const other = source("Other", { neighborhood: "Crossroads" });
  const show = (overrides: Record<string, unknown> = {}) =>
    candidateAt(knuckleheads, { startDate: "2026-12-12", dateEvidence: "Sat, Dec 12 · Show 8:00 PM", ...overrides });
  const runAt = (now: Date, dataset: Dataset, knuckleheadsPage: CannedPage, completions: CompletionResult[]) =>
    runWith(now, dataset, { sources: [knuckleheads, other], pages: { [calendar]: knuckleheadsPage, [other.urls[0]!]: PAGE }, completions });
  /** A dataset holding the Big Show, read verified in week one, with its stored neighborhood replaced. */
  const storedAs = async (neighborhood: string, overrides: Partial<Event> = {}) => {
    const first = await runAt(WEEK_1, emptyDataset(), PAGE, [reply(show()), reply()]);
    return { ...first.dataset, events: first.dataset.events.map((e) => ({ ...e, neighborhood, ...overrides })) };
  };
  const FORBIDDEN: CannedPage = { status: 403, body: "Forbidden" };

  it("an event whose page cannot be read is re-placed in the catch-all when its stored neighborhood names a region", async () => {
    const second = await runAt(WEEK_2, await storedAs("Central KC"), FORBIDDEN, [reply()]);

    expect(second.dataset.events[0]).toMatchObject({ neighborhood: "Elsewhere in the metro", status: "active", consecutiveOutages: 1 });
    expect(second.report.counts.offListNeighborhoods).toBe(1);
  });

  it("a stored neighborhood in another spelling takes the list's own", async () => {
    const second = await runAt(WEEK_2, await storedAs("east  bottoms"), FORBIDDEN, [reply()]);

    expect(second.dataset.events[0]!.neighborhood).toBe("East Bottoms");
    expect(second.report.counts.offListNeighborhoods).toBe(1);
  });

  it("an unverified event is re-placed too", async () => {
    const second = await runAt(WEEK_2, await storedAs("Topeka", { status: "unverified" }), FORBIDDEN, [reply()]);

    expect(second.dataset.events[0]).toMatchObject({ neighborhood: "Elsewhere in the metro", status: "unverified" });
  });

  it("an expired event keeps what it had: a reading that revives it places it again", async () => {
    const second = await runAt(WEEK_2, await storedAs("Topeka", { status: "expired", expiryReason: "two-strike" }), FORBIDDEN, [reply()]);

    expect(second.dataset.events[0]!.neighborhood).toBe("Topeka");
    expect(second.report.counts.offListNeighborhoods).toBe(0);
  });

  it("a verified re-reading places the event from its page, and it is not counted", async () => {
    const second = await runAt(WEEK_2, await storedAs("Central KC"), PAGE, [reply(show()), reply()]);

    expect(second.dataset.events[0]!.neighborhood).toBe("East Bottoms");
    expect(second.report.counts.offListNeighborhoods).toBe(0);
  });

  it("an event already on the list, or in the catch-all, is left alone and not counted", async () => {
    const onList = await runAt(WEEK_2, await storedAs("East Bottoms"), FORBIDDEN, [reply()]);
    const catchAll = await runAt(WEEK_2, await storedAs("Elsewhere in the metro"), FORBIDDEN, [reply()]);

    expect(onList.dataset.events[0]!.neighborhood).toBe("East Bottoms");
    expect(catchAll.dataset.events[0]!.neighborhood).toBe("Elsewhere in the metro");
    expect(onList.report.counts.offListNeighborhoods + catchAll.report.counts.offListNeighborhoods).toBe(0);
  });

  it("the run report shows the count", async () => {
    const second = await runAt(WEEK_2, await storedAs("Central KC"), FORBIDDEN, [reply()]);

    expect(renderReportMarkdown(second.report)).toContain("| Stored neighborhoods off the list, re-placed | 1 |");
  });
});

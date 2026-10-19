import { describe, expect, it } from "vitest";
import { parseConfig, type RunConfig } from "../src/config.js";
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
  const show = () => candidateAt(knuckleheads, { startDate: "2026-12-12", dateEvidence: "Sat, Dec 12 · Show 8:00 PM" });
  const withJohnsonCounty = testConfig({
    neighborhoods: { "Central KC": ["Westport", "East Bottoms", "Crossroads"], "Johnson County": ["Olathe"], Lawrence: ["Lawrence"] },
  });
  const runAt = (now: Date, dataset: Dataset, knuckleheadsPage: CannedPage, completions: CompletionResult[], config = testConfig()) =>
    runWith(now, dataset, { sources: [knuckleheads, other], pages: { [calendar]: knuckleheadsPage, [other.urls[0]!]: PAGE }, completions, config });
  /** A dataset holding the Big Show, read verified from Knuckleheads in week one, with its stored neighborhood replaced. */
  const storedAs = async (neighborhood: string, overrides: Partial<Event> = {}) => {
    const first = await runAt(WEEK_1, emptyDataset(), PAGE, [reply(show()), reply()]);
    return { ...first.dataset, events: first.dataset.events.map((e) => ({ ...e, neighborhood, ...overrides })) };
  };
  const FORBIDDEN: CannedPage = { status: 403, body: "Forbidden" };

  it("an event no page reads, stored under the name of its registry source's region, is placed in the source's neighborhood", async () => {
    const second = await runAt(WEEK_2, await storedAs("Central KC"), FORBIDDEN, [reply()]);

    expect(second.dataset.events[0]).toMatchObject({ neighborhood: "East Bottoms", status: "active", consecutiveOutages: 1 });
    expect(second.report.offListNeighborhoods).toEqual([{ stored: "Central KC", placed: "East Bottoms", events: 1 }]);
  });

  it("stored under the name of another region, it is placed in the catch-all", async () => {
    const second = await runAt(WEEK_2, await storedAs("Johnson County"), FORBIDDEN, [reply()], withJohnsonCounty);

    expect(second.dataset.events[0]!.neighborhood).toBe("Elsewhere in the metro");
    expect(second.report.offListNeighborhoods).toEqual([{ stored: "Johnson County", placed: "Elsewhere in the metro", events: 1 }]);
  });

  it("an event from a discovery lead stored under a region name is placed in the catch-all", async () => {
    const stored = await storedAs("Central KC", { lead: { lane: "discovery", query: "music in Kansas City" } });

    const second = await runAt(WEEK_2, stored, FORBIDDEN, [reply()]);

    expect(second.dataset.events[0]!.neighborhood).toBe("Elsewhere in the metro");
  });

  it("stored under a name no region or neighborhood has, it is placed in the catch-all", async () => {
    const second = await runAt(WEEK_2, await storedAs("Topeka"), FORBIDDEN, [reply()]);

    expect(second.dataset.events[0]!.neighborhood).toBe("Elsewhere in the metro");
  });

  it("a stored neighborhood in another spelling takes the list's own", async () => {
    const second = await runAt(WEEK_2, await storedAs("east  bottoms"), FORBIDDEN, [reply()]);

    expect(second.dataset.events[0]!.neighborhood).toBe("East Bottoms");
    expect(second.report.offListNeighborhoods).toEqual([{ stored: "east  bottoms", placed: "East Bottoms", events: 1 }]);
  });

  it("an unverified event is placed again too", async () => {
    const second = await runAt(WEEK_2, await storedAs("Topeka", { status: "unverified" }), FORBIDDEN, [reply()]);

    expect(second.dataset.events[0]).toMatchObject({ neighborhood: "Elsewhere in the metro", status: "unverified" });
  });

  it("an expired event keeps what it had: a reading that revives it places it from its page", async () => {
    const second = await runAt(WEEK_2, await storedAs("Topeka", { status: "expired", expiryReason: "two-strike" }), FORBIDDEN, [reply()]);

    expect(second.dataset.events[0]!.neighborhood).toBe("Topeka");
    expect(second.report.offListNeighborhoods).toEqual([]);
  });

  it("a verified re-reading places the event from its page, and it is not reported", async () => {
    const second = await runAt(WEEK_2, await storedAs("Central KC"), PAGE, [reply(show()), reply()]);

    expect(second.dataset.events[0]!.neighborhood).toBe("East Bottoms");
    expect(second.report.offListNeighborhoods).toEqual([]);
  });

  it("an event already on the list, or in the catch-all, is left alone and not reported", async () => {
    const onList = await runAt(WEEK_2, await storedAs("East Bottoms"), FORBIDDEN, [reply()]);
    const catchAll = await runAt(WEEK_2, await storedAs("Elsewhere in the metro"), FORBIDDEN, [reply()]);

    expect(onList.dataset.events[0]!.neighborhood).toBe("East Bottoms");
    expect(catchAll.dataset.events[0]!.neighborhood).toBe("Elsewhere in the metro");
    expect([...onList.report.offListNeighborhoods, ...catchAll.report.offListNeighborhoods]).toEqual([]);
  });

  it("the run report counts the events and names each stored value and where it went", async () => {
    const second = await runAt(WEEK_2, await storedAs("Central KC"), FORBIDDEN, [reply()]);
    const markdown = renderReportMarkdown(second.report);

    expect(markdown).toContain("| Stored neighborhoods off the list, placed again | 1 |");
    expect(markdown).toContain('- "Central KC": 1 event placed in East Bottoms');
  });
});

describe("venue neighborhoods (#150)", () => {
  const calendar = knuckleheads.urls[0]!;
  const other = source("Other", { neighborhood: "Crossroads" });
  const show = () => candidateAt(knuckleheads, { startDate: "2026-12-12", dateEvidence: "Sat, Dec 12 · Show 8:00 PM" });
  const mapped = (venueNeighborhoods: Record<string, string>, venueAliases: Record<string, string[]> = {}) =>
    testConfig({ venueNeighborhoods, venueAliases });
  const runAt = (now: Date, dataset: Dataset, knuckleheadsPage: CannedPage, completions: CompletionResult[], config: RunConfig) =>
    runWith(now, dataset, { sources: [knuckleheads, other], pages: { [calendar]: knuckleheadsPage, [other.urls[0]!]: PAGE }, completions, config });
  /** A dataset holding the Big Show, read verified from Knuckleheads (East Bottoms) in week one, with these overrides. */
  const storedAs = async (overrides: Partial<Event>) => {
    const first = await runAt(WEEK_1, emptyDataset(), PAGE, [reply(show()), reply()], testConfig());
    return { ...first.dataset, events: first.dataset.events.map((e) => ({ ...e, ...overrides })) };
  };
  const FORBIDDEN: CannedPage = { status: 403, body: "Forbidden" };

  it("an event at a mapped venue read this run takes the mapped neighborhood, whatever extraction proposed", async () => {
    const result = await runAt(WEEK_1, emptyDataset(), PAGE, [reply(show()), reply()], mapped({ Knuckleheads: "Westport" }));

    expect(result.dataset.events[0]).toMatchObject({ venue: "Knuckleheads", neighborhood: "Westport" });
    expect(result.report.venueNeighborhoods).toEqual([{ venue: "Knuckleheads", placed: "Westport", events: 1 }]);
  });

  it("an event stored under another neighborhood and read by no page this run is moved", async () => {
    const second = await runAt(WEEK_2, await storedAs({ neighborhood: "Crossroads" }), FORBIDDEN, [reply()], mapped({ Knuckleheads: "Westport" }));

    expect(second.dataset.events[0]).toMatchObject({ neighborhood: "Westport", consecutiveOutages: 1 });
    expect(second.report.venueNeighborhoods).toEqual([{ venue: "Knuckleheads", placed: "Westport", events: 1 }]);
  });

  it("an event whose venue name goes by an alias of a mapped venue is moved", async () => {
    const config = mapped({ "Knuckleheads Saloon": "Westport" }, { "Knuckleheads Saloon": ["Knuckleheads"] });

    const second = await runAt(WEEK_2, await storedAs({ neighborhood: "Crossroads" }), FORBIDDEN, [reply()], config);

    expect(second.dataset.events[0]!.neighborhood).toBe("Westport");
    expect(second.report.venueNeighborhoods).toEqual([{ venue: "Knuckleheads Saloon", placed: "Westport", events: 1 }]);
  });

  it("an event in the catch-all at a mapped venue is moved and loses its unplaced mark", async () => {
    const stored = await storedAs({ neighborhood: "Elsewhere in the metro", unplaced: { proposed: "Swope" } });

    const second = await runAt(WEEK_2, stored, FORBIDDEN, [reply()], mapped({ Knuckleheads: "Westport" }));

    expect(second.dataset.events[0]!.neighborhood).toBe("Westport");
    expect(second.dataset.events[0]!.unplaced).toBeUndefined();
    expect(second.report.unmappableNeighborhoods).toEqual([]);
  });

  it("a stored neighborhood off the list at a mapped venue goes to the mapped one, not to the catch-all", async () => {
    const second = await runAt(WEEK_2, await storedAs({ neighborhood: "Topeka" }), FORBIDDEN, [reply()], mapped({ Knuckleheads: "Westport" }));

    expect(second.dataset.events[0]!.neighborhood).toBe("Westport");
    expect(second.report.offListNeighborhoods).toEqual([]);
  });

  it("an expired event at a mapped venue is left as it is", async () => {
    const stored = await storedAs({ neighborhood: "Crossroads", status: "expired", expiryReason: "two-strike" });

    const second = await runAt(WEEK_2, stored, FORBIDDEN, [reply()], mapped({ Knuckleheads: "Westport" }));

    expect(second.dataset.events[0]!.neighborhood).toBe("Crossroads");
    expect(second.report.venueNeighborhoods).toEqual([]);
  });

  it("an event already under its venue's neighborhood, or at a venue not mapped, is not reported", async () => {
    const already = await runAt(WEEK_2, await storedAs({ neighborhood: "Westport" }), FORBIDDEN, [reply()], mapped({ Knuckleheads: "Westport" }));
    const unmapped = await runAt(WEEK_2, await storedAs({ neighborhood: "Crossroads" }), FORBIDDEN, [reply()], mapped({ recordBar: "Westport" }));

    expect(already.dataset.events[0]!.neighborhood).toBe("Westport");
    expect(unmapped.dataset.events[0]!.neighborhood).toBe("Crossroads");
    expect([...already.report.venueNeighborhoods, ...unmapped.report.venueNeighborhoods]).toEqual([]);
  });

  it("the run report names each venue, how many events it moved, and where", async () => {
    const second = await runAt(WEEK_2, await storedAs({ neighborhood: "Crossroads" }), FORBIDDEN, [reply()], mapped({ Knuckleheads: "Westport" }));

    expect(renderReportMarkdown(second.report)).toContain("- Knuckleheads: 1 event placed in Westport by venueNeighborhoods");
  });
});

describe("the venueNeighborhoods config", () => {
  const neighborhoods = { "Central KC": ["Westport", "Crossroads"], Lawrence: ["Lawrence"] };

  it("defaults to no venues", () => {
    expect(parseConfig({}).venueNeighborhoods).toEqual({});
  });

  it("accepts a venue mapped to a listed neighborhood", () => {
    expect(parseConfig({ neighborhoods, venueNeighborhoods: { recordBar: "Crossroads" } }).venueNeighborhoods).toEqual({ recordBar: "Crossroads" });
  });

  it("refuses a neighborhood no region lists, naming the entry", () => {
    expect(() => parseConfig({ neighborhoods, venueNeighborhoods: { recordBar: "Topeka" } })).toThrow(/recordBar.*Topeka.*no region lists/);
  });

  it("refuses the catch-all as a neighborhood, naming the entry", () => {
    expect(() => parseConfig({ neighborhoods, venueNeighborhoods: { recordBar: "Elsewhere in the metro" } })).toThrow(/recordBar.*catch-all/);
  });

  it("refuses a key that venueAliases files under another venue, naming the key to use", () => {
    const venueAliases = { "Kauffman Center for the Performing Arts": ["Kauffman Center", "Helzberg Hall"] };

    expect(() => parseConfig({ neighborhoods, venueAliases, venueNeighborhoods: { "Helzberg Hall": "Crossroads" } })).toThrow(
      /Helzberg Hall.*key the entry on .*Kauffman Center for the Performing Arts/,
    );
  });
});

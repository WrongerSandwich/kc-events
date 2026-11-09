import { describe, expect, it } from "vitest";
import { parseConfig, type RunConfig } from "../src/config.js";
import { emptyDataset, type Dataset, type Event } from "../src/dataset.js";
import type { CompletionResult } from "../src/ports.js";
import { renderReportMarkdown } from "../src/report.js";
import { run } from "../src/run.js";
import { neighborhoodList, regionOf } from "../src/taxonomy.js";
import type { VenueRow } from "../src/venues.js";
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
  type Placement = { config: RunConfig; venues: VenueRow[] };
  /** The venue table's rows placing these venues (#258), under a test config with these aliases. */
  const mapped = (venueNeighborhoods: Record<string, string>, venueAliases: Record<string, string[]> = {}): Placement => ({
    config: testConfig({ venueAliases }),
    venues: Object.entries(venueNeighborhoods).map(([name, neighborhood]) => ({ name, address: "2715 Rochester Ave, Kansas City, MO 64120", neighborhood })),
  });
  const runAt = (now: Date, dataset: Dataset, knuckleheadsPage: CannedPage, completions: CompletionResult[], { config, venues }: Placement) =>
    runWith(now, dataset, { sources: [knuckleheads, other], pages: { [calendar]: knuckleheadsPage, [other.urls[0]!]: PAGE }, completions, config, venues });
  /** A dataset holding the Big Show, read verified from Knuckleheads (East Bottoms) in week one, with these overrides. */
  const storedAs = async (overrides: Partial<Event>) => {
    const first = await runAt(WEEK_1, emptyDataset(), PAGE, [reply(show()), reply()], mapped({}));
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

    expect(renderReportMarkdown(second.report)).toContain("- Knuckleheads: 1 event placed in Westport by the venue table");
  });

  it("the config no longer takes venueNeighborhoods: a venue's neighborhood is a venue table row (#258)", () => {
    expect(() => parseConfig({ venueNeighborhoods: { Knuckleheads: "Westport" } })).toThrow(/venueNeighborhoods/);
  });

  describe("venues without a row (#258)", () => {
    const row = (name: string): VenueRow => ({ name, address: "2715 Rochester Ave, Kansas City, MO 64120" });
    const withRows = (venues: VenueRow[], venueAliases: Record<string, string[]> = {}): Placement => ({ config: testConfig({ venueAliases }), venues });

    it("the report names each venue with active events and no row, most events first, and the Markdown lists them", async () => {
      const result = await runAt(WEEK_1, emptyDataset(), PAGE, [reply(show()), reply()], mapped({}));

      expect(result.report.venuesWithoutRow).toEqual([{ venue: "Knuckleheads", events: 1 }]);
      expect(renderReportMarkdown(result.report)).toContain("## Venues without a row\n\nVenues with active events and no row in data/venues.yaml");
      expect(renderReportMarkdown(result.report)).toContain("- Knuckleheads: 1 event");
    });

    it("a venue with a row is not named, with or without a neighborhood on the row", async () => {
      const bare = await runAt(WEEK_1, emptyDataset(), PAGE, [reply(show()), reply()], withRows([row("Knuckleheads")]));
      const placed = await runAt(WEEK_1, emptyDataset(), PAGE, [reply(show()), reply()], mapped({ Knuckleheads: "Westport" }));

      expect(bare.report.venuesWithoutRow).toEqual([]);
      expect(placed.report.venuesWithoutRow).toEqual([]);
    });

    it("a venue is named by its display name, so a row keyed on it covers the names venueAliases files under it", async () => {
      const result = await runAt(WEEK_1, emptyDataset(), PAGE, [reply(show()), reply()], withRows([row("Knuckleheads Saloon")], { "Knuckleheads Saloon": ["Knuckleheads"] }));

      expect(result.report.venuesWithoutRow).toEqual([]);
    });

    it("an event not active does not count, expired or unverified", async () => {
      const expired = await runAt(WEEK_2, await storedAs({ status: "expired", expiryReason: "two-strike" }), FORBIDDEN, [reply()], mapped({}));
      const unverified = await runAt(WEEK_2, await storedAs({ status: "unverified" }), FORBIDDEN, [reply()], mapped({}));

      expect(expired.report.venuesWithoutRow).toEqual([]);
      expect(unverified.report.venuesWithoutRow).toEqual([]);
    });

    it("lists most events first, then by name, and folds two spellings of one unaliased venue under the first seen", async () => {
      const stored = await storedAs({});
      const show = stored.events[0]!;
      // Each with its own title, or they would fold as one another's duplicates.
      const at = (id: string, venue: string): Event => ({ ...show, id, venue, title: `Show ${id}` });
      const dataset = { ...stored, events: [at("evt_a", "Zed Hall"), show, at("evt_b", "Alpha Hall"), at("evt_c", "ZED HALL")] };

      const second = await runAt(WEEK_2, dataset, FORBIDDEN, [reply()], mapped({}));

      expect(second.report.venuesWithoutRow).toEqual([
        { venue: "Zed Hall", events: 2 },
        { venue: "Alpha Hall", events: 1 },
        { venue: "Knuckleheads", events: 1 },
      ]);
    });
  });
});

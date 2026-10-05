import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { emptyDataset } from "../src/dataset.js";
import { run } from "../src/run.js";
import { neighborhoodList, regionOf } from "../src/taxonomy.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { PAGE, source, WEEK_1 } from "./fakes/fixtures.js";
import { fakePorts } from "./fakes/ports.js";

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

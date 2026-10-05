import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseConfig } from "../src/config.js";
import { parseDataset } from "../src/dataset.js";
import { onHost } from "../src/discovery.js";
import { parseRegistry } from "../src/registry.js";
import { neighborhoodList, regionOf } from "../src/taxonomy.js";

/** The hand-edited files the research job reads, as committed. A typo here fails the run, so it fails the suite first. */
describe("committed config and registry", () => {
  const read = (path: string) => parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
  const config = parseConfig(read("research.config.yaml"));
  const registry = parseRegistry(read("data/registry.yaml"));

  it("loads the committed dataset", () => {
    const raw = JSON.parse(readFileSync(new URL("../data/events.json", import.meta.url), "utf8"));
    // Loading fills fields newer than the file with their defaults and changes nothing else.
    expect(parseDataset(raw)).toEqual({ ...raw, events: raw.events.map((e: object) => ({ consecutiveOutages: 0, ...e })) });
  });

  it("gives every source a kind from the taxonomy", () => {
    const offList = registry.sources.filter((s) => !config.kinds.includes(s.kind)).map((s) => `${s.name}: ${s.kind}`);
    expect(offList).toEqual([]);
  });

  it("puts every source's neighborhood in a region, or the catch-all", () => {
    expect(() => neighborhoodList(config, registry)).not.toThrow();
    expect(regionOf("Olathe", config)).toBe("Johnson County");
    expect(regionOf("Crossroads", config)).toBe("Central KC");
    expect(regionOf("Elsewhere in the metro", config)).toBeUndefined();
  });

  it("names each source's pages once and only on one source", () => {
    const urls = registry.sources.flatMap((s) => s.urls);
    expect(urls.filter((url, i) => urls.indexOf(url) !== i)).toEqual([]);
  });

  it("keeps registry sources off the aggregator and ignored host lists", () => {
    const listed = [...config.discovery.aggregatorHosts, ...config.discovery.ignoredHosts];
    const onList = registry.sources.flatMap((s) => s.urls).filter((url) => onHost(url, listed));
    expect(onList).toEqual([]);
  });
});

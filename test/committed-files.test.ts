import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseConfig } from "../src/config.js";
import { archiveDate } from "../src/archive.js";
import { parseArchive, parseDataset, type Event } from "../src/dataset.js";
import { isIndexPage } from "../src/discovery.js";
import { isPast } from "../src/expiry.js";
import { onHost } from "../src/hosts.js";
import { sameVenue } from "../src/identity.js";
import { parseRunReport } from "../src/report.js";
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
    expect(parseDataset(raw, config)).toEqual({ ...raw, events: raw.events.map((e: object) => ({ consecutiveOutages: 0, ...e })) });
  });

  it("loads every committed archive file, each record under its archive year (#82)", () => {
    const dir = new URL("../data/archive/", import.meta.url);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
    for (const file of files) {
      const archive = parseArchive(JSON.parse(readFileSync(new URL(file, dir), "utf8")), config);
      expect(archive.events.filter((e) => `${archiveDate(e).slice(0, 4)}.json` !== file).map((e) => e.id)).toEqual([]);
    }
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

  it("names a museum's galleries and a complex's hall as the venue other sources give (#155)", () => {
    const same = (a: string, b: string) => sameVenue(a, b, config.venueAliases);
    expect(same("Irma Starr Gallery, Second Floor", "Nerman Museum of Contemporary Art")).toBe(true);
    expect(same("McCaffree Gallery, Second Floor", "Nerman Museum of Contemporary Art")).toBe(true);
    expect(same("Tony and Marti Oppenheimer Gallery; Dean E. Thompson Gallery, First Floor", "Nerman Museum")).toBe(true);
    expect(same("Kansas City Music Hall", "Kansas City Convention Center")).toBe(true);
    expect(same("Kansas City Music Hall", "Bartle Hall")).toBe(true);
  });

  it("keeps registry sources off the aggregator and ignored host lists", () => {
    const listed = [...config.discovery.aggregatorHosts, ...config.discovery.ignoredHosts];
    const onList = registry.sources.flatMap((s) => s.urls).filter((url) => onHost(url, listed));
    expect(onList).toEqual([]);
  });
});

/**
 * What every run leaves true of the committed dataset and its reports (#100). The schema already
 * refuses some of these; each has its own test so a regression names the invariant it broke.
 */
describe("committed dataset invariants", () => {
  const text = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const config = parseConfig(parse(text("research.config.yaml")));
  const registry = parseRegistry(parse(text("data/registry.yaml")));
  const dataset = parseDataset(JSON.parse(text("data/events.json")), config);
  const runsDir = new URL("../data/runs/", import.meta.url);
  const reportFiles = readdirSync(runsDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const runDate = dataset.lastSuccessfulRun!.slice(0, 10);
  const ids = (events: Event[]) => events.map((e) => e.id);
  const active = dataset.events.filter((e) => e.status === "active");

  it("has no active event whose last day is before the run date", () => {
    expect(ids(active.filter((e) => isPast(e, runDate)))).toEqual([]);
  });

  it("has every id once across the dataset", () => {
    expect(ids(dataset.events).filter((id, i, all) => all.indexOf(id) !== i)).toEqual([]);
  });

  it("puts every event not expired in a neighborhood on the config's list", () => {
    const list = neighborhoodList(config, registry);
    expect(dataset.events.filter((e) => e.status !== "expired" && !list.includes(e.neighborhood)).map((e) => `${e.id}: ${e.neighborhood}`)).toEqual([]);
  });

  it("gives an expiry reason to exactly the expired events", () => {
    expect(ids(dataset.events.filter((e) => (e.status === "expired") !== (e.expiryReason !== undefined)))).toEqual([]);
  });

  it("has no active event citing an index page", () => {
    expect(ids(active.filter((e) => isIndexPage(e.primaryUrl, config)))).toEqual([]);
  });

  it("has no own page on an aggregator or ignored host, but on an expired record kept as it was", () => {
    const listed = [...config.discovery.aggregatorHosts, ...config.discovery.ignoredHosts];
    expect(ids(dataset.events.filter((e) => e.status !== "expired" && e.eventUrl !== undefined && onHost(e.eventUrl, listed)))).toEqual([]);
  });

  it("keeps source state only for registry sources", () => {
    const names = new Set(registry.sources.map((s) => s.name));
    expect(Object.keys(dataset.sourceState).filter((name) => !names.has(name))).toEqual([]);
  });

  it("was written by the newest run report's run", () => {
    const newest = parseRunReport(JSON.parse(readFileSync(new URL(reportFiles.at(-1)!, runsDir), "utf8")));
    expect(dataset.generatedAt).toBe(newest.finishedAt);
  });

  it("parses every run report, each named by its run date", () => {
    expect(reportFiles.length).toBeGreaterThan(0);
    for (const file of reportFiles) {
      const report = parseRunReport(JSON.parse(readFileSync(new URL(file, runsDir), "utf8")));
      expect(`${report.runDate}.json`).toBe(file);
    }
  });
});

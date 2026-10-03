import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseConfig } from "../src/config.js";
import { parseRegistry } from "../src/registry.js";

/** The hand-edited files the research job reads, as committed. A typo here fails the run, so it fails the suite first. */
describe("committed config and registry", () => {
  const config = parseConfig(parse(readFileSync("research.config.yaml", "utf8")));
  const registry = parseRegistry(parse(readFileSync("data/registry.yaml", "utf8")));

  it("gives every source a kind from the taxonomy", () => {
    const offList = registry.sources.filter((s) => !config.kinds.includes(s.kind)).map((s) => `${s.name}: ${s.kind}`);
    expect(offList).toEqual([]);
  });

  it("names each source's pages once and only on one source", () => {
    const urls = registry.sources.flatMap((s) => s.urls);
    expect(urls.filter((url, i) => urls.indexOf(url) !== i)).toEqual([]);
  });

  it("keeps registry sources off the aggregator and ignored host lists", () => {
    const listed = [...config.discovery.aggregatorHosts, ...config.discovery.ignoredHosts];
    const onList = registry.sources
      .flatMap((s) => s.urls)
      .filter((url) => {
        const host = new URL(url).hostname;
        return listed.some((h) => host === h || host.endsWith(`.${h}`));
      });
    expect(onList).toEqual([]);
  });
});

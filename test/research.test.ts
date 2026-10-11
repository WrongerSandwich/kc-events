import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { configFromArgs, research } from "../src/research.js";
import { emptyDataset, parseDataset } from "../src/dataset.js";
import { fakePorts, type FakePortOptions } from "./fakes/ports.js";
import { testConfig, TEST_MODELS } from "./fakes/config.js";
import { candidateAt, knuckleheads, PAGE, reply, WEEK_1 } from "./fakes/fixtures.js";

const CALENDAR_URL = knuckleheads.urls[0]!;
const withDiscovery = () => {
  const config = testConfig();
  return { ...config, discovery: { ...config.discovery, enabled: true } };
};

describe("the command line's config", () => {
  it("is the file's when no argument is given", () => {
    expect(configFromArgs(testConfig(), [], {})).toEqual(testConfig());
  });

  it("takes the horizon from --horizon-weeks", () => {
    expect(configFromArgs(testConfig(), ["--horizon-weeks", "3"], {}).horizonWeeks).toBe(3);
    expect(configFromArgs(testConfig(), ["--horizon-weeks=12"], {}).horizonWeeks).toBe(12);
  });

  it.each(["0", "-2", "abc", "2.5", ""])("refuses --horizon-weeks %j", (value) => {
    expect(() => configFromArgs(testConfig(), [`--horizon-weeks=${value}`], {})).toThrow(`--horizon-weeks must be a positive whole number, got "${value}"`);
  });

  it("refuses an argument it does not know", () => {
    expect(() => configFromArgs(testConfig(), ["--horizon", "3"], {})).toThrow(/Unknown option '--horizon'/);
  });

  it("turns discovery off with --no-discovery, keeping the rest of its settings", () => {
    const config = configFromArgs(withDiscovery(), ["--no-discovery"], {});
    expect(config.discovery).toEqual({ ...withDiscovery().discovery, enabled: false });
  });

  it("refuses discovery with no Tavily key, before anything runs", () => {
    expect(() => configFromArgs(withDiscovery(), [], {})).toThrow("discovery is on but TAVILY_API_KEY is not set");
    expect(configFromArgs(withDiscovery(), [], { TAVILY_API_KEY: "key" }).discovery.enabled).toBe(true);
    expect(configFromArgs(withDiscovery(), ["--no-discovery"], {}).discovery.enabled).toBe(false);
  });
});

describe("a research run's files", () => {
  let root: string;

  /** A working directory with the test config, prompts, and a registry of Knuckleheads alone. */
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kc-research-"));
    const config = testConfig();
    await mkdir(join(root, "prompts"));
    await mkdir(join(root, "data"));
    await writeFile(
      join(root, "research.config.yaml"),
      stringify({ ...config, models: { ...TEST_MODELS }, discovery: { ...config.discovery, enabled: false } }),
    );
    await writeFile(join(root, "prompts", "extraction-rules.md"), "RULES");
    await writeFile(join(root, "prompts", "curation-prompt.md"), "CURATION");
    await writeFile(join(root, "data", "registry.yaml"), stringify({ sources: [knuckleheads] }));
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  /** Every file under the data directory, relative to it. */
  const dataFiles = async () => {
    const data = join(root, "data");
    const entries = await readdir(data, { recursive: true, withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(data.length + 1)).sort();
  };

  const researchWith = (options: FakePortOptions) => {
    let closed = false;
    const done = research({
      root,
      args: [],
      env: {},
      adapters: () => ({ ports: fakePorts(WEEK_1, options).ports, close: async () => void (closed = true) }),
    });
    return { done, closed: () => closed };
  };

  it("writes exactly the dataset and the report's two files, and lets go of the adapters", async () => {
    const { done, closed } = researchWith({ pages: { [CALENDAR_URL]: PAGE }, completions: [reply(candidateAt(knuckleheads))] });

    const { written } = await done;

    expect(await dataFiles()).toEqual(["events.json", "registry.yaml", "runs/2026-10-02.json", "runs/2026-10-02.md"]);
    expect(written).toEqual([join(root, "data", "events.json"), join(root, "data", "runs", "2026-10-02.json"), join(root, "data", "runs", "2026-10-02.md")]);
    const dataset = parseDataset(JSON.parse(await readFile(join(root, "data", "events.json"), "utf8")), testConfig());
    expect(dataset.events.map((e) => e.title)).toEqual(["Big Show"]);
    expect(closed()).toBe(true);
  });

  it("writes nothing, and still lets go of the adapters, when the run throws", async () => {
    await writeFile(join(root, "data", "events.json"), JSON.stringify(emptyDataset()));
    const before = await readFile(join(root, "data", "events.json"), "utf8");
    const { done, closed } = researchWith({ pages: { [CALENDAR_URL]: "robots-unreachable" } });

    await expect(done).rejects.toThrow("none of the 1 active registry sources could be fetched");

    expect(await dataFiles()).toEqual(["events.json", "registry.yaml"]);
    expect(await readFile(join(root, "data", "events.json"), "utf8")).toBe(before);
    expect(closed()).toBe(true);
  });
});

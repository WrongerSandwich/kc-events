import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import type { Event } from "../src/dataset.js";

// The run guards every invariant the schema holds, so the test of a refused dataset bends one record of
// the real run's output: `corrupt.event`, when a test sets it, is applied to each event the run returns.
const corrupt = vi.hoisted(() => ({ event: undefined as ((e: Event) => Event) | undefined }));
vi.mock("../src/run.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/run.js")>();
  return {
    ...original,
    run: async (...args: Parameters<typeof original.run>) => {
      const result = await original.run(...args);
      const bend = corrupt.event;
      return bend ? { ...result, dataset: { ...result.dataset, events: result.dataset.events.map(bend) } } : result;
    },
  };
});
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
    await writeFile(join(root, "prompts", "event-page-rules.md"), "EVENT PAGE RULES");
    await writeFile(join(root, "data", "registry.yaml"), stringify({ sources: [knuckleheads] }));
  });
  afterEach(async () => {
    corrupt.event = undefined;
    await rm(root, { recursive: true, force: true });
  });

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

  /** An event expired long before WEEK_1's run (2026-10-02), on the given date. */
  const longGone = (id: string, start: string) => ({
    id,
    title: `Show ${id}`,
    start,
    venue: "Knuckleheads",
    neighborhood: "East Bottoms",
    primaryUrl: CALENDAR_URL,
    kind: "music",
    recurrence: "one-off",
    dontMiss: false,
    firstSeen: `${start}T09:00:00-05:00`,
    lastChanged: `${start}T09:00:00-05:00`,
    status: "expired",
    expiryReason: "past",
    verificationFailures: 0,
    consecutiveOutages: 0,
    lead: { lane: "registry", source: "Knuckleheads" },
    evidence: {},
  });
  const readJson = async (path: string) => JSON.parse(await readFile(join(root, "data", path), "utf8"));

  it("moves long-expired records to the archive file for their year, adding to what is there, and the live file loads alone (#82)", async () => {
    await writeFile(join(root, "data", "events.json"), JSON.stringify({ ...emptyDataset(), events: [longGone("evt_a", "2026-06-01"), longGone("evt_b", "2025-11-01")] }));
    await mkdir(join(root, "data", "archive"));
    await writeFile(join(root, "data", "archive", "2026.json"), JSON.stringify({ schemaVersion: 1, events: [longGone("evt_old", "2026-01-10")] }, null, 2) + "\n");
    const { done } = researchWith({ pages: { [CALENDAR_URL]: PAGE }, completions: [reply(candidateAt(knuckleheads))] });

    const { written } = await done;

    expect(await dataFiles()).toEqual(["archive/2025.json", "archive/2026.json", "events.json", "registry.yaml", "runs/2026-10-02.json", "runs/2026-10-02.md"]);
    expect(written).toContain(join(root, "data", "archive", "2026.json"));
    expect((await readJson("archive/2026.json")).events.map((e: { id: string }) => e.id)).toEqual(["evt_old", "evt_a"]);
    expect((await readJson("archive/2025.json")).events.map((e: { id: string }) => e.id)).toEqual(["evt_b"]);
    expect(parseDataset(await readJson("events.json"), testConfig()).events.map((e) => e.title)).toEqual(["Big Show"]);
  });

  it("writes nothing when an archive file it would add to does not load", async () => {
    await writeFile(join(root, "data", "events.json"), JSON.stringify({ ...emptyDataset(), events: [longGone("evt_a", "2026-06-01")] }));
    await mkdir(join(root, "data", "archive"));
    await writeFile(join(root, "data", "archive", "2026.json"), "{ not json");
    const before = await readFile(join(root, "data", "events.json"), "utf8");
    const { done } = researchWith({ pages: { [CALENDAR_URL]: PAGE }, completions: [reply(candidateAt(knuckleheads))] });

    await expect(done).rejects.toThrow("data/archive/2026.json");

    expect(await dataFiles()).toEqual(["archive/2026.json", "events.json", "registry.yaml"]);
    expect(await readFile(join(root, "data", "events.json"), "utf8")).toBe(before);
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

  it("writes nothing to the dataset when the run's does not validate, names the refused record, and keeps the report beside it (#219)", async () => {
    await writeFile(join(root, "data", "events.json"), JSON.stringify(emptyDataset()));
    const before = await readFile(join(root, "data", "events.json"), "utf8");
    // As the 2026-10-23 hand run's Wizard of Oz: a one-off left spanning ten days.
    corrupt.event = (e) => ({ ...e, end: "2026-11-09T20:00:00-06:00" });
    const { done, closed } = researchWith({ pages: { [CALENDAR_URL]: PAGE }, completions: [reply(candidateAt(knuckleheads))] });

    const error: Error = await done.then(
      () => expect.fail("the run should have been refused"),
      (e: unknown) => e as Error,
    );

    const id = (JSON.parse(await readFile(join(root, "data", "runs", "2026-10-02.failed.json"), "utf8")) as { refused: { event: { id: string } }[] }).refused[0]!.event.id;
    expect(error.message).toContain("the run produced a dataset that does not validate; nothing was written");
    expect(error.message).toContain("data/runs/2026-10-02.failed.json");
    expect(error.message).toContain(`${id} "Big Show" (active, one-off, start 2026-10-31T20:00:00-05:00, end 2026-11-09T20:00:00-06:00):`);
    expect(error.message).toContain("- a one-off spans a few days at most; a longer span is a limited run");
    expect(await dataFiles()).toEqual(["events.json", "registry.yaml", "runs/2026-10-02.failed.json"]);
    expect(await readFile(join(root, "data", "events.json"), "utf8")).toBe(before);
    const side = await readJson("runs/2026-10-02.failed.json");
    expect(side.refused).toEqual([
      { index: 0, messages: ["a one-off spans a few days at most; a longer span is a limited run"], event: expect.objectContaining({ id, title: "Big Show", end: "2026-11-09T20:00:00-06:00" }) },
    ]);
    expect(side.report.runDate).toBe("2026-10-02");
    expect(side.report.spend.totalUsd).toBeGreaterThan(0);
    expect(closed()).toBe(true);
  });
});

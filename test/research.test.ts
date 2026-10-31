import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { research, runOptionsFromArgs } from "../src/research.js";
import { emptyDataset, parseDataset, type Dataset, type Event } from "../src/dataset.js";
import { fakePorts, type FakePortOptions } from "./fakes/ports.js";
import { testConfig, TEST_MODELS } from "./fakes/config.js";
import { candidateAt, knuckleheads, PAGE, reply, source, WEEK_1 } from "./fakes/fixtures.js";

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

const CALENDAR_URL = knuckleheads.urls[0]!;
const withDiscovery = () => {
  const config = testConfig();
  return { ...config, discovery: { ...config.discovery, enabled: true } };
};

describe("the command line's config", () => {
  it("is the file's when no argument is given", () => {
    expect(runOptionsFromArgs(testConfig(), [], {}).config).toEqual(testConfig());
  });

  it("takes the horizon from --horizon-weeks", () => {
    expect(runOptionsFromArgs(testConfig(), ["--horizon-weeks", "3"], {}).config.horizonWeeks).toBe(3);
    expect(runOptionsFromArgs(testConfig(), ["--horizon-weeks=12"], {}).config.horizonWeeks).toBe(12);
  });

  it.each(["0", "-2", "abc", "2.5", ""])("refuses --horizon-weeks %j", (value) => {
    expect(() => runOptionsFromArgs(testConfig(), [`--horizon-weeks=${value}`], {}).config).toThrow(`--horizon-weeks must be a positive whole number, got "${value}"`);
  });

  it("refuses an argument it does not know", () => {
    expect(() => runOptionsFromArgs(testConfig(), ["--horizon", "3"], {}).config).toThrow(/Unknown option '--horizon'/);
  });

  it("turns discovery off with --no-discovery, keeping the rest of its settings", () => {
    const config = runOptionsFromArgs(withDiscovery(), ["--no-discovery"], {}).config;
    expect(config.discovery).toEqual({ ...withDiscovery().discovery, enabled: false });
  });

  it("refuses discovery with no Tavily key, before anything runs", () => {
    expect(() => runOptionsFromArgs(withDiscovery(), [], {}).config).toThrow("discovery is on but TAVILY_API_KEY is not set");
    expect(runOptionsFromArgs(withDiscovery(), [], { TAVILY_API_KEY: "key" }).config.discovery.enabled).toBe(true);
    expect(runOptionsFromArgs(withDiscovery(), ["--no-discovery"], {}).config.discovery.enabled).toBe(false);
  });

  it("is a weekly run unless --reverify-only is given (#253)", () => {
    expect(runOptionsFromArgs(testConfig(), [], {}).reverifyOnly).toBeUndefined();
  });

  it("makes a midweek pass of ten days with --reverify-only, or of --days N, with discovery off and no Tavily key needed (#253)", () => {
    const tenDays = runOptionsFromArgs(withDiscovery(), ["--reverify-only"], {});
    expect(tenDays.reverifyOnly).toEqual({ days: 10 });
    expect(tenDays.config.discovery.enabled).toBe(false);
    expect(runOptionsFromArgs(testConfig(), ["--reverify-only", "--days", "4"], {}).reverifyOnly).toEqual({ days: 4 });
    expect(runOptionsFromArgs(testConfig(), ["--reverify-only", "--days=14"], {}).reverifyOnly).toEqual({ days: 14 });
  });

  it.each(["0", "-1", "abc", "1.5", ""])("refuses --days %j", (value) => {
    expect(() => runOptionsFromArgs(testConfig(), ["--reverify-only", `--days=${value}`], {})).toThrow(`--days must be a positive whole number, got "${value}"`);
  });

  it("refuses --days without --reverify-only", () => {
    expect(() => runOptionsFromArgs(testConfig(), ["--days", "4"], {})).toThrow("--days is the window of a --reverify-only run");
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

  const researchWith = (options: FakePortOptions, { now = WEEK_1, args = [] }: { now?: Date; args?: string[] } = {}) => {
    let closed = false;
    const fakes = fakePorts(now, options);
    const done = research({
      root,
      args,
      env: {},
      adapters: () => ({ ports: fakes.ports, close: async () => void (closed = true) }),
    });
    return { done, closed: () => closed, calls: fakes.calls };
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

  it("a midweek pass re-reads only the pages of the window's events, strikes what its page no longer lists, creates nothing, and says so in its report (#253)", async () => {
    const elsewhere = source("Elsewhere");
    await writeFile(join(root, "data", "registry.yaml"), stringify({ sources: [knuckleheads, elsewhere] }));
    const near = candidateAt(knuckleheads, { title: "Near Show", startDate: "2026-10-08", dateEvidence: "Thu, Oct 8" });
    const late = candidateAt(knuckleheads, { title: "Late Show", startDate: "2026-11-21", dateEvidence: "Sat, Nov 21" });
    const far = candidateAt(elsewhere, { title: "Far Show", startDate: "2026-11-20", dateEvidence: "Fri, Nov 20" });
    const pages = { [CALENDAR_URL]: PAGE, [elsewhere.urls[0]!]: PAGE };
    await researchWith({ pages, completions: [reply(near, late), reply(far)] }).done;
    const weekly = parseDataset(await readJson("events.json"), testConfig());
    // Three days on, with a window of ten: Near Show is in it, Late Show and Far Show are not.
    const midweek = new Date(WEEK_1.getTime() + 3 * 24 * 60 * 60 * 1000);
    const brandNew = candidateAt(knuckleheads, { title: "Brand New", startDate: "2026-10-09", dateEvidence: "Fri, Oct 9" });

    const { done, calls } = researchWith({ pages, completions: [reply(brandNew, late)] }, { now: midweek, args: ["--reverify-only"] });
    const { report, written } = await done;

    expect(calls.filter((c) => c.startsWith("fetch:"))).toEqual([`fetch:${CALENDAR_URL}`]);
    expect(calls.some((c) => c.startsWith("search:"))).toBe(false);
    const after = parseDataset(await readJson("events.json"), testConfig());
    expect(after.events.map((e) => e.title)).toEqual(weekly.events.map((e) => e.title));
    const titled = (dataset: Dataset, title: string) => dataset.events.find((e) => e.title === title)!;
    expect(titled(after, "Near Show").verificationFailures).toBe(1);
    expect(titled(after, "Late Show")).toEqual(titled(weekly, "Late Show"));
    expect(titled(after, "Far Show")).toEqual(titled(weekly, "Far Show"));
    expect(after.sourceState).toEqual(weekly.sourceState);
    expect(written).toEqual([join(root, "data", "events.json"), join(root, "data", "runs", "2026-10-05.json"), join(root, "data", "runs", "2026-10-05.md")]);
    expect(report).toMatchObject({ runDate: "2026-10-05", mode: "reverify-only", windowDays: 10, sources: [], reverification: { pagesRead: 1 } });
    expect((await readJson("runs/2026-10-05.json")).mode).toBe("reverify-only");
    const markdown = await readFile(join(root, "data", "runs", "2026-10-05.md"), "utf8");
    expect(markdown.split("\n")[0]).toBe("# Midweek re-verification 2026-10-05");
    expect(markdown).toContain("1 page re-read.");
  });

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
    expect(error.cause).toBeUndefined();
    expect(closed()).toBe(true);
  });

  it("names the later of two records sharing an id when the run's dataset is refused (#219)", async () => {
    corrupt.event = (e) => ({ ...e, id: "evt_same" });
    const { done } = researchWith({
      pages: { [CALENDAR_URL]: PAGE },
      completions: [reply(candidateAt(knuckleheads), candidateAt(knuckleheads, { title: "Other Show", startDate: "2026-11-01", dateEvidence: "Sun, Nov 1" }))],
    });

    await expect(done).rejects.toThrow(/evt_same "Other Show" \(active, one-off, start 2026-11-01T20:00:00-06:00, end none\):\n {4}- event ids must be unique; evt_same appears more than once/);

    const side = await readJson("runs/2026-10-02.failed.json");
    expect(side.refused.map((r: { index: number; event: { title: string } }) => [r.index, r.event.title])).toEqual([[1, "Other Show"]]);
  });
});

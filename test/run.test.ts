import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, parseDataset, DATASET_SCHEMA_VERSION } from "../src/dataset.js";
import { fakePorts } from "./fakes/ports.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { costing, WEEK_1 } from "./fakes/fixtures.js";

/** The extraction model finding nothing on a page; these tests are about fetching. */
const NO_EVENTS = costing(0);

describe("run", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("an empty registry and empty dataset produce an empty dataset and an all-zero report without touching any port", async () => {
    const { ports, calls } = fakePorts(WEEK_1);
    vi.stubGlobal("fetch", () => {
      throw new Error("the run must reach the network only through its ports");
    });

    const { dataset, report } = await run({
      config: testConfig(),
      prompts: testPrompts(),
      dataset: emptyDataset(),
      registry: { sources: [] },
      ports,
    });

    expect(calls).toEqual([]);
    expect(dataset).toEqual({
      schemaVersion: DATASET_SCHEMA_VERSION,
      generatedAt: "2026-10-02T22:15:00-05:00",
      lastSuccessfulRun: "2026-10-02T22:15:00-05:00",
      events: [],
      sourceState: {},
      discoveryState: {},
    });
    expect(parseDataset(dataset)).toEqual(dataset);
    expect(report.runDate).toBe("2026-10-02");
    expect(report.counts).toEqual({
      found: 0,
      new: 0,
      updated: 0,
      reverified: 0,
      heldUnverified: 0,
      heldThroughOutage: 0,
      unverifiedByOutageLimit: 0,
      unverifiedByUncitableReading: 0,
      outsideGeography: 0,
      expired: { past: 0, "two-strike": 0, cancelled: 0, "index-page": 0, duplicate: 0 },
    });
    expect(report.spend).toEqual({ totalUsd: 0, capUsd: 5, capHit: false, shortfall: { pagesNotExtracted: 0, eventsNotReverified: 0, queriesNotSearched: 0, leadsNotFollowed: 0, eventsNotCurated: 0 } });
    expect(report.sources).toEqual([]);
    expect(report.failingSources).toEqual([]);
    expect(report.unmappableNeighborhoods).toEqual([]);
    expect(report.discovery).toEqual({ enabled: false, queries: 0, aggregatorPages: 0, pagesExtracted: 0, problems: [] });
    expect(report.curation).toEqual({ calls: 0, judged: 0, flagged: 0, problems: [] });
    expect(report.promotionSuggestions).toEqual([]);
    expect(report.outageLimited).toEqual([]);
    expect(report.uncitableReadings).toEqual([]);
  });
});

describe("registry lane fetching", () => {
  const source = (name: string, urls: string[]) => ({
    name,
    urls,
    kind: "music",
    neighborhood: "Westport",
    status: "active" as const,
  });

  it("a robots-blocked registry source appears in the report as blocked and is not fetched", async () => {
    const { ports, calls } = fakePorts(WEEK_1, {
      pages: {
        "https://open.test/calendar": { status: 200, body: "<html>calendar</html>" },
        "https://blocked.test/events": "robots-blocked",
      },
      completions: [NO_EVENTS],
    });

    const { report } = await run({
      config: testConfig(),
      prompts: testPrompts(),
      dataset: emptyDataset(),
      registry: {
        sources: [source("Open Venue", ["https://open.test/calendar"]), source("Blocked Venue", ["https://blocked.test/events"])],
      },
      ports,
    });

    expect(calls).not.toContain("fetch:https://blocked.test/events");
    expect(report.sources).toEqual([
      { name: "Open Venue", result: "fetched", extracted: 0 },
      { name: "Blocked Venue", result: "blocked", extracted: 0, detail: "robots.txt disallows https://blocked.test/events" },
    ]);
  });

  it("a failing source increments its failure count, and a fetched source resets it", async () => {
    const { ports } = fakePorts(WEEK_1, {
      pages: {
        "https://down.test/": new Error("connect ECONNREFUSED"),
        "https://gone.test/": { status: 404, body: "not found" },
        "https://back.test/": { status: 200, body: "<html>calendar</html>" },
      },
      completions: [NO_EVENTS],
    });

    const { dataset, report } = await run({
      config: testConfig(),
      prompts: testPrompts(),
      dataset: {
        ...emptyDataset(),
        sourceState: { "Down Venue": { consecutiveFailures: 1 }, "Back Venue": { consecutiveFailures: 2 } },
      },
      registry: {
        sources: [
          source("Down Venue", ["https://down.test/"]),
          source("Gone Venue", ["https://gone.test/"]),
          source("Back Venue", ["https://back.test/"]),
        ],
      },
      ports,
    });

    expect(dataset.sourceState).toEqual({
      "Down Venue": { consecutiveFailures: 2 },
      "Gone Venue": { consecutiveFailures: 1 },
      "Back Venue": { consecutiveFailures: 0 },
    });
    expect(report.sources).toEqual([
      { name: "Down Venue", result: "failed", extracted: 0, detail: "https://down.test/: connect ECONNREFUSED" },
      { name: "Gone Venue", result: "failed", extracted: 0, detail: "https://gone.test/: HTTP 404" },
      { name: "Back Venue", result: "fetched", extracted: 0 },
    ]);
    expect(report.failingSources).toEqual([]);
  });

  it("a source reaching three consecutive failures is flagged in the report", async () => {
    const { ports } = fakePorts(WEEK_1, {
      pages: {
        "https://third.test/": { status: 500, body: "" },
        "https://second.test/": { status: 503, body: "" },
        "https://open.test/": { status: 200, body: "<html>calendar</html>" },
      },
      completions: [NO_EVENTS],
    });

    const { dataset, report } = await run({
      config: testConfig(),
      prompts: testPrompts(),
      dataset: {
        ...emptyDataset(),
        sourceState: { "Third Strike": { consecutiveFailures: 2 }, "Second Strike": { consecutiveFailures: 1 } },
      },
      registry: {
        sources: [source("Third Strike", ["https://third.test/"]), source("Second Strike", ["https://second.test/"]), source("Open Venue", ["https://open.test/"])],
      },
      ports,
    });

    expect(dataset.sourceState["Third Strike"]).toEqual({ consecutiveFailures: 3 });
    expect(report.failingSources).toEqual(["Third Strike"]);
  });

  it("a run in which no active source can be fetched fails before any model call, so the dataset is not struck", async () => {
    const { ports, calls } = fakePorts(WEEK_1, {
      pages: {
        "https://down.test/": new Error("connect ECONNREFUSED"),
        "https://walled.test/": { status: 403, body: "blocked" },
      },
    });

    await expect(
      run({
        config: testConfig(),
        prompts: testPrompts(),
        dataset: emptyDataset(),
        registry: { sources: [source("Down Venue", ["https://down.test/"]), source("Walled Venue", ["https://walled.test/"])] },
        ports,
      }),
    ).rejects.toThrow("none of the 2 active registry sources could be fetched");
    expect(calls.filter((c) => c.startsWith("model:"))).toEqual([]);
  });

  it("an excluded source is skipped with its reason shown and its state left alone", async () => {
    const { ports, calls } = fakePorts(WEEK_1);

    const { dataset, report } = await run({
      config: testConfig(),
      prompts: testPrompts(),
      dataset: { ...emptyDataset(), sourceState: { "Old Venue": { consecutiveFailures: 4 } } },
      registry: {
        sources: [{ ...source("Old Venue", ["https://old.test/"]), status: "excluded", reason: "closed in 2026" }],
      },
      ports,
    });

    expect(calls).toEqual([]);
    expect(report.sources).toEqual([{ name: "Old Venue", result: "excluded", extracted: 0, detail: "closed in 2026" }]);
    expect(report.failingSources).toEqual([]);
    expect(dataset.sourceState).toEqual({ "Old Venue": { consecutiveFailures: 4 } });
  });

  it("a source with one blocked URL and one failed URL counts as failed and shows both", async () => {
    const { ports } = fakePorts(WEEK_1, {
      pages: {
        "https://mixed.test/blocked": "robots-blocked",
        "https://mixed.test/feed": { status: 500, body: "" },
        "https://open.test/": { status: 200, body: "<html>calendar</html>" },
      },
      completions: [NO_EVENTS],
    });

    const { dataset, report } = await run({
      config: testConfig(),
      prompts: testPrompts(),
      dataset: emptyDataset(),
      registry: { sources: [source("Mixed Venue", ["https://mixed.test/blocked", "https://mixed.test/feed"]), source("Open Venue", ["https://open.test/"])] },
      ports,
    });

    expect(dataset.sourceState["Mixed Venue"]).toEqual({ consecutiveFailures: 1 });
    expect(report.sources).toEqual([
      {
        name: "Mixed Venue",
        result: "failed",
        extracted: 0,
        detail: "https://mixed.test/feed: HTTP 500; robots.txt disallows https://mixed.test/blocked",
      },
      { name: "Open Venue", result: "fetched", extracted: 0 },
    ]);
  });
});

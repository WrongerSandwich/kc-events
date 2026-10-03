import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, parseDataset, DATASET_SCHEMA_VERSION } from "../src/dataset.js";
import { fakePorts } from "./fakes/ports.js";
import { testConfig } from "./fakes/config.js";

// 2026-10-03T03:15:00Z is 22:15 on 2026-10-02 in Kansas City (CDT, UTC-5).
const NOW = new Date("2026-10-03T03:15:00Z");

describe("run", () => {
  it("an empty registry and empty dataset produce an empty dataset and an all-zero report without touching any port", async () => {
    const { ports, calls } = fakePorts(NOW);

    const { dataset, report } = await run({
      config: testConfig(),
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
    });
    expect(parseDataset(dataset)).toEqual(dataset);
    expect(report.runDate).toBe("2026-10-02");
    expect(report.counts).toEqual({
      found: 0,
      new: 0,
      updated: 0,
      reverified: 0,
      heldUnverified: 0,
      expired: { past: 0, "two-strike": 0, cancelled: 0 },
    });
    expect(report.spend).toEqual({ totalUsd: 0, capUsd: 5, capHit: false });
    expect(report.sources).toEqual([]);
    expect(report.failingSources).toEqual([]);
    expect(report.catchAllNeighborhoods).toEqual([]);
    expect(report.promotionSuggestions).toEqual([]);
  });
});

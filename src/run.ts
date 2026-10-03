import type { RunConfig } from "./config.js";
import type { Dataset } from "./dataset.js";
import type { Registry } from "./registry.js";
import type { Ports } from "./ports.js";
import type { RunReport } from "./report.js";
import { toLocalDate, toLocalIso } from "./time.js";

export interface RunInput {
  config: RunConfig;
  dataset: Dataset;
  registry: Registry;
  ports: Ports;
}

export interface RunOutput {
  dataset: Dataset;
  report: RunReport;
}

/**
 * One run of the research job: a function over values and ports that returns the new
 * dataset and the run report. It performs no I/O of its own.
 */
export async function run({ config, dataset, ports }: RunInput): Promise<RunOutput> {
  const startedAt = ports.clock.now();
  const startedIso = toLocalIso(startedAt, config.timezone);

  const finishedIso = toLocalIso(ports.clock.now(), config.timezone);

  const report: RunReport = {
    runDate: toLocalDate(startedAt, config.timezone),
    startedAt: startedIso,
    finishedAt: finishedIso,
    horizonWeeks: config.horizonWeeks,
    counts: {
      found: 0,
      new: 0,
      updated: 0,
      reverified: 0,
      heldUnverified: 0,
      expired: { past: 0, "two-strike": 0, cancelled: 0 },
    },
    spend: { totalUsd: 0, capUsd: config.spendCapUsd, capHit: false },
    sources: [],
    failingSources: [],
    catchAllNeighborhoods: [],
    promotionSuggestions: [],
  };

  return {
    dataset: {
      ...dataset,
      generatedAt: finishedIso,
      lastSuccessfulRun: finishedIso,
    },
    report,
  };
}

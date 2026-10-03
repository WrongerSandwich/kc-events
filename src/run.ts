import type { RunConfig } from "./config.js";
import type { Dataset, SourceState } from "./dataset.js";
import type { Registry, Source } from "./registry.js";
import type { FetchPort, FetchResult, Ports } from "./ports.js";
import type { RunReport, SourceReport } from "./report.js";
import { toLocalDate, toLocalIso } from "./time.js";

/** Consecutive failed runs after which a source is flagged in the report. */
const FAILING_SOURCE_THRESHOLD = 3;

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
export async function run({ config, dataset, registry, ports }: RunInput): Promise<RunOutput> {
  const startedAt = ports.clock.now();
  const startedIso = toLocalIso(startedAt, config.timezone);

  const registryLane = await checkRegistry(registry, dataset.sourceState, ports.fetcher);

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
    sources: registryLane.sourceReports,
    failingSources: registryLane.failingSources,
    unmappableNeighborhoods: [],
    promotionSuggestions: [],
  };

  return {
    dataset: {
      ...dataset,
      sourceState: registryLane.sourceState,
      generatedAt: finishedIso,
      lastSuccessfulRun: finishedIso,
    },
    report,
  };
}

/**
 * The registry lane's fetching: checks every active source, skips excluded ones, and carries
 * each source's consecutive failure count forward. A blocked source's count is left alone:
 * it is neither a success nor a transient failure.
 */
async function checkRegistry(registry: Registry, previous: Record<string, SourceState>, fetcher: FetchPort) {
  const sourceReports: SourceReport[] = [];
  const sourceState = { ...previous };
  const failuresOf = (name: string) => sourceState[name]?.consecutiveFailures ?? 0;

  for (const source of registry.sources) {
    if (source.status === "excluded") {
      sourceReports.push({ name: source.name, result: "excluded", extracted: 0, detail: source.reason });
      continue;
    }
    const checked = await checkSource(source, fetcher);
    sourceReports.push(checked);
    if (checked.result === "fetched") sourceState[source.name] = { consecutiveFailures: 0 };
    if (checked.result === "failed") sourceState[source.name] = { consecutiveFailures: failuresOf(source.name) + 1 };
  }

  const failingSources = registry.sources
    .filter((s) => s.status === "active" && failuresOf(s.name) >= FAILING_SOURCE_THRESHOLD)
    .map((s) => s.name);
  return { sourceReports, sourceState, failingSources };
}

/**
 * Fetches every URL of one active source, honoring robots.txt, and reports how it went.
 * Any failed URL marks the source failed, so it can still reach the failing-source flag;
 * otherwise a URL blocked by robots.txt marks it blocked, so Evan decides what to do.
 * The detail names every failed and blocked URL either way.
 */
async function checkSource(source: Source, fetcher: FetchPort): Promise<SourceReport> {
  const blocked: string[] = [];
  const failed: string[] = [];
  for (const url of source.urls) {
    let page: FetchResult;
    try {
      page = await fetcher.fetch(url);
    } catch (error) {
      failed.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!page.robotsAllowed) blocked.push(url);
    else if (page.status < 200 || page.status >= 300) failed.push(`${url}: HTTP ${page.status}`);
  }

  const report: SourceReport = { name: source.name, result: "fetched", extracted: 0 };
  const problems = [...failed, ...(blocked.length > 0 ? [`robots.txt disallows ${blocked.join(", ")}`] : [])];
  if (failed.length > 0) return { ...report, result: "failed", detail: problems.join("; ") };
  if (blocked.length > 0) return { ...report, result: "blocked", detail: problems.join("; ") };
  return report;
}

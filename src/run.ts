import type { RunConfig } from "./config.js";
import type { Dataset, Event, SourceState } from "./dataset.js";
import { buildExtractionRequest, candidateToEvent, extractionReplySchema, normalizeUrl, type ExtractionContext } from "./extraction.js";
import { sameEvent } from "./identity.js";
import type { Registry, Source } from "./registry.js";
import type { FetchPort, FetchResult, ModelPort, Ports } from "./ports.js";
import type { RunReport, SourceReport } from "./report.js";
import { toLocalDate, toLocalIso } from "./time.js";

/** Consecutive failed runs after which a source is flagged in the report. */
const FAILING_SOURCE_THRESHOLD = 3;

/** The editable prompt documents, read by the CLI and passed in as values. */
export interface Prompts {
  /** The extraction rules document, sent with every extraction call. */
  extractionRules: string;
}

export interface RunInput {
  config: RunConfig;
  prompts: Prompts;
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
export async function run({ config, prompts, dataset, registry, ports }: RunInput): Promise<RunOutput> {
  const startedAt = ports.clock.now();
  const startedIso = toLocalIso(startedAt, config.timezone);

  const registryLane = await checkRegistry(registry, dataset.sourceState, ports.fetcher);
  const extraction = await extractFromPages(registryLane.pages, ports.model, {
    config,
    rules: prompts.extractionRules,
    today: toLocalDate(startedAt, config.timezone),
    nowIso: startedIso,
    fetchedUrls: new Set(registryLane.pages.flatMap(({ page }) => [page.url, page.finalUrl]).map((u) => normalizeUrl(u, u))),
  });
  const sourceReports = registryLane.sourceReports.map((report) => withExtraction(report, extraction.bySource.get(report.name)));
  const merged = mergeEvents(dataset.events, extraction.events);

  const finishedIso = toLocalIso(ports.clock.now(), config.timezone);

  const report: RunReport = {
    runDate: toLocalDate(startedAt, config.timezone),
    startedAt: startedIso,
    finishedAt: finishedIso,
    horizonWeeks: config.horizonWeeks,
    counts: {
      found: merged.counts.found,
      new: merged.counts.new,
      updated: merged.counts.updated,
      reverified: 0,
      heldUnverified: merged.counts.heldUnverified,
      expired: { past: 0, "two-strike": 0, cancelled: 0 },
    },
    // Spend is summed from every call; stopping at the cap arrives with #7.
    spend: { totalUsd: extraction.spendUsd, capUsd: config.spendCapUsd, capHit: false },
    sources: sourceReports,
    failingSources: registryLane.failingSources,
    unmappableNeighborhoods: [],
    promotionSuggestions: [],
  };

  return {
    dataset: {
      ...dataset,
      events: merged.events,
      sourceState: registryLane.sourceState,
      generatedAt: finishedIso,
      lastSuccessfulRun: finishedIso,
    },
    report,
  };
}

/** A page fetched from a registry source this run, ready for extraction. */
interface SourcePage {
  source: Source;
  page: FetchResult;
}

/**
 * The registry lane's fetching: checks every active source, skips excluded ones, and carries
 * each source's consecutive failure count forward. A blocked source's count is left alone:
 * it is neither a success nor a transient failure.
 */
async function checkRegistry(registry: Registry, previous: Record<string, SourceState>, fetcher: FetchPort) {
  const sourceReports: SourceReport[] = [];
  const pages: SourcePage[] = [];
  const sourceState = { ...previous };
  const failuresOf = (name: string) => sourceState[name]?.consecutiveFailures ?? 0;

  for (const source of registry.sources) {
    if (source.status === "excluded") {
      sourceReports.push({ name: source.name, result: "excluded", extracted: 0, detail: source.reason });
      continue;
    }
    const checked = await checkSource(source, fetcher);
    sourceReports.push(checked.report);
    pages.push(...checked.pages.map((page) => ({ source, page })));
    if (checked.report.result === "fetched") sourceState[source.name] = { consecutiveFailures: 0 };
    if (checked.report.result === "failed") sourceState[source.name] = { consecutiveFailures: failuresOf(source.name) + 1 };
  }

  const failingSources = registry.sources
    .filter((s) => s.status === "active" && failuresOf(s.name) >= FAILING_SOURCE_THRESHOLD)
    .map((s) => s.name);
  return { sourceReports, sourceState, failingSources, pages };
}

/**
 * Fetches every URL of one active source, honoring robots.txt, and reports how it went.
 * Any failed URL marks the source failed, so it can still reach the failing-source flag;
 * otherwise a URL blocked by robots.txt marks it blocked, so Evan decides what to do.
 * The detail names every failed and blocked URL either way. Pages that did come back are
 * returned for extraction whatever the source's overall result.
 */
async function checkSource(source: Source, fetcher: FetchPort): Promise<{ report: SourceReport; pages: FetchResult[] }> {
  const blocked: string[] = [];
  const failed: string[] = [];
  const pages: FetchResult[] = [];
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
    else pages.push(page);
  }

  const report: SourceReport = { name: source.name, result: "fetched", extracted: 0 };
  const problems = [...failed, ...(blocked.length > 0 ? [`robots.txt disallows ${blocked.join(", ")}`] : [])];
  if (failed.length > 0) return { report: { ...report, result: "failed", detail: problems.join("; ") }, pages };
  if (blocked.length > 0) return { report: { ...report, result: "blocked", detail: problems.join("; ") }, pages };
  return { report, pages };
}

/** What extraction made of one source's pages this run. */
interface SourceExtraction {
  extracted: number;
  problems: string[];
}

/**
 * Hands every fetched page to the extraction model with the rules document and turns the
 * candidates into events under cite-or-drop. A reply that fails validation yields no events
 * from that page; a candidate with no title cannot be an event; a candidate the page says is
 * cancelled is nothing to publish (expiring an existing event on that word arrives with #5).
 */
async function extractFromPages(pages: SourcePage[], model: ModelPort, context: ExtractionContext) {
  const events: Event[] = [];
  const bySource = new Map<string, SourceExtraction>();
  let spendUsd = 0;

  for (const { source, page } of pages) {
    const outcome = bySource.get(source.name) ?? { extracted: 0, problems: [] };
    bySource.set(source.name, outcome);

    const reply = await model.complete(buildExtractionRequest(page, source, context));
    spendUsd += reply.costUsd;

    const parsed = extractionReplySchema.safeParse(reply.value);
    if (!parsed.success) {
      outcome.problems.push(`extraction reply for ${page.finalUrl} was not in the expected shape`);
      continue;
    }
    const origin = { source, pageUrl: normalizeUrl(page.finalUrl, page.finalUrl) };
    for (const candidate of parsed.data.events) {
      outcome.extracted++;
      if (candidate.title.trim() === "") {
        outcome.problems.push(`a candidate on ${page.finalUrl} had no title and was skipped`);
        continue;
      }
      if (candidate.notice === "cancelled") continue;
      events.push(candidateToEvent(candidate, origin, context));
    }
  }

  return { events, spendUsd, bySource };
}

function withExtraction(report: SourceReport, extraction: SourceExtraction | undefined): SourceReport {
  if (!extraction) return report;
  const detail = [report.detail, ...extraction.problems].filter(Boolean).join("; ");
  return { ...report, extracted: extraction.extracted, ...(detail ? { detail } : {}) };
}

/**
 * Folds this run's events into the dataset. An event matching one already known (same primary
 * page and normalized title, ADR 0007) refreshes that record and keeps its id, first-seen, and
 * lead; a sighting that could not be verified leaves a known record alone, since whether it
 * should lose its standing is re-verification's call (#5). The rest are new.
 */
function mergeEvents(existing: Event[], found: Event[]) {
  const events = [...existing];
  const touched = new Set<string>();
  const refreshed = new Set<string>();
  let created = 0;

  for (const event of found) {
    const index = events.findIndex((known) => sameEvent(known, event));
    const known = index === -1 ? undefined : events[index];
    if (!known) {
      events.push(event);
      touched.add(event.id);
      created++;
      continue;
    }
    touched.add(known.id);
    if (event.status === "active") {
      events[index] = { ...event, id: known.id, firstSeen: known.firstSeen, lead: known.lead };
      refreshed.add(known.id);
    }
  }

  const heldUnverified = events.filter((e) => touched.has(e.id) && e.status === "unverified").length;
  return { events, counts: { found: touched.size, new: created, updated: refreshed.size, heldUnverified } };
}

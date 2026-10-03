import type { RunConfig } from "./config.js";
import type { Dataset, Event, SourceState } from "./dataset.js";
import { buildExtractionRequest, candidateToEvent, extractionReplySchema, normalizeUrl } from "./extraction.js";
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
  const extraction = await extractFromPages(registryLane.pages, registryLane.sourceReports, {
    config,
    rules: prompts.extractionRules,
    today: toLocalDate(startedAt, config.timezone),
    nowIso: startedIso,
    model: ports.model,
  });
  const merged = mergeCandidates(dataset.events, extraction.events);

  const finishedIso = toLocalIso(ports.clock.now(), config.timezone);

  const report: RunReport = {
    runDate: toLocalDate(startedAt, config.timezone),
    startedAt: startedIso,
    finishedAt: finishedIso,
    horizonWeeks: config.horizonWeeks,
    counts: {
      found: extraction.events.length,
      new: merged.counts.new,
      updated: merged.counts.updated,
      reverified: 0,
      heldUnverified: extraction.events.filter((e) => e.status === "unverified").length,
      expired: { past: 0, "two-strike": 0, cancelled: extraction.events.filter((e) => e.expiryReason === "cancelled").length },
    },
    spend: { totalUsd: extraction.spendUsd, capUsd: config.spendCapUsd, capHit: false },
    sources: registryLane.sourceReports,
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

interface ExtractionRun {
  config: RunConfig;
  rules: string;
  today: string;
  nowIso: string;
  model: ModelPort;
}

/**
 * Hands every fetched page to the extraction model with the rules document and turns the
 * candidates into events under cite-or-drop. Each source's report gets its extracted count.
 * A reply that fails validation yields no events from that page and is noted on the source.
 */
async function extractFromPages(pages: SourcePage[], sourceReports: SourceReport[], extraction: ExtractionRun) {
  const fetchedUrls = new Set(pages.flatMap(({ page }) => [page.url, page.finalUrl]).map((u) => normalizeUrl(u) ?? u));
  const events: Event[] = [];
  let spendUsd = 0;

  for (const { source, page } of pages) {
    const report = sourceReports.find((r) => r.name === source.name)!;
    const request = buildExtractionRequest(page, source, extraction);
    const reply = await extraction.model.complete(request);
    spendUsd += reply.costUsd;

    const parsed = extractionReplySchema.safeParse(reply.value);
    if (!parsed.success) {
      report.detail = [report.detail, `extraction reply for ${page.finalUrl} was not in the expected shape`].filter(Boolean).join("; ");
      continue;
    }
    const pageUrl = normalizeUrl(page.finalUrl) ?? page.finalUrl;
    for (const candidate of parsed.data.events) {
      events.push(candidateToEvent(candidate, { source, pageUrl, fetchedUrls, nowIso: extraction.nowIso, timezone: extraction.config.timezone }));
    }
    report.extracted += parsed.data.events.length;
  }

  return { events, spendUsd };
}

/**
 * Folds this run's events into the dataset. An event whose id is already known (same primary
 * page and title, ADR 0007) refreshes that record and keeps its first-seen and lead; the rest
 * are new. Fuzzy matching and re-verification arrive with #5.
 */
function mergeCandidates(existing: Event[], found: Event[]) {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const counts = { new: 0, updated: 0 };
  const seenThisRun = new Set<string>();

  for (const event of found) {
    if (seenThisRun.has(event.id)) continue;
    seenThisRun.add(event.id);
    const known = byId.get(event.id);
    if (known) {
      byId.set(event.id, { ...event, firstSeen: known.firstSeen, lead: known.lead, lastVerified: event.lastVerified ?? known.lastVerified });
      counts.updated++;
    } else {
      byId.set(event.id, event);
      counts.new++;
    }
  }
  return { events: [...byId.values()], counts };
}

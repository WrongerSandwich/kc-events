import type { RunConfig } from "./config.js";
import type { Dataset, Event, ExpiryReason, SourceState } from "./dataset.js";
import { expire, expirePast, isPast, strike } from "./expiry.js";
import {
  buildExtractionRequest,
  candidateToSighting,
  extractionReplySchema,
  normalizeUrl,
  type ExtractionContext,
  type Sighting,
} from "./extraction.js";
import { findMatch, normalizeName, sameName } from "./identity.js";
import type { Registry, Source } from "./registry.js";
import type { FetchPort, FetchResult, ModelPort, Ports } from "./ports.js";
import type { RunReport, SourceReport } from "./report.js";
import { capSpend, SpendCapReached, type CappedModel } from "./spend.js";
import { neighborhoodList } from "./taxonomy.js";
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

  const today = toLocalDate(startedAt, config.timezone);
  // Every model call goes through the cap, whatever stage makes it.
  const model = capSpend(ports.model, config.spendCapUsd);
  const registryLane = await checkRegistry(registry, dataset.sourceState, ports.fetcher);
  const fetchedUrls = new Set(registryLane.pages.flatMap(({ page }) => [page.url, page.finalUrl]).map((u) => normalizeUrl(u, u)));
  const extractionContext: ExtractionContext = {
    config,
    rules: prompts.extractionRules,
    today,
    nowIso: startedIso,
    fetchedUrls,
    neighborhoods: neighborhoodList(config, registry),
  };
  const extraction = await extractFromPages(registryLane.pages, model, extractionContext);
  const sourceReports = registryLane.sourceReports.map((report) => withExtraction(report, extraction.bySource.get(report.name)));
  const merged = mergeSightings(dataset.events, extraction.sightings, today);
  // Past events expire before re-verification, so nothing is fetched to check a date already gone.
  const current = merged.events.map((e) => expirePast(e, today));
  const laneOutcome = { touched: merged.touched, triedUrls: registryLane.triedUrls, unreadUrls: extraction.unreadUrls };
  const reverified = await reverify(current, laneOutcome, registry, { ...ports, model }, extractionContext);
  const events = markChanged(dataset.events, reverified.events, startedIso);

  const finishedIso = toLocalIso(ports.clock.now(), config.timezone);

  const report: RunReport = {
    runDate: today,
    startedAt: startedIso,
    finishedAt: finishedIso,
    horizonWeeks: config.horizonWeeks,
    counts: {
      found: merged.counts.found,
      new: merged.counts.new,
      updated: merged.counts.updated,
      reverified: reverified.reverified,
      heldUnverified: merged.counts.heldUnverified,
      outsideGeography: extraction.outsideGeography + reverified.outsideGeography,
      expired: countExpired(dataset.events, events),
    },
    spend: {
      totalUsd: model.totalUsd(),
      capUsd: config.spendCapUsd,
      // Hit means the cap cut something; a last call that merely crossed it cut nothing.
      capHit: extraction.pagesNotExtracted + reverified.notReverified > 0,
      shortfall: { pagesNotExtracted: extraction.pagesNotExtracted, eventsNotReverified: reverified.notReverified },
    },
    sources: sourceReports,
    failingSources: registryLane.failingSources,
    unmappableNeighborhoods: unmappableNeighborhoods([...extraction.sightings, ...reverified.sightings]),
    promotionSuggestions: [],
  };

  return {
    dataset: {
      ...dataset,
      events,
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
  const triedUrls = new Set<string>();
  const sourceState = { ...previous };
  const failuresOf = (name: string) => sourceState[name]?.consecutiveFailures ?? 0;

  for (const source of registry.sources) {
    if (source.status === "excluded") {
      sourceReports.push({ name: source.name, result: "excluded", extracted: 0, detail: source.reason });
      continue;
    }
    const checked = await checkSource(source, fetcher);
    for (const url of [...source.urls, ...checked.pages.map((p) => p.finalUrl)]) triedUrls.add(normalizeUrl(url, url));
    sourceReports.push(checked.report);
    pages.push(...checked.pages.map((page) => ({ source, page })));
    if (checked.report.result === "fetched") sourceState[source.name] = { consecutiveFailures: 0 };
    if (checked.report.result === "failed") sourceState[source.name] = { consecutiveFailures: failuresOf(source.name) + 1 };
  }

  const failingSources = registry.sources
    .filter((s) => s.status === "active" && failuresOf(s.name) >= FAILING_SOURCE_THRESHOLD)
    .map((s) => s.name);
  return { sourceReports, sourceState, failingSources, pages, triedUrls };
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
 * candidates into sightings under cite-or-drop. A reply that fails validation yields nothing
 * from that page. Once the spend cap refuses a call, every page left is counted as not extracted;
 * like an unreadable reply, that tells nothing about the events on it.
 */
async function extractFromPages(pages: SourcePage[], model: ModelPort, context: ExtractionContext) {
  const sightings: Sighting[] = [];
  const bySource = new Map<string, SourceExtraction>();
  const unreadUrls = new Set<string>();
  let outsideGeography = 0;
  let pagesNotExtracted = 0;
  const markUnread = (page: FetchResult) => {
    for (const url of [page.url, page.finalUrl]) unreadUrls.add(normalizeUrl(url, url));
  };

  for (const { source, page } of pages) {
    const outcome = bySource.get(source.name) ?? { extracted: 0, problems: [] };
    bySource.set(source.name, outcome);
    let read: Awaited<ReturnType<typeof extractPage>>;
    try {
      read = await extractPage(page, source, model, context);
    } catch (error) {
      if (!(error instanceof SpendCapReached)) throw error;
      pagesNotExtracted++;
      markUnread(page);
      outcome.problems.push(`${page.finalUrl} not extracted: spend cap reached`);
      continue;
    }
    outsideGeography += read.outsideGeography;
    if (read.sightings) sightings.push(...read.sightings);
    else markUnread(page);
    outcome.extracted += read.extracted;
    outcome.problems.push(...read.problems);
  }

  return { sightings, outsideGeography, pagesNotExtracted, bySource, unreadUrls };
}

/**
 * One extraction call over one page. Sightings are absent when the reply could not be read. A
 * candidate with no title cannot be an event; one outside the geography is dropped and counted.
 */
async function extractPage(
  page: FetchResult,
  source: Source,
  model: ModelPort,
  context: ExtractionContext,
): Promise<{ sightings?: Sighting[]; extracted: number; outsideGeography: number; problems: string[] }> {
  const reply = await model.complete(buildExtractionRequest(page, source, context));
  const parsed = extractionReplySchema.safeParse(reply.value);
  if (!parsed.success) {
    return {
      extracted: 0,
      outsideGeography: 0,
      problems: [`extraction reply for ${page.finalUrl} was not in the expected shape`],
    };
  }
  const origin = { source, pageUrl: normalizeUrl(page.finalUrl, page.finalUrl) };
  const sightings: Sighting[] = [];
  const problems: string[] = [];
  let outsideGeography = 0;
  for (const candidate of parsed.data.events) {
    if (candidate.title.trim() === "") {
      problems.push(`a candidate on ${page.finalUrl} had no title and was skipped`);
      continue;
    }
    if (candidate.outsideGeography) {
      outsideGeography++;
      continue;
    }
    sightings.push(candidateToSighting(candidate, origin, context));
  }
  return { sightings, extracted: parsed.data.events.length, outsideGeography, problems };
}

function withExtraction(report: SourceReport, extraction: SourceExtraction | undefined): SourceReport {
  if (!extraction) return report;
  const detail = [report.detail, ...extraction.problems].filter(Boolean).join("; ");
  return { ...report, extracted: extraction.extracted, ...(detail ? { detail } : {}) };
}

/**
 * Folds this run's sightings into the dataset. A sighting matching a known event (ADR 0007)
 * is applied to it; an unmatched one is new, unless it is cancelled or already past: nothing
 * to publish. Matching includes expired events, so a page listing one again revives it under
 * its old id rather than starting a duplicate.
 */
function mergeSightings(existing: Event[], sightings: Sighting[], today: string) {
  const events = [...existing];
  const touched = new Set<string>();
  const refreshed = new Set<string>();
  const created = new Set<string>();

  for (const { event, cancelled } of sightings) {
    const known = findMatch(event, events);
    if (!known) {
      if (cancelled || isPast(event, today)) continue;
      events.push(event);
      touched.add(event.id);
      created.add(event.id);
      continue;
    }
    touched.add(known.id);
    const applied = applySighting(known, { event, cancelled });
    events[events.indexOf(known)] = applied.event;
    if (applied.refreshed && !created.has(known.id)) refreshed.add(known.id);
  }

  const heldUnverified = events.filter((e) => touched.has(e.id) && e.status === "unverified").length;
  return { events, touched, counts: { found: touched.size, new: created.size, updated: refreshed.size, heldUnverified } };
}

/**
 * What a sighting of a known event does to it: a page saying cancelled expires it (an event
 * already expired keeps its reason); a verified reading refreshes it; a reading with nothing
 * citable leaves it as it was, except that the page still lists it, so it is not missing and
 * any strike is cleared.
 */
function applySighting(known: Event, { event, cancelled }: Sighting): { event: Event; refreshed: boolean } {
  if (cancelled) return { event: known.status === "expired" ? known : expire(known, "cancelled"), refreshed: false };
  if (event.status === "active") return { event: refresh(known, event), refreshed: true };
  return { event: known.verificationFailures === 0 ? known : { ...known, verificationFailures: 0 }, refreshed: false };
}

/** A known event re-read from a page: the new reading, under the known event's identity and curation. */
function refresh(known: Event, sighting: Event): Event {
  return {
    ...sighting,
    id: known.id,
    firstSeen: known.firstSeen,
    lead: known.lead,
    dontMiss: known.dontMiss,
    ...(known.whyLine !== undefined ? { whyLine: known.whyLine } : {}),
    ...(known.lastChanged !== undefined ? { lastChanged: known.lastChanged } : {}),
  };
}

/**
 * Re-verification: every active event the registry lane did not sight is checked against its
 * primary page. A page the registry lane already tried this run is not fetched again: if it was
 * read, the event is missing from it; if it failed, it failed. Either way that is a strike, as
 * is a re-fetch that fails or a page that no longer lists the event. A page that does list it
 * applies the sighting as in the registry lane. When the model's reply about a page could not be
 * read, nothing is known either way and the event is left alone: a bad reply is not a dead page.
 * Once the spend cap is reached, pages still to check are not fetched and their events are left
 * alone too, counted as not re-verified.
 */
async function reverify(
  events: Event[],
  lane: RegistryLaneOutcome,
  registry: Registry,
  ports: Ports & { model: CappedModel },
  context: ExtractionContext,
) {
  const pending = events.filter((e) => e.status === "active" && !lane.touched.has(e.id) && !lane.unreadUrls.has(e.primaryUrl));
  const sightingsAt = new Map<string, Sighting[]>();
  const refreshed = new Set<string>();
  let outsideGeography = 0;
  let notReverified = 0;

  for (const url of new Set(pending.map((e) => e.primaryUrl))) {
    if (lane.triedUrls.has(url)) {
      sightingsAt.set(url, []);
      continue;
    }
    if (ports.model.exhausted()) {
      notReverified += pending.filter((e) => e.primaryUrl === url).length;
      continue;
    }
    const page = await fetchPage(url, ports.fetcher);
    if (!page) {
      sightingsAt.set(url, []);
      continue;
    }
    const event = pending.find((e) => e.primaryUrl === url)!;
    const pageUrls = new Set([url, normalizeUrl(page.finalUrl, url)]);
    const read = await extractPage(page, sourceFor(event, url, registry), ports.model, { ...context, fetchedUrls: pageUrls });
    outsideGeography += read.outsideGeography;
    if (read.sightings) sightingsAt.set(url, read.sightings);
  }

  const checked = events.map((event) => {
    const sightings = sightingsAt.get(event.primaryUrl);
    if (!pending.includes(event) || !sightings) return event;
    const sighting = sightings.find((s) => findMatch(s.event, [event]));
    if (!sighting) return strike(event);
    const applied = applySighting(event, sighting);
    if (applied.refreshed) refreshed.add(event.id);
    return applied.event;
  });
  return { events: checked, reverified: refreshed.size, notReverified, outsideGeography, sightings: [...sightingsAt.values()].flat() };
}

/** What the registry lane leaves for re-verification: which events it sighted and which pages it tried. */
interface RegistryLaneOutcome {
  touched: Set<string>;
  /** Every URL the lane requested or was redirected to, normalized, whether or not it came back. */
  triedUrls: Set<string>;
  /** Pages that came back but whose extraction reply could not be read. */
  unreadUrls: Set<string>;
}

/** A page that came back readable, or nothing: a network error, a non-2xx status, or a robots.txt block. */
async function fetchPage(url: string, fetcher: FetchPort): Promise<FetchResult | undefined> {
  try {
    const page = await fetcher.fetch(url);
    return page.robotsAllowed && page.status >= 200 && page.status < 300 ? page : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The source an event's page is read as: its registry source when it has one, otherwise the
 * event's own kind and neighborhood standing in, so the extraction request has the same shape.
 */
function sourceFor(event: Event, url: string, registry: Registry): Source {
  const lead = event.lead;
  const registered = lead.lane === "registry" ? registry.sources.find((s) => s.name === lead.source) : undefined;
  return (
    registered ?? {
      name: lead.lane === "registry" ? lead.source : `discovery: ${lead.query}`,
      urls: [url],
      kind: event.kind,
      neighborhood: event.neighborhood,
      status: "active",
    }
  );
}

/**
 * Stamps last-changed on every event that is new this run or whose date (a recurring event's
 * schedule), venue, or status differs from the dataset it started from, so curation knows what
 * to re-judge. A venue spelled with different case or punctuation is the same venue.
 */
function markChanged(previous: Event[], events: Event[], nowIso: string): Event[] {
  const before = new Map(previous.map((e) => [e.id, e]));
  return events.map((event) => {
    const was = before.get(event.id);
    const changed =
      !was ||
      was.start !== event.start ||
      was.end !== event.end ||
      was.schedule !== event.schedule ||
      !sameName(was.venue, event.venue) ||
      was.status !== event.status;
    return changed ? { ...event, lastChanged: nowIso } : event;
  });
}

/** How many events became expired this run, by reason. */
function countExpired(previous: Event[], events: Event[]): Record<ExpiryReason, number> {
  const wasExpired = new Set(previous.filter((e) => e.status === "expired").map((e) => e.id));
  const counts: Record<ExpiryReason, number> = { past: 0, "two-strike": 0, cancelled: 0 };
  for (const e of events) if (e.status === "expired" && e.expiryReason && !wasExpired.has(e.id)) counts[e.expiryReason]++;
  return counts;
}

/**
 * The run report's unmappable neighborhoods: every sighting this run whose address landed in the
 * catch-all, once per title and venue. A cancelled sighting has nothing to place.
 */
function unmappableNeighborhoods(sightings: Sighting[]): RunReport["unmappableNeighborhoods"] {
  const seen = new Set<string>();
  const flagged: RunReport["unmappableNeighborhoods"] = [];
  for (const { event, cancelled, unmappable } of sightings) {
    const key = `${normalizeName(event.title)}\n${normalizeName(event.venue ?? "")}`;
    if (!unmappable || cancelled || seen.has(key)) continue;
    seen.add(key);
    flagged.push({ eventTitle: event.title, ...(event.venue !== undefined ? { venue: event.venue } : {}), ...unmappable });
  }
  return flagged;
}

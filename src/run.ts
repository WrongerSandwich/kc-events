import type { RunConfig } from "./config.js";
import type { Dataset, Event, ExpiryReason, SourceState } from "./dataset.js";
import { expire, expirePast, hiddenByOutage, isPast, outage, strike } from "./expiry.js";
import {
  buildExtractionRequest,
  candidateToSighting,
  extractionReplySchema,
  normalizeUrl,
  type ExtractionContext,
  type PageOrigin,
  type Sighting,
} from "./extraction.js";
import { applyJudgment, buildCurationRequest, CURATION_BATCH_SIZE, curationReplySchema, needsCuration, type CurationContext } from "./curation.js";
import { discoveryQueries, hostOf, isLead, onHost, outboundLinks, trackDiscoveryHosts } from "./discovery.js";
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
  /** The curation prompt document, sent with every curation call. */
  curationPrompt: string;
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
  assertSomethingFetched(registryLane.sourceReports);
  // An aggregator page is never a primary page, so nothing can be cited to one even if the registry fetched it.
  const fetchedUrls = new Set(
    registryLane.pages
      .flatMap(({ page }) => [page.url, page.finalUrl])
      .map((u) => normalizeUrl(u, u))
      .filter((u) => !onHost(u, config.discovery.aggregatorHosts)),
  );
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
  // Discovery runs after the registry lane, so a page the registry already read is not read again.
  const discovery = await discover({ ...ports, model }, extractionContext, registryLane.triedUrls);
  // Registry sightings merge first: an event both lanes found keeps its registry lead.
  const merged = mergeSightings(dataset.events, [...extraction.sightings, ...discovery.sightings], today);
  // Past events expire before re-verification, so nothing is fetched to check a date already gone.
  const current = merged.events.map((e) => expirePast(e, today));
  const laneOutcome = {
    touched: merged.touched,
    triedUrls: new Set([...registryLane.triedUrls, ...discovery.triedUrls]),
    outageUrls: new Set([...registryLane.outageUrls, ...discovery.outageUrls]),
    unreadUrls: new Set([...extraction.unreadUrls, ...discovery.unreadUrls]),
  };
  const reverified = await reverify(current, laneOutcome, registry, { ...ports, model }, extractionContext);
  const changed = markChanged(dataset.events, reverified.events, startedIso);
  const curation = await curate(changed, model, { config, curationPrompt: prompts.curationPrompt, today }, startedIso);
  const events = curation.events;
  const promotion = trackDiscoveryHosts(dataset.discoveryState, discovery.hosts, { registry, config }, startedIso);
  const shortfall = {
    pagesNotExtracted: extraction.pagesNotExtracted + discovery.pagesNotExtracted,
    eventsNotReverified: reverified.notReverified,
    queriesNotSearched: discovery.queriesNotSearched,
    leadsNotFollowed: discovery.leadsNotFollowed,
    eventsNotCurated: curation.notCurated,
  };

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
      heldThroughOutage: reverified.heldThroughOutage,
      unverifiedByOutageLimit: reverified.outageLimited.length,
      outsideGeography: extraction.outsideGeography + discovery.outsideGeography + reverified.outsideGeography,
      expired: countExpired(dataset.events, events),
    },
    spend: {
      totalUsd: model.totalUsd(),
      capUsd: config.spendCapUsd,
      // Hit means the cap cut something; a last call that merely crossed it cut nothing.
      capHit: Object.values(shortfall).some((n) => n > 0),
      shortfall,
    },
    discovery: discovery.report,
    curation: curation.report,
    sources: sourceReports,
    failingSources: registryLane.failingSources,
    unmappableNeighborhoods: unmappableNeighborhoods([...extraction.sightings, ...discovery.sightings, ...reverified.sightings]),
    promotionSuggestions: promotion.promotionSuggestions,
    outageLimited: reverified.outageLimited.map((e) => ({ title: e.title, primaryUrl: e.primaryUrl })),
  };

  return {
    dataset: {
      ...dataset,
      events,
      sourceState: registryLane.sourceState,
      discoveryState: promotion.discoveryState,
      generatedAt: finishedIso,
      lastSuccessfulRun: finishedIso,
    },
    report,
  };
}

/**
 * A run in which every active registry source failed is a broken network (a runner whose address
 * the venues block), not news about the sources: carried on, it would count an outage against
 * every active event and hide them all in three runs. It fails instead, before any model call, so the
 * CLI writes nothing and the last committed dataset stands. A partial outage is a normal run.
 */
function assertSomethingFetched(sourceReports: SourceReport[]): void {
  const checked = sourceReports.filter((r) => r.result !== "excluded");
  if (checked.length === 0 || !checked.every((r) => r.result === "failed")) return;
  const details = checked.map((r) => `  ${r.name}: ${r.detail ?? "failed"}`).join("\n");
  throw new Error(`none of the ${checked.length} active registry sources could be fetched; the run stops so no event is struck:\n${details}`);
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
  const outageUrls = new Set<string>();
  const sourceState = { ...previous };
  const failuresOf = (name: string) => sourceState[name]?.consecutiveFailures ?? 0;

  for (const source of registry.sources) {
    if (source.status === "excluded") {
      sourceReports.push({ name: source.name, result: "excluded", extracted: 0, detail: source.reason });
      continue;
    }
    const checked = await checkSource(source, fetcher);
    for (const url of [...source.urls, ...checked.pages.map((p) => p.finalUrl)]) triedUrls.add(normalizeUrl(url, url));
    for (const url of checked.outages) outageUrls.add(normalizeUrl(url, url));
    sourceReports.push(checked.report);
    pages.push(...checked.pages.map((page) => ({ source, page })));
    if (checked.report.result === "fetched") sourceState[source.name] = { consecutiveFailures: 0 };
    if (checked.report.result === "failed") sourceState[source.name] = { consecutiveFailures: failuresOf(source.name) + 1 };
  }

  const failingSources = registry.sources
    .filter((s) => s.status === "active" && failuresOf(s.name) >= FAILING_SOURCE_THRESHOLD)
    .map((s) => s.name);
  return { sourceReports, sourceState, failingSources, pages, triedUrls, outageUrls };
}

/**
 * Fetches every URL of one active source, honoring robots.txt, and reports how it went.
 * Any failed URL marks the source failed, so it can still reach the failing-source flag;
 * otherwise a URL blocked by robots.txt marks it blocked, so Evan decides what to do.
 * The detail names every failed and blocked URL either way. Pages that did come back are
 * returned for extraction whatever the source's overall result, and URLs that failed as an outage
 * are returned so re-verification does not strike the events on them.
 */
async function checkSource(source: Source, fetcher: FetchPort): Promise<{ report: SourceReport; pages: FetchResult[]; outages: string[] }> {
  const blocked: string[] = [];
  const failed: string[] = [];
  const outages: string[] = [];
  const pages: FetchResult[] = [];
  for (const url of source.urls) {
    const fetched = await fetchReadable(url, fetcher);
    if ("page" in fetched) {
      pages.push(fetched.page);
      continue;
    }
    if (fetched.failure === "disallowed") blocked.push(url);
    else failed.push(fetched.problem);
    if (fetched.failure === "outage") outages.push(url);
  }

  const report: SourceReport = { name: source.name, result: "fetched", extracted: 0 };
  const problems = [...failed, ...(blocked.length > 0 ? [`robots.txt disallows ${blocked.join(", ")}`] : [])];
  if (failed.length > 0) return { report: { ...report, result: "failed", detail: problems.join("; ") }, pages, outages };
  if (blocked.length > 0) return { report: { ...report, result: "blocked", detail: problems.join("; ") }, pages, outages };
  return { report, pages, outages };
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
    if (onHost(page.finalUrl, context.config.discovery.aggregatorHosts)) {
      outcome.problems.push(`${page.finalUrl} is an aggregator page and was not extracted`);
      continue;
    }
    let read: Awaited<ReturnType<typeof extractPage>>;
    try {
      read = await extractPage(page, { lane: "registry", source }, model, context);
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
  origin: PageOrigin,
  model: ModelPort,
  context: ExtractionContext,
): Promise<{ sightings?: Sighting[]; extracted: number; outsideGeography: number; problems: string[] }> {
  const reply = await model.complete(buildExtractionRequest(page, origin, context));
  const parsed = extractionReplySchema.safeParse(reply.value);
  if (!parsed.success) {
    return {
      extracted: 0,
      outsideGeography: 0,
      problems: [`extraction reply for ${page.finalUrl} was not in the expected shape`],
    };
  }
  const candidateOrigin = { ...origin, pageUrl: normalizeUrl(page.finalUrl, page.finalUrl) };
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
    sightings.push(candidateToSighting(candidate, candidateOrigin, context));
  }
  return { sightings, extracted: parsed.data.events.length, outsideGeography, problems };
}

function withExtraction(report: SourceReport, extraction: SourceExtraction | undefined): SourceReport {
  if (!extraction) return report;
  const detail = [report.detail, ...extraction.problems].filter(Boolean).join("; ");
  return { ...report, extracted: extraction.extracted, ...(detail ? { detail } : {}) };
}

/**
 * Folds this run's sightings into the dataset, registry lane first. A sighting matching a known
 * event (ADR 0007) is applied to it, unless the event was already read verified this run; an
 * unmatched one is new, unless it is cancelled or already past: nothing
 * to publish. Matching includes expired events, so a page listing one again revives it under
 * its old id rather than starting a duplicate.
 */
function mergeSightings(existing: Event[], sightings: Sighting[], today: string) {
  const events = [...existing];
  const touched = new Set<string>();
  const refreshed = new Set<string>();
  const created = new Set<string>();
  const readVerified = new Set<string>();

  for (const { event, cancelled } of sightings) {
    const known = findMatch(event, events);
    if (!known) {
      if (cancelled || isPast(event, today)) continue;
      events.push(event);
      touched.add(event.id);
      created.add(event.id);
      if (event.status === "active") readVerified.add(event.id);
      continue;
    }
    // The first verified reading this run stands; a later page listing the same event only confirms it.
    if (readVerified.has(known.id) && event.status === "active" && !cancelled) continue;
    touched.add(known.id);
    if (event.status === "active") readVerified.add(known.id);
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
 * any strike and any run of outages is cleared.
 */
function applySighting(known: Event, { event, cancelled }: Sighting): { event: Event; refreshed: boolean } {
  if (cancelled) return { event: known.status === "expired" ? known : expire(known, "cancelled"), refreshed: false };
  if (event.status === "active") return { event: refresh(known, event), refreshed: true };
  const cleared = known.verificationFailures === 0 && known.consecutiveOutages === 0;
  return { event: cleared ? known : { ...known, verificationFailures: 0, consecutiveOutages: 0 }, refreshed: false };
}

/**
 * A known event re-read from a page: the new reading, under the known event's identity and
 * curation. A reading that makes it recurring drops its flag: recurring events are never on
 * the don't-miss list, and curation will not look at it again.
 */
function refresh(known: Event, sighting: Event): Event {
  const curated = sighting.recurrence === "recurring" ? {} : { dontMiss: known.dontMiss, ...(known.whyLine !== undefined ? { whyLine: known.whyLine } : {}) };
  return {
    ...sighting,
    id: known.id,
    firstSeen: known.firstSeen,
    lead: known.lead,
    ...curated,
    ...(known.lastChanged !== undefined ? { lastChanged: known.lastChanged } : {}),
    ...(known.lastJudged !== undefined ? { lastJudged: known.lastJudged } : {}),
  };
}

/**
 * Re-verification: every active event neither lane sighted is checked against its primary page,
 * and so is every event outages hid (ADR 0008), each run until it is past. A primary page on an
 * aggregator is never fetched or read; that is a strike. A page either lane already tried this run
 * is not fetched again; it counts as that attempt ended. A page that loaded and no longer lists the
 * event is a strike, as is one that is gone or that robots.txt now disallows. A page that could not
 * be loaded is an outage (see fetchReadable): it holds an active event as it was, up to the outage limit. A page that
 * does list the event applies the sighting as in the registry lane, which revives a hidden event
 * whose reading is verified. When the model's reply about a page could not be read, nothing is
 * known either way and the event is left alone: a bad reply is not a dead page. Once the spend cap
 * is reached, pages still to check are not fetched and their events are left alone too, counted
 * as not re-verified.
 */
async function reverify(
  events: Event[],
  lane: LaneOutcome,
  registry: Registry,
  ports: Ports & { model: CappedModel },
  context: ExtractionContext,
) {
  const pending = events.filter(
    (e) => (e.status === "active" || hiddenByOutage(e)) && !lane.touched.has(e.id) && !lane.unreadUrls.has(e.primaryUrl),
  );
  const sightingsAt = new Map<string, Sighting[]>();
  const outageAt = new Set<string>();
  const refreshed = new Set<string>();
  let outsideGeography = 0;
  let notReverified = 0;

  for (const url of new Set(pending.map((e) => e.primaryUrl))) {
    // An aggregator page is never read, so it can never again show the event: a strike.
    if (onHost(url, context.config.discovery.aggregatorHosts)) {
      sightingsAt.set(url, []);
      continue;
    }
    if (lane.outageUrls.has(url)) {
      outageAt.add(url);
      continue;
    }
    if (lane.triedUrls.has(url)) {
      sightingsAt.set(url, []);
      continue;
    }
    if (ports.model.exhausted()) {
      notReverified += pending.filter((e) => e.primaryUrl === url).length;
      continue;
    }
    const fetched = await fetchReadable(url, ports.fetcher);
    if (!("page" in fetched)) {
      if (fetched.failure === "outage") outageAt.add(url);
      else sightingsAt.set(url, []);
      continue;
    }
    const { page } = fetched;
    const event = pending.find((e) => e.primaryUrl === url)!;
    const pageUrls = new Set([url, normalizeUrl(page.finalUrl, url)]);
    const read = await extractPage(page, originFor(event, url, registry), ports.model, { ...context, fetchedUrls: pageUrls });
    outsideGeography += read.outsideGeography;
    if (read.sightings) sightingsAt.set(url, read.sightings);
  }

  let heldThroughOutage = 0;
  const outageLimited: Event[] = [];
  const checked = events.map((event) => {
    if (!pending.includes(event)) return event;
    if (outageAt.has(event.primaryUrl)) {
      const held = outage(event);
      if (event.status === "active" && held.status === "active") heldThroughOutage++;
      if (event.status === "active" && held.status === "unverified") outageLimited.push(held);
      return held;
    }
    const sightings = sightingsAt.get(event.primaryUrl);
    if (!sightings) return event;
    const sighting = sightings.find((s) => findMatch(s.event, [event]));
    if (!sighting) return strike(event);
    const applied = applySighting(event, sighting);
    if (applied.refreshed) refreshed.add(event.id);
    return applied.event;
  });
  return {
    events: checked,
    reverified: refreshed.size,
    notReverified,
    outsideGeography,
    heldThroughOutage,
    outageLimited,
    sightings: [...sightingsAt.values()].flat(),
  };
}

/** What the two lanes leave for re-verification: which events they sighted and which pages they tried. */
interface LaneOutcome {
  touched: Set<string>;
  /** Every URL either lane requested or was redirected to, normalized, whether or not it came back. */
  triedUrls: Set<string>;
  /** Of those, the ones that could not be loaded: an outage, not a reading. */
  outageUrls: Set<string>;
  /** Pages that came back but whose extraction reply could not be read. */
  unreadUrls: Set<string>;
}

/** HTTP statuses that say a page is gone, which is a reading of it; any other failure is an outage. */
const GONE_STATUSES = new Set([404, 410]);

/**
 * A page that came back readable, or the problem with it and what kind of failure it was: an
 * outage (it could not be loaded: a thrown network error, which includes a robots.txt that could
 * not be reached, or a failing status), gone (404, 410), or disallowed by robots.txt.
 */
async function fetchReadable(
  url: string,
  fetcher: FetchPort,
): Promise<{ page: FetchResult } | { problem: string; failure: "outage" | "gone" | "disallowed" }> {
  try {
    const page = await fetcher.fetch(url);
    if (!page.robotsAllowed) return { problem: `robots.txt disallows ${url}`, failure: "disallowed" };
    if (page.status >= 200 && page.status < 300) return { page };
    return { problem: `${url}: HTTP ${page.status}`, failure: GONE_STATUSES.has(page.status) ? "gone" : "outage" };
  } catch (error) {
    return { problem: `${url}: ${error instanceof Error ? error.message : String(error)}`, failure: "outage" };
  }
}

/** What the discovery lane found, and what it leaves for merging, re-verification, and the report. */
interface DiscoveryLaneOutcome {
  sightings: Sighting[];
  /** Every primary page the lane requested or was redirected to, normalized; never an aggregator page read as an index. */
  triedUrls: Set<string>;
  /** Of those, the ones that could not be loaded. */
  outageUrls: Set<string>;
  /** Pages that came back but were not read: an unreadable reply, or the spend cap. */
  unreadUrls: Set<string>;
  /** Host to an example page, for every host whose page yielded an active event this run. */
  hosts: Map<string, string>;
  report: RunReport["discovery"];
  outsideGeography: number;
  pagesNotExtracted: number;
  queriesNotSearched: number;
  leadsNotFollowed: number;
}

/**
 * The discovery lane: each query goes through the search port and each result is a lead. A lead
 * on an aggregator host is fetched only to read its outbound links, which are followed as leads
 * in turn; its text never reaches extraction. Any other lead is a primary page, fetched (robots.txt
 * and all, as the fetcher always does) and extracted under the same cite-or-drop rules as the
 * registry lane, with the query as the lead of what it finds. A URL is followed once a run, and
 * not at all when the registry lane already tried it. Once the spend cap is reached, searches and
 * leads still to go are skipped and counted, so nothing is fetched that could not be read.
 */
async function discover(ports: Ports & { model: CappedModel }, context: ExtractionContext, registryTried: Set<string>): Promise<DiscoveryLaneOutcome> {
  const { config } = context;
  const outcome: DiscoveryLaneOutcome = {
    sightings: [],
    triedUrls: new Set(),
    outageUrls: new Set(),
    unreadUrls: new Set(),
    hosts: new Map(),
    report: { enabled: config.discovery.enabled, queries: 0, aggregatorPages: 0, pagesExtracted: 0, problems: [] },
    outsideGeography: 0,
    pagesNotExtracted: 0,
    queriesNotSearched: 0,
    leadsNotFollowed: 0,
  };
  const { report } = outcome;
  const followed = new Set<string>();

  /** The page behind a lead not yet followed this run, or nothing: already followed, the cap, or a problem fetching it. */
  const follow = async (url: string): Promise<FetchResult | undefined> => {
    if (followed.has(url) || registryTried.has(url)) return undefined;
    followed.add(url);
    if (ports.model.exhausted()) {
      outcome.leadsNotFollowed++;
      return undefined;
    }
    const fetched = await fetchReadable(url, ports.fetcher);
    if ("page" in fetched) return fetched.page;
    if (fetched.failure === "outage") outcome.outageUrls.add(url);
    report.problems.push(fetched.problem);
    return undefined;
  };

  const readPrimaryPage = async (url: string, query: string) => {
    if (!followed.has(url) && !registryTried.has(url)) outcome.triedUrls.add(url);
    const page = await follow(url);
    if (!page) return;
    const pageUrls = [url, normalizeUrl(page.finalUrl, url)];
    if (onHost(page.finalUrl, config.discovery.aggregatorHosts)) {
      report.problems.push(`${url} led to an aggregator page and was not extracted`);
      return;
    }
    for (const u of pageUrls) outcome.triedUrls.add(u);
    let read: Awaited<ReturnType<typeof extractPage>>;
    try {
      read = await extractPage(page, { lane: "discovery", query }, ports.model, { ...context, fetchedUrls: new Set([...context.fetchedUrls, ...pageUrls]) });
    } catch (error) {
      if (!(error instanceof SpendCapReached)) throw error;
      outcome.pagesNotExtracted++;
      for (const u of pageUrls) outcome.unreadUrls.add(u);
      return;
    }
    report.pagesExtracted++;
    outcome.outsideGeography += read.outsideGeography;
    report.problems.push(...read.problems);
    if (!read.sightings) {
      for (const u of pageUrls) outcome.unreadUrls.add(u);
      return;
    }
    outcome.sightings.push(...read.sightings);
    const host = hostOf(page.finalUrl);
    if (host && !outcome.hosts.has(host) && read.sightings.some((s) => s.event.status === "active")) outcome.hosts.set(host, pageUrls[1]!);
  };

  const readIndex = async (url: string, query: string) => {
    const page = await follow(url);
    if (!page) return;
    report.aggregatorPages++;
    for (const link of outboundLinks(page, config)) await readPrimaryPage(link, query);
  };

  for (const query of config.discovery.enabled ? discoveryQueries(config, context.today) : []) {
    if (ports.model.exhausted()) {
      outcome.queriesNotSearched++;
      continue;
    }
    let results: Awaited<ReturnType<Ports["search"]["search"]>>;
    try {
      results = await ports.search.search(query);
    } catch (error) {
      report.problems.push(`search "${query}" failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    report.queries++;
    for (const result of results.slice(0, config.discovery.resultsPerQuery)) {
      const url = normalizeUrl(result.url, "");
      if (!isLead(url, config)) continue;
      await (onHost(url, config.discovery.aggregatorHosts) ? readIndex(url, query) : readPrimaryPage(url, query));
    }
  }
  return outcome;
}

/**
 * Where an event's page is read as coming from: its lead's discovery search, or its registry
 * source; a source since removed from the registry has the event's own kind and neighborhood
 * standing in, so the extraction request has the same shape.
 */
function originFor(event: Event, url: string, registry: Registry): PageOrigin {
  const lead = event.lead;
  if (lead.lane === "discovery") return { lane: "discovery", query: lead.query };
  const registered = registry.sources.find((s) => s.name === lead.source);
  return {
    lane: "registry",
    source: registered ?? { name: lead.source, urls: [url], kind: event.kind, neighborhood: event.neighborhood, status: "active" },
  };
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

/**
 * Curation: every event due for it (active, not recurring, new or changed since last judged) goes
 * to the curation model in batches with the curation prompt. A judgment is applied to the event it
 * names; an event the reply does not name, or names with a flag but no why-line, is left unjudged
 * and comes up again next run, and a judgment naming no event in the batch is reported. A reply that cannot be read leaves its whole batch unjudged. Once
 * the spend cap is reached, events still to judge are not sent and are counted as not curated.
 */
async function curate(events: Event[], model: CappedModel, context: CurationContext, nowIso: string) {
  const due = events.filter(needsCuration);
  const judged = new Map<string, Event>();
  const report: RunReport["curation"] = { calls: 0, judged: 0, flagged: 0, problems: [] };
  let notCurated = 0;

  for (let i = 0; i < due.length; i += CURATION_BATCH_SIZE) {
    const batch = due.slice(i, i + CURATION_BATCH_SIZE);
    if (model.exhausted()) {
      notCurated += batch.length;
      continue;
    }
    const reply = await model.complete(buildCurationRequest(batch, context));
    report.calls++;
    const parsed = curationReplySchema.safeParse(reply.value);
    if (!parsed.success) {
      report.problems.push(`a curation reply was not in the expected shape; ${batch.length} event(s) left unjudged`);
      continue;
    }
    const answered = new Set<string>();
    let unknown = 0;
    for (const judgment of parsed.data.judgments) {
      const event = batch.find((e) => e.id === judgment.id);
      if (!event) {
        unknown++;
        continue;
      }
      if (answered.has(event.id)) continue;
      answered.add(event.id);
      if (judgment.dontMiss && judgment.why.trim() === "") {
        report.problems.push(`"${event.title}" was flagged with no why-line and was left unjudged`);
        continue;
      }
      judged.set(event.id, applyJudgment(event, judgment, nowIso));
    }
    if (unknown > 0) report.problems.push(`${unknown} judgment(s) named no event in the batch and were ignored`);
    const unanswered = batch.length - answered.size;
    if (unanswered > 0) report.problems.push(`${unanswered} event(s) in a batch were not answered and were left unjudged`);
  }

  report.judged = judged.size;
  report.flagged = [...judged.values()].filter((e) => e.dontMiss).length;
  return { events: events.map((e) => judged.get(e.id) ?? e), report, notCurated };
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

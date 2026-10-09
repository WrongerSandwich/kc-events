import type { RunConfig } from "./config.js";
import { EXPIRY_REASONS, type Dataset, type Event, type ExpiryReason, type SourceState } from "./dataset.js";
import { expire, expireIndexCited, expirePast, hiddenSinceVerified, isPast, outage, startsAfterHorizon, strike } from "./expiry.js";
import {
  buildExtractionRequest,
  candidateToSighting,
  extractionReplySchema,
  normalizeUrl,
  readPage,
  type ExtractionContext,
  type PageOrigin,
  type Sighting,
} from "./extraction.js";
import { applyJudgment, buildCurationRequest, cleanStoredWhyLine, cleanWhyLine, unflagged, CURATION_BATCH_SIZE, curationReplySchema, needsCuration, type CurationContext } from "./curation.js";
import { discoveryQueries, hostOf, isIndexPage, isLead, outboundLinks, trackDiscoveryHosts } from "./discovery.js";
import { findMatch, normalizeName, oneMonthOf, sameEvent, sameName, type VenueAliases } from "./identity.js";
import type { Registry, Source } from "./registry.js";
import type { FetchOptions, FetchPort, FetchResult, ModelPort, Ports } from "./ports.js";
import { plural } from "./markdown.js";
import type { EventRef, RunReport, SourceReport } from "./report.js";
import { capSpend, SpendCapReached, type CappedModel } from "./spend.js";
import { neighborhoodList, placeStored } from "./taxonomy.js";
import { horizonEnd, toLocalDate, toLocalIso } from "./time.js";

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
  // Before any fetch: a registry source in no region is a config error.
  const neighborhoods = neighborhoodList(config, registry);
  // Every model call goes through the cap, whatever stage makes it, and is counted for the fuse.
  const model = countOutcomes(capSpend(ports.model, config.spendCapUsd));
  const registryLane = await checkRegistry(registry, dataset.sourceState, ports);
  assertSomethingFetched(registryLane.sourceReports);
  // An index page is never a primary page, so nothing can be cited to one even if the registry fetched it.
  const fetchedUrls = new Set(
    registryLane.pages
      .flatMap(({ page }) => [page.url, page.finalUrl])
      .map((u) => normalizeUrl(u, u))
      .filter((u) => !isIndexPage(u, config)),
  );
  const extractionContext: ExtractionContext = {
    config,
    rules: prompts.extractionRules,
    today,
    nowIso: startedIso,
    fetchedUrls,
    neighborhoods,
  };
  const extraction = await extractFromPages(registryLane.pages, model, extractionContext);
  const sourceReports = registryLane.sourceReports.map((report) => withExtraction(report, extraction.bySource.get(report.name)));
  // Discovery runs after the registry lane, so a page the registry already read is not read again.
  const discovery = await discover({ ...ports, model }, extractionContext, registryLane.attempts.tried);
  // Registry sightings merge first: an event both lanes found keeps its registry lead.
  const merged = mergeSightings(dataset.events, [...extraction.sightings, ...discovery.sightings], today, config.venueAliases);
  // Past events, and events citing an index page as their primary page, expire before re-verification,
  // so nothing is fetched to check a date already gone or a page that is never read. Duplicates fold
  // after that, among what is left, and before re-verification, so a duplicate is not checked either.
  const folded = foldDuplicates(
    merged.events.map((e) => expireIndexCited(expirePast(e, today), config)),
    config.venueAliases,
  );
  const current = folded.events;
  // A lane that sighted a duplicate sighted the record it was folded into.
  const touched = new Set(merged.touched);
  for (const [duplicate, kept] of folded.foldedInto) if (touched.has(duplicate)) touched.add(kept);
  const laneOutcome = {
    touched,
    attempts: combineAttempts({ ...registryLane.attempts, unread: extraction.unreadUrls }, discovery.attempts),
  };
  const reverified = await reverify(current, laneOutcome, registry, { ...ports, model }, extractionContext);
  // A reading places an event from its page; one no page placed this run is placed from what is stored.
  const placed = placeOffList(reverified.events, neighborhoods, config, registry);
  // Made unverified by an uncitable re-reading and still so: a verified reading later this run brought it back, and a past one expired.
  const madeUncitable = new Set([...merged.uncitable, ...reverified.uncitable]);
  const uncitable = placed.events.filter((e) => madeUncitable.has(e.id) && e.status === "unverified");
  const changed = markChanged(dataset.events, placed.events, startedIso);
  const curation = await curate(changed, model, { config, curationPrompt: prompts.curationPrompt, today }, startedIso);
  assertModelReached(model);
  // Stored why-lines are cleaned as new ones are, so a dirty one is fixed without re-judging.
  const events = curation.events.map(cleanStoredWhyLine);
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
      beyondHorizonUnstruck: reverified.beyondHorizonUnstruck,
      unverifiedByOutageLimit: reverified.outageLimited.length,
      unverifiedByUncitableReading: uncitable.length,
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
    reverification: { problems: reverified.problems },
    curation: curation.report,
    sources: sourceReports,
    failingSources: registryLane.failingSources,
    offListNeighborhoods: placed.report,
    unmappableNeighborhoods: unmappableNeighborhoods([...extraction.sightings, ...discovery.sightings, ...reverified.sightings]),
    promotionSuggestions: promotion.promotionSuggestions,
    outageLimited: reverified.outageLimited.map(titleAndUrl),
    uncitableReadings: uncitable.map(titleAndUrl),
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

function titleAndUrl(event: Event): EventRef {
  return { title: event.title, primaryUrl: event.primaryUrl };
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

/** A capped model that also counts how its calls ended, for the fuse. */
interface CountedModel extends CappedModel {
  outcomes(): { succeeded: number; failed: number; lastError?: string };
}

/**
 * Counts the calls that came back and the calls that threw. A call the spend cap refused was never
 * made, so it counts as neither.
 */
function countOutcomes(model: CappedModel): CountedModel {
  let succeeded = 0;
  let failed = 0;
  let lastError: string | undefined;
  return {
    async complete(request) {
      try {
        const result = await model.complete(request);
        succeeded++;
        return result;
      } catch (error) {
        if (!(error instanceof SpendCapReached)) {
          failed++;
          lastError = errorMessage(error);
        }
        throw error;
      }
    },
    exhausted: model.exhausted,
    totalUsd: model.totalUsd,
    outcomes: () => ({ succeeded, failed, ...(lastError !== undefined ? { lastError } : {}) }),
  };
}

/**
 * The fuse: a model call that throws costs one page or one batch, but a run in which calls were
 * made and none came back read nothing, and its dataset and report would say so for every event.
 * It fails instead, so the CLI writes nothing and the last committed dataset stands. A run that
 * made no model call, or whose calls the cap refused, is a normal run.
 */
function assertModelReached(model: CountedModel): void {
  const { succeeded, failed, lastError } = model.outcomes();
  if (failed === 0 || succeeded > 0) return;
  throw new Error(`no model call succeeded: all ${plural(failed, "call")} failed, the last with "${lastError}"; the run stops so nothing is written`);
}

/** What a thrown model call did to a page: it was not read, and the report says why. */
function modelFailed(error: unknown): string {
  return `the model call failed (${errorMessage(error)})`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
async function checkRegistry(registry: Registry, previous: Record<string, SourceState>, ports: Ports) {
  const sourceReports: SourceReport[] = [];
  const pages: SourcePage[] = [];
  const attempts = noAttempts();
  const sourceState = { ...previous };
  const failuresOf = (name: string) => sourceState[name]?.consecutiveFailures ?? 0;

  for (const source of registry.sources) {
    if (source.status === "excluded") {
      sourceReports.push({ name: source.name, result: "excluded", extracted: 0, detail: source.reason });
      continue;
    }
    const checked = await checkSource(source, ports);
    for (const url of [...source.urls, ...checked.pages.map((p) => p.finalUrl)]) attempts.tried.add(normalizeUrl(url, url));
    for (const url of checked.outages) attempts.outages.add(normalizeUrl(url, url));
    for (const url of checked.gone) attempts.gone.add(normalizeUrl(url, url));
    sourceReports.push(checked.report);
    pages.push(...checked.pages.map((page) => ({ source, page })));
    if (checked.report.result === "fetched") sourceState[source.name] = { consecutiveFailures: 0 };
    if (checked.report.result === "failed") sourceState[source.name] = { consecutiveFailures: failuresOf(source.name) + 1 };
  }

  const failingSources = registry.sources
    .filter((s) => s.status === "active" && failuresOf(s.name) >= FAILING_SOURCE_THRESHOLD)
    .map((s) => s.name);
  // Extraction, not fetching, finds the unread pages; the run fills them in.
  return { sourceReports, sourceState, failingSources, pages, attempts };
}

/**
 * Fetches every URL of one active source, honoring robots.txt, and reports how it went.
 * Any failed URL marks the source failed, so it can still reach the failing-source flag;
 * otherwise a URL blocked by robots.txt marks it blocked, so Evan decides what to do.
 * The detail names every failed and blocked URL either way. Pages that did come back are
 * returned for extraction whatever the source's overall result. URLs that failed as an outage
 * are returned so re-verification does not strike the events on them, and URLs gone or disallowed
 * so it strikes every event on them, whatever its date.
 */
async function checkSource(source: Source, ports: Ports): Promise<{ report: SourceReport; pages: FetchResult[]; outages: string[]; gone: string[] }> {
  const blocked: string[] = [];
  const failed: string[] = [];
  const outages: string[] = [];
  const gone: string[] = [];
  const pages: FetchResult[] = [];
  for (const url of source.urls) {
    const fetched = await fetchReadable(url, ...fetcherFor(source, ports));
    if ("page" in fetched) {
      pages.push(fetched.page);
      continue;
    }
    if (fetched.failure === "disallowed") blocked.push(url);
    else failed.push(fetched.problem);
    if (fetched.failure === "outage") outages.push(url);
    else gone.push(url);
  }

  const report: SourceReport = { name: source.name, result: "fetched", extracted: 0 };
  const problems = [...failed, ...(blocked.length > 0 ? [`robots.txt disallows ${blocked.join(", ")}`] : [])];
  if (failed.length > 0) return { report: { ...report, result: "failed", detail: problems.join("; ") }, pages, outages, gone };
  if (blocked.length > 0) return { report: { ...report, result: "blocked", detail: problems.join("; ") }, pages, outages, gone };
  return { report, pages, outages, gone };
}

/** What extraction made of one source's pages this run. */
interface SourceExtraction {
  extracted: number;
  problems: string[];
}

/**
 * Hands every fetched page to the extraction model with the rules document and turns the
 * candidates into sightings under cite-or-drop. A reply that fails validation, or a call that
 * throws, yields nothing from that page. Once the spend cap refuses a call, every page left is counted
 * as not extracted; like an unreadable reply, that tells nothing about the events on it.
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
    if (isIndexPage(page.finalUrl, context.config)) {
      outcome.problems.push(`${page.finalUrl} is an index page and was not extracted`);
      continue;
    }
    let read: Awaited<ReturnType<typeof extractPage>>;
    try {
      read = await extractPage(page, { lane: "registry", source }, model, context);
    } catch (error) {
      markUnread(page);
      if (error instanceof SpendCapReached) pagesNotExtracted++;
      outcome.problems.push(`${page.finalUrl} not extracted: ${error instanceof SpendCapReached ? "spend cap reached" : modelFailed(error)}`);
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
  const reading = readPage(page, context.config);
  const reply = await model.complete(buildExtractionRequest(page, reading, origin, context));
  const parsed = extractionReplySchema.safeParse(reply.value);
  if (!parsed.success) {
    return {
      extracted: 0,
      outsideGeography: 0,
      problems: [`extraction reply for ${page.finalUrl} was not in the expected shape`],
    };
  }
  const candidateOrigin = { ...origin, pageUrl: normalizeUrl(page.finalUrl, page.finalUrl), links: reading.links };
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
 * its old id rather than starting a duplicate; all but those expired as index-page, which were
 * never read from an event's own page, so a reading of the real page starts a new event, and those
 * expired as duplicate, whose sightings belong to the record they were folded into.
 */
function mergeSightings(existing: Event[], sightings: Sighting[], today: string, aliases: VenueAliases) {
  const events = [...existing];
  const touched = new Set<string>();
  const refreshed = new Set<string>();
  const created = new Set<string>();
  const readVerified = new Set<string>();
  const uncitable = new Set<string>();

  for (const { event, cancelled } of sightings) {
    const known = findMatch(event, events.filter(matchable), aliases);
    if (!known) {
      if (cancelled || isPast(event, today)) continue;
      events.push(event);
      touched.add(event.id);
      created.add(event.id);
      if (event.status === "active") readVerified.add(event.id);
      continue;
    }
    // The first verified reading this run stands; a later page listing the same event, citably or not, only confirms it.
    if (readVerified.has(known.id) && !cancelled) continue;
    touched.add(known.id);
    if (event.status === "active") readVerified.add(known.id);
    const applied = applySighting(known, { event, cancelled }, event.primaryUrl === known.primaryUrl);
    events[events.indexOf(known)] = applied.event;
    if (applied.refreshed && !created.has(known.id)) refreshed.add(known.id);
    if (applied.uncitable) uncitable.add(known.id);
  }

  // Events this run made unverified are counted on their own, not as held.
  const heldUnverified = events.filter((e) => touched.has(e.id) && !uncitable.has(e.id) && e.status === "unverified").length;
  return { events, touched, uncitable, counts: { found: touched.size, new: created.size, updated: refreshed.size, heldUnverified } };
}

/** A known event a sighting can be matched to: not one expired as index-page or as duplicate. */
function matchable(event: Event): boolean {
  return event.expiryReason !== "index-page" && event.expiryReason !== "duplicate";
}

/**
 * What a sighting of a known event does to it: a page saying cancelled expires it (an event
 * already expired keeps its reason); a verified reading refreshes it; a reading of the event's own
 * primary page with nothing citable makes an active event unverified, keeping its old reading and
 * curation, since the rules no longer support publishing it, and leaves any other event's status
 * alone. Another page with nothing citable, such as one that names no venue, cannot speak for the
 * event, to cancel it or to hide it: it was matched on title and date alone. Short of a cancellation,
 * the page still lists the event, so it is not missing and any strike and any run of outages is cleared.
 */
function applySighting(
  known: Event,
  { event, cancelled }: Sighting,
  fromOwnPage: boolean,
): { event: Event; refreshed: boolean; uncitable: boolean } {
  const speaksForEvent = fromOwnPage || event.status === "active";
  if (cancelled && speaksForEvent) return { event: known.status === "expired" ? known : expire(known, "cancelled"), refreshed: false, uncitable: false };
  if (event.status === "active") return { event: refresh(known, event), refreshed: true, uncitable: false };
  const listed = { ...known, verificationFailures: 0, consecutiveOutages: 0 };
  if (known.status === "active" && fromOwnPage) return { event: { ...listed, status: "unverified" }, refreshed: false, uncitable: true };
  const cleared = known.verificationFailures === 0 && known.consecutiveOutages === 0;
  return { event: cleared ? known : listed, refreshed: false, uncitable: false };
}

/**
 * Folds records that turn out to be the same event (ADR 0007, amended): any two not expired that
 * match each other under the identity rules, recurring events aside, which never fuzzily match.
 * The record seen first is kept, a tie going to the one earlier in the dataset, which was created
 * first; the other expires as duplicate. One fold sets the first-seen rule aside: a dated record
 * that is one month of a recurring event folds into it (firstMonthPair). A kept record that is
 * not active takes an active
 * duplicate's reading under its own id, first-seen, and curation. Folding repeats until nothing
 * matches, since a fold can leave a venue-less record with one candidate where it had two. The
 * result depends only on the dataset. Returns which record each duplicate was folded into.
 */
function foldDuplicates(events: Event[], aliases: VenueAliases): { events: Event[]; foldedInto: Map<string, string> } {
  const byId = new Map(events.map((e) => [e.id, e]));
  const foldedInto = new Map<string, string>();
  const nextPair = () => {
    const events = [...byId.values()];
    return firstMatchingPair(events, aliases) ?? firstMonthPair(events);
  };
  for (let pair = nextPair(); pair; pair = nextPair()) {
    const [kept, duplicate] = pair;
    // A recurring record keeps its own reading, even when hidden: a month's dates would make it dated.
    // Re-verification checks a hidden one against its page this run.
    const takesReading = kept.status !== "active" && duplicate.status === "active" && kept.recurrence !== "recurring";
    byId.set(kept.id, takesReading ? refresh(kept, duplicate) : kept);
    byId.set(duplicate.id, expire(duplicate, "duplicate"));
    foldedInto.set(duplicate.id, kept.id);
  }
  return { events: [...byId.values()], foldedInto };
}

/** The first two records, in order seen (ties in dataset order), that are the same event: the one to keep, then its duplicate. */
function firstMatchingPair(events: Event[], aliases: VenueAliases): [Event, Event] | undefined {
  const live = events
    .filter((e) => e.status !== "expired" && e.recurrence !== "recurring")
    .sort((a, b) => Date.parse(a.firstSeen) - Date.parse(b.firstSeen));
  for (const [j, later] of live.entries()) {
    const kept = live.slice(0, j).find((earlier) => sameEvent(earlier, later, live, aliases));
    if (kept) return [kept, later];
  }
  return undefined;
}

/**
 * A dated record that is one month of a recurring record (#63), both not expired: the recurring
 * record to keep, then the dated one. The recurring record is kept even when it was seen later,
 * unlike other folds, which keep the record seen first: the dated record is only one reading of it.
 */
function firstMonthPair(events: Event[]): [Event, Event] | undefined {
  const live = events.filter((e) => e.status !== "expired");
  for (const dated of live.filter((e) => e.recurrence !== "recurring")) {
    const recurring = live.find((e) => e.recurrence === "recurring" && oneMonthOf(dated, e));
    if (recurring) return [recurring, dated];
  }
  return undefined;
}

/**
 * A known event re-read from a page: the new reading, under the known event's identity and
 * curation. A reading that makes it recurring drops its flag: recurring events are never on
 * the don't-miss list, and curation will not look at it again. A reading with no description keeps
 * the known one: a listing line that says nothing more does not wipe what a fuller page said. Like
 * every other field, the description is only taken from a verified reading.
 */
function refresh(known: Event, sighting: Event): Event {
  const curated = sighting.recurrence === "recurring" ? {} : { dontMiss: known.dontMiss, ...(known.whyLine !== undefined ? { whyLine: known.whyLine } : {}) };
  return {
    ...(known.description !== undefined ? { description: known.description } : {}),
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
 * and so is every event hidden since it was verified (by outages, ADR 0008, or an uncitable
 * re-reading), each run until it is past. A hidden event a lane sighted is checked too when the
 * lanes did not try its primary page: a calendar that lists an event under its own page cites
 * nothing for it, and only that page can bring it back. An event citing an index page has already
 * expired, so none is fetched here. A page either lane already tried this run is not fetched
 * again; it counts as that attempt ended. A page that loaded and no longer lists the event is a
 * strike, unless the event starts after the horizon: extraction was not asked for it, so leaving it
 * out says nothing and the event is left as it was. A page that is gone or that robots.txt now
 * disallows is a strike whatever the event's date. A page that could not be loaded
 * is an outage (see fetchReadable): it holds an active event as it was, up to the outage limit. A
 * page that does list the event applies the sighting as in the registry lane, which revives a
 * hidden event whose reading is verified and hides an active one whose reading is not. When the
 * model's reply about a page could not be read, or the call threw, nothing is known either way and
 * the event is left alone: a bad reply is not a dead page. Once the spend cap is reached, pages still to check are
 * not fetched and their events are left alone too, counted as not re-verified.
 */
async function reverify(
  events: Event[],
  lane: LaneOutcome,
  registry: Registry,
  ports: Ports & { model: CappedModel },
  context: ExtractionContext,
) {
  const problems: string[] = [];
  const sighted = (e: Event) => lane.touched.has(e.id);
  const pending = events.filter((e) => {
    if (lane.attempts.unread.has(e.primaryUrl)) return false;
    if (e.status === "active") return !sighted(e);
    return hiddenSinceVerified(e) && !(sighted(e) && lane.attempts.tried.has(e.primaryUrl));
  });
  const sightingsAt = new Map<string, Sighting[]>();
  const outageAt = new Set<string>();
  const goneAt = new Set<string>();
  const lastDay = horizonEnd(context.today, context.config.horizonWeeks);
  const refreshed = new Set<string>();
  let outsideGeography = 0;
  let notReverified = 0;

  for (const url of new Set(pending.map((e) => e.primaryUrl))) {
    if (lane.attempts.outages.has(url)) {
      outageAt.add(url);
      continue;
    }
    if (lane.attempts.tried.has(url)) {
      if (lane.attempts.gone.has(url)) goneAt.add(url);
      sightingsAt.set(url, []);
      continue;
    }
    if (ports.model.exhausted()) {
      notReverified += pending.filter((e) => e.primaryUrl === url).length;
      continue;
    }
    const onPage = pending.filter((e) => e.primaryUrl === url);
    const origin = originFor(onPage[0]!, url, registry);
    // The page is fetched the way its source's pages are; a discovered page always plainly.
    const fetched = await fetchReadable(url, ...(origin.lane === "registry" ? fetcherFor(origin.source, ports) : plainly(ports)));
    if (!("page" in fetched)) {
      if (fetched.failure === "outage") {
        outageAt.add(url);
        continue;
      }
      goneAt.add(url);
      sightingsAt.set(url, []);
      continue;
    }
    const { page } = fetched;
    const pageUrls = new Set([url, normalizeUrl(page.finalUrl, url)]);
    let read: Awaited<ReturnType<typeof extractPage>>;
    try {
      read = await extractPage(page, origin, ports.model, { ...context, fetchedUrls: pageUrls });
    } catch (error) {
      if (error instanceof SpendCapReached) throw error;
      problems.push(`${url} not re-read: ${modelFailed(error)}; ${plural(onPage.length, "event")} left unchanged`);
      continue;
    }
    outsideGeography += read.outsideGeography;
    if (read.sightings) sightingsAt.set(url, read.sightings);
  }

  let heldThroughOutage = 0;
  let beyondHorizonUnstruck = 0;
  const outageLimited: Event[] = [];
  const uncitable = new Set<string>();
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
    const sighting = sightings.find((s) => findMatch(s.event, [event], context.config.venueAliases));
    if (!sighting) {
      if (goneAt.has(event.primaryUrl) || !startsAfterHorizon(event, lastDay)) return strike(event);
      beyondHorizonUnstruck++;
      return event;
    }
    // The page read here is the event's primary page, whatever page the sighting cites.
    const applied = applySighting(event, sighting, true);
    if (applied.refreshed) refreshed.add(event.id);
    if (applied.uncitable) uncitable.add(event.id);
    return applied.event;
  });
  return {
    events: checked,
    reverified: refreshed.size,
    notReverified,
    outsideGeography,
    heldThroughOutage,
    beyondHorizonUnstruck,
    outageLimited,
    uncitable,
    sightings: [...sightingsAt.values()].flat(),
    problems,
  };
}

/** What the two lanes leave for re-verification: which events they sighted and which pages they tried. */
interface LaneOutcome {
  touched: Set<string>;
  attempts: PageAttempts;
}

/** The pages a lane tried this run and how each attempt ended, all as normalized URLs. */
interface PageAttempts {
  /** Every URL requested or redirected to, whether or not it came back. */
  tried: Set<string>;
  /** URLs that could not be loaded: an outage, not a reading. */
  outages: Set<string>;
  /** URLs that are gone (404, 410) or that robots.txt disallows: a strike for every event citing them. */
  gone: Set<string>;
  /** Pages that came back but were not read: an unreadable reply, or the spend cap. */
  unread: Set<string>;
}

function noAttempts(): PageAttempts {
  return { tried: new Set(), outages: new Set(), gone: new Set(), unread: new Set() };
}

function combineAttempts(...all: PageAttempts[]): PageAttempts {
  return {
    tried: new Set(all.flatMap((a) => [...a.tried])),
    outages: new Set(all.flatMap((a) => [...a.outages])),
    gone: new Set(all.flatMap((a) => [...a.gone])),
    unread: new Set(all.flatMap((a) => [...a.unread])),
  };
}

/**
 * The fetcher a registry source's pages go through, and what it is told: the browser for a source
 * whose listings are rendered by script, the plain fetcher otherwise.
 */
function fetcherFor(source: Source, ports: Ports): FetchRoute {
  if (source.fetch !== "browser") return plainly(ports);
  return [ports.browserFetcher, source.waitFor ? { waitFor: source.waitFor } : undefined];
}

type FetchRoute = [fetcher: FetchPort, options?: FetchOptions];

const plainly = (ports: Ports): FetchRoute => [ports.fetcher];

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
  options?: FetchOptions,
): Promise<{ page: FetchResult } | { problem: string; failure: "outage" | "gone" | "disallowed" }> {
  try {
    const page = await fetcher.fetch(url, options);
    if (!page.robotsAllowed) return { problem: `robots.txt disallows ${url}`, failure: "disallowed" };
    if (page.status >= 200 && page.status < 300) return { page };
    return { problem: `${url}: HTTP ${page.status}`, failure: GONE_STATUSES.has(page.status) ? "gone" : "outage" };
  } catch (error) {
    return { problem: `${url}: ${errorMessage(error)}`, failure: "outage" };
  }
}

/** What the discovery lane found, and what it leaves for merging, re-verification, and the report. */
interface DiscoveryLaneOutcome {
  sightings: Sighting[];
  /** The primary pages the lane tried; never an index page. */
  attempts: PageAttempts;
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
 * to an index page is fetched only to read its outbound links, which are followed as leads
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
    attempts: noAttempts(),
    hosts: new Map(),
    report: { enabled: config.discovery.enabled, queries: 0, aggregatorPages: 0, pagesExtracted: 0, problems: [] },
    outsideGeography: 0,
    pagesNotExtracted: 0,
    queriesNotSearched: 0,
    leadsNotFollowed: 0,
  };
  const { report, attempts } = outcome;
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
    if (fetched.failure === "outage") attempts.outages.add(url);
    else attempts.gone.add(url);
    report.problems.push(fetched.problem);
    return undefined;
  };

  const readPrimaryPage = async (url: string, query: string) => {
    if (!followed.has(url) && !registryTried.has(url)) attempts.tried.add(url);
    const page = await follow(url);
    if (!page) return;
    const pageUrls = [url, normalizeUrl(page.finalUrl, url)];
    if (isIndexPage(page.finalUrl, config)) {
      report.problems.push(`${url} led to an index page and was not extracted`);
      return;
    }
    for (const u of pageUrls) attempts.tried.add(u);
    let read: Awaited<ReturnType<typeof extractPage>>;
    try {
      read = await extractPage(page, { lane: "discovery", query }, ports.model, { ...context, fetchedUrls: new Set([...context.fetchedUrls, ...pageUrls]) });
    } catch (error) {
      for (const u of pageUrls) attempts.unread.add(u);
      if (error instanceof SpendCapReached) outcome.pagesNotExtracted++;
      else report.problems.push(`${url} not extracted: ${modelFailed(error)}`);
      return;
    }
    report.pagesExtracted++;
    outcome.outsideGeography += read.outsideGeography;
    report.problems.push(...read.problems);
    if (!read.sightings) {
      for (const u of pageUrls) attempts.unread.add(u);
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
      report.problems.push(`search "${query}" failed: ${errorMessage(error)}`);
      continue;
    }
    report.queries++;
    for (const result of results.slice(0, config.discovery.resultsPerQuery)) {
      const url = normalizeUrl(result.url, "");
      if (!isLead(url, config)) continue;
      await (isIndexPage(url, config) ? readIndex(url, query) : readPrimaryPage(url, query));
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
 * Every event not expired whose stored neighborhood is off the list, placed again (see placeStored),
 * and for the report, each stored value, where it went, and how many events. A config that renames or
 * regroups neighborhoods would otherwise leave the old names on every event no page re-reads,
 * unnoticed. An expired event is left as it is: a reading that revives it places it from its page.
 */
function placeOffList(events: Event[], list: string[], config: RunConfig, registry: Registry) {
  const report: RunReport["offListNeighborhoods"] = [];
  const placed = events.map((event) => {
    if (event.status === "expired") return event;
    const { lead } = event;
    const source = lead.lane === "registry" ? registry.sources.find((s) => s.name === lead.source) : undefined;
    const neighborhood = placeStored(event.neighborhood, list, config, source?.neighborhood);
    if (neighborhood === event.neighborhood) return event;
    const line = report.find((r) => r.stored === event.neighborhood && r.placed === neighborhood);
    if (line) line.events++;
    else report.push({ stored: event.neighborhood, placed: neighborhood, events: 1 });
    return { ...event, neighborhood };
  });
  return { events: placed, report };
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
 * and comes up again next run (the second losing any flag it had, since a flag with no why-line is no flag), and a judgment naming no event in the batch is reported. A reply that cannot be read, or a call that throws, leaves its whole batch unjudged. Once
 * the spend cap is reached, events still to judge are not sent and are counted as not curated.
 */
async function curate(events: Event[], model: CappedModel, context: CurationContext, nowIso: string) {
  const due = events.filter(needsCuration);
  const judged = new Map<string, Event>();
  const unjudgedFlags = new Map<string, Event>();
  const report: RunReport["curation"] = { calls: 0, judged: 0, flagged: 0, problems: [] };
  let notCurated = 0;

  for (let i = 0; i < due.length; i += CURATION_BATCH_SIZE) {
    const batch = due.slice(i, i + CURATION_BATCH_SIZE);
    if (model.exhausted()) {
      notCurated += batch.length;
      continue;
    }
    // A call that throws was still made.
    report.calls++;
    let reply: Awaited<ReturnType<CappedModel["complete"]>>;
    try {
      reply = await model.complete(buildCurationRequest(batch, context));
    } catch (error) {
      if (error instanceof SpendCapReached) throw error;
      report.problems.push(`a curation call was not read: ${modelFailed(error)}; ${batch.length} event(s) left unjudged`);
      continue;
    }
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
      if (judgment.dontMiss && cleanWhyLine(judgment.why) === "") {
        report.problems.push(`"${event.title}" was flagged with no why-line and was left unjudged`);
        unjudgedFlags.set(event.id, unflagged(event));
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
  return { events: events.map((e) => judged.get(e.id) ?? unjudgedFlags.get(e.id) ?? e), report, notCurated };
}

/** How many events became expired this run, by reason. */
function countExpired(previous: Event[], events: Event[]): Record<ExpiryReason, number> {
  const wasExpired = new Set(previous.filter((e) => e.status === "expired").map((e) => e.id));
  const counts = Object.fromEntries(EXPIRY_REASONS.map((reason) => [reason, 0])) as Record<ExpiryReason, number>;
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

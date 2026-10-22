import { ELSEWHERE_IN_THE_METRO, type RunConfig } from "./config.js";
import { EXPIRY_REASONS, ownPageAllowed, type Dataset, type Event, type ExpiryReason, type SourceState, type Weekday } from "./dataset.js";
import { buildOwnPageRequest, LISTING_LINE_LENGTH, readOwnPageReply, readTicketPageReply, type Quoted } from "./own-page.js";
import { splitArchived } from "./archive.js";
import { runChanges } from "./changes.js";
import { ageUnsighted, expire, expireIndexCited, expirePast, expireSkipped, hiddenSinceVerified, isPast, outage, startsAfterHorizon, startsAfterListing, strike } from "./expiry.js";
import {
  buildExtractionRequest,
  candidateToSighting,
  extractionReplySchema,
  normalizeUrl,
  overCap,
  quotableText,
  quotedOn,
  readPage,
  sameQuote,
  type ExtractionContext,
  type PageOrigin,
  type Sighting,
} from "./extraction.js";
import {
  applyJudgment,
  buildCurationRequest,
  cleanStoredWhyLine,
  cleanWhyLine,
  markChanged,
  withLaterJudgment,
  unflagged,
  CURATION_BATCH_SIZE,
  curationReplySchema,
  needsCuration,
  whyLineOverCap,
  WHY_LINE_CAP,
  type CurationContext,
} from "./curation.js";
import { discoveryQueries, excludedSourceOnHost, isIndexPage, isLead, onAdmittedHost, outboundLinks, trackDiscoveryHosts } from "./discovery.js";
import { hostOf, onHost, pageKey, samePage, sameSite } from "./hosts.js";
import {
  calendarDate,
  daysApart,
  matchSighting,
  nearDates,
  normalizeName,
  oneMonthOf,
  sameEnd,
  sameEvent,
  sameMoment,
  sameName,
  sameRecurringEvent,
  sameText,
  scheduleSaysWhen,
  variantTitles,
  venueAndRoom,
  type MatchRule,
  type VenueAliases,
} from "./identity.js";
import type { ExcludedSource, Registry, Source } from "./registry.js";
import { SearchQuotaExhausted, type FetchOptions, type FetchPort, type FetchResult, type ModelPort, type Ports } from "./ports.js";
import { plural } from "./markdown.js";
import type { CandidateTally, EventRef, OwnPagesReport, RunReport, SourceReport } from "./report.js";
import { awayGame, skipReason, type SkipReason } from "./skip.js";
import { capSpend, SpendCapReached, type CappedModel } from "./spend.js";
import { neighborhoodList, placeStored } from "./taxonomy.js";
import { hasTime, horizonEnd, toLocalDate, toLocalIso } from "./time.js";

/** Consecutive failed runs after which a source is flagged in the report. */
const FAILING_SOURCE_THRESHOLD = 3;

/** Active events a page must be about to strike before a reading of nothing on it counts as an outage instead (#78). */
const EMPTY_READING_GUARD = 3;

/** The editable prompt documents, read by the CLI and passed in as values. */
export interface Prompts {
  /** The extraction rules document, sent with every extraction call. */
  extractionRules: string;
  /** The curation prompt document, sent with every curation call. */
  curationPrompt: string;
  /** The event page rules, sent with every read of an event's own page (#123, #133). */
  eventPageRules: string;
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
  /** Expired records this run moved out of the dataset (#82), for the caller to add to the archive. */
  archived: Event[];
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
  const extractionContext: ExtractionContext = {
    config,
    rules: prompts.extractionRules,
    today,
    nowIso: startedIso,
    neighborhoods,
  };
  const extraction = await extractFromPages(registryLane.pages, model, extractionContext);
  const sourceReports = registryLane.sourceReports.map((report) => withExtraction(report, extraction.bySource.get(report.name)));
  // Discovery runs after the registry lane, so a page the registry already read is not read again.
  const discovery = await discover({ ...ports, model }, extractionContext, registry, registryLane.attempts.tried);
  // Registry sightings merge first: an event both lanes found keeps its registry lead.
  const merged = mergeSightings(dataset.events, [...extraction.sightings, ...discovery.sightings], extractionContext);
  // Past events, events citing an index page as their primary page, and promotions or non-public events
  // stored before the skip (#81) expire before re-verification, so nothing is fetched to check a date
  // already gone, a page that is never read, or an event no reading may keep. Duplicates fold after
  // that, among what is left, and before re-verification, so a duplicate is not checked either.
  const folded = foldDuplicates(
    merged.events.map((e) => expireSkipped(expireIndexCited(expirePast(e, today), config))),
    config.venueAliases,
  );
  // Discovery finds; a person admits (ADR 0012): what discovery found on a host no active registry source is on is
  // held, before re-verification so a held event is not read, and what a promotion since released is sent there.
  const held = holdForPromotion(folded.events, dataset.events, registry, config);
  const current = held.events;
  // A lane that sighted a duplicate sighted the record it was folded into.
  const touched = new Set(merged.touched);
  for (const [duplicate, kept] of folded.foldedInto) if (touched.has(duplicate)) touched.add(kept);
  const laneOutcome = {
    touched,
    released: held.released,
    attempts: combineAttempts(registryLane.attempts, extraction.attempts, discovery.attempts),
  };
  const reverified = await reverify(current, laneOutcome, registry, { ...ports, model }, extractionContext);
  // A record no reading ever verified goes stale when no lane has sighted it for four runs that could have (#82).
  const sighted = new Set([...touched, ...reverified.sighted]);
  const aged = reverified.events.map((e) => ageUnsighted(e, { sighted: sighted.has(e.id), laneRan: couldHaveSighted(e, laneOutcome.attempts, registry, config) }));
  // A flagged source's events its list dates but does not time have their own page read for the time (#123).
  const ownPages = await readOwnPages(aged, sighted, registry, { ...ports, model }, extractionContext, prompts.eventPageRules);
  // A mapped venue places every event at it, read this run or not (#150); a reading places the rest from its page,
  // and one no page placed this run is placed from what is stored. The map goes first: its neighborhoods are on the
  // list (the config checks), so the off-list placement leaves them be and reports only what the map did not place.
  const mappedVenues = placeMappedVenues(ownPages.events, neighborhoods, config);
  const placed = placeOffList(mappedVenues.events, neighborhoods, config, registry);
  // Made unverified by an uncitable re-reading and still so: a verified reading later this run brought it back, and a past one expired.
  const madeUncitable = new Set([...merged.uncitable, ...reverified.uncitable]);
  const uncitable = placed.events.filter((e) => madeUncitable.has(e.id) && e.status === "unverified");
  // Kept on its stored citation and still active (#124): the failed quote shows, so model variance stays visible.
  const keptOn = new Map([...merged.kept, ...reverified.kept]);
  const kept = placed.events.filter((e) => keptOn.has(e.id) && e.status === "active");
  const changed = markChanged(dataset.events, placed.events, startedIso);
  const curation = await curate(changed, model, { config, curationPrompt: prompts.curationPrompt, today }, startedIso);
  // Each pick has its own page read for the time, price and age limit, once per date and own page (#133).
  const picks = await readPicks(curation.events, ownPages.read, registry, { ...ports, model }, extractionContext, prompts.eventPageRules);
  assertModelReached(model);
  // Stored why-lines are cleaned as new ones are, so a dirty one is fixed without re-judging.
  const events = picks.events.map(cleanStoredWhyLine);
  const promotion = trackDiscoveryHosts(dataset.discoveryState, discovery.hosts, { registry, config }, startedIso, events);
  // What expired long enough ago that nothing will revive it leaves the live dataset (#82).
  const { live, archived } = splitArchived(events, today);
  const shortfall = {
    pagesNotExtracted: extraction.pagesNotExtracted + discovery.pagesNotExtracted,
    eventsNotReverified: reverified.notReverified,
    queriesNotSearched: discovery.queriesNotSearched,
    leadsNotFollowed: discovery.leadsNotFollowed,
    eventsNotCurated: curation.notCurated,
    ownPagesNotRead: ownPages.notRead + picks.notRead,
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
      heldSourceExcluded: reverified.heldSourceExcluded,
      beyondHorizonUnstruck: reverified.beyondHorizonUnstruck,
      beyondListingUnstruck: reverified.beyondListingUnstruck,
      unverifiedByOutageLimit: reverified.outageLimited.length,
      unverifiedByUncitableReading: uncitable.length,
      keptOnStoredCitation: kept.length,
      venuelessAmbiguous: merged.counts.venuelessAmbiguous,
      heldForPromotion: countEvents(held.heldByHost),
      releasedForPromotion: countEvents(held.releasedByHost),
      ...sumTallies(extraction.tally, discovery.tally, reverified.tally),
      expired: countExpired(dataset.events, events),
      archived: archived.length,
    },
    spend: {
      totalUsd: model.totalUsd(),
      capUsd: config.spendCapUsd,
      // Hit means the cap cut something; a last call that merely crossed it cut nothing.
      capHit: Object.values(shortfall).some((n) => n > 0),
      shortfall,
      modelCalls: model.calls(),
    },
    discovery: discovery.report,
    reverification: { problems: reverified.problems },
    curation: curation.report,
    sources: sourceReports,
    ownPages: [...ownPages.report, ...picks.report],
    failingSources: registryLane.failingSources,
    offListNeighborhoods: placed.report,
    venueNeighborhoods: mappedVenues.report,
    unmappableNeighborhoods: unmappableNeighborhoods(dataset.events, live),
    promotionSuggestions: promotion.promotionSuggestions,
    heldForPromotion: held.heldByHost,
    releasedForPromotion: held.releasedByHost,
    outageLimited: reverified.outageLimited.map(titleAndUrl),
    uncitableReadings: uncitable.map(titleAndUrl),
    keptOnStoredCitation: kept.map((e) => ({ ...titleAndUrl(e), failedQuote: keptOn.get(e.id)! })),
    cancellationsFromElsewhere: merged.cancellationsFromElsewhere,
    identityChurn: identityChurn(dataset.events, events),
    changes: runChanges(dataset.events, events, dataset.lastSuccessfulRun, today),
  };

  return {
    dataset: {
      ...dataset,
      events: live,
      sourceState: registryLane.sourceState,
      discoveryState: promotion.discoveryState,
      generatedAt: finishedIso,
      lastSuccessfulRun: finishedIso,
    },
    report,
    archived,
  };
}

/**
 * Whether this run's lanes could have sighted a record (#82): a discovery-led one only with discovery
 * on; a registry-led one unless its source is excluded or its page was not read (an outage, the spend
 * cap, a reply that could not be read), which says nothing about it, as an outage says nothing for a strike.
 */
function couldHaveSighted(event: Event, attempts: PageAttempts, registry: Registry, config: RunConfig): boolean {
  const { lead } = event;
  if (lead.lane === "discovery") return config.discovery.enabled;
  const key = pageKey(event.primaryUrl);
  const excluded = registry.sources.some((s) => s.name === lead.source && s.status === "excluded");
  return !excluded && !attempts.outages.has(key) && !attempts.unread.has(key);
}

/** Every event whose title or primary page differs from what the run started with, now and before (#82). */
function identityChurn(previous: Event[], events: Event[]): RunReport["identityChurn"] {
  const before = new Map(previous.map((e) => [e.id, e]));
  return events.flatMap((event) => {
    const was = before.get(event.id);
    if (!was || (was.title === event.title && was.primaryUrl === event.primaryUrl)) return [];
    return [{ ...titleAndUrl(event), was: titleAndUrl(was) }];
  });
}

function titleAndUrl(event: Event): EventRef {
  return { title: event.title, primaryUrl: event.primaryUrl };
}

/** Events by host, as the report lists them. */
type HostCounts = RunReport["heldForPromotion"];

const countEvents = (hosts: HostCounts): number => hosts.reduce((n, h) => n + h.events, 0);

/**
 * The hold on what discovery finds (ADR 0012). A discovery-led event not expired whose primary page is on
 * a host no active registry source is on and no ticketing platform is held for promotion: stored
 * unverified and marked, whether it is new this run or was read in a run before the rule, and whether
 * its reading is verified or not; the reading is kept, so promotion releases it as it was read. A held
 * event whose host a person has since promoted, a registry source now being on it, is released: the
 * marker goes, it stays unverified, and re-verification reads it from its page this run, which is what
 * brings it back. An expired event carries no marker: there is nothing to release. A registry-led
 * event is never held, whatever host its page has moved to, since a person admitted its source; an
 * excluded source's events are held as through an outage instead (#78). Held and released are judged
 * against the dataset the run started from: a held event discovery found again this run was refreshed
 * from its page (refresh), which rebuilt the record without the marker, and is held still, not anew;
 * one the promoted source's own page refreshed to active this run was released by that promotion.
 * Returns the events held and released this run, by host, for the report.
 */
function holdForPromotion(
  events: Event[],
  previous: Event[],
  registry: Registry,
  config: RunConfig,
): { events: Event[]; released: Set<string>; heldByHost: HostCounts; releasedByHost: HostCounts } {
  const heldBefore = new Set(previous.filter((e) => e.heldForPromotion).map((e) => e.id));
  const heldByHost = new Map<string, number>();
  const releasedByHost = new Map<string, number>();
  const released = new Set<string>();
  const count = (into: Map<string, number>, event: Event) => {
    const host = hostOf(event.primaryUrl) ?? event.primaryUrl;
    into.set(host, (into.get(host) ?? 0) + 1);
  };
  const checked = events.map((event) => {
    const { heldForPromotion: marked, ...unmarked } = event;
    if (event.status === "expired") return marked ? unmarked : event;
    if (event.lead.lane === "discovery" && !onAdmittedHost(event.primaryUrl, registry, config)) {
      if (!heldBefore.has(event.id)) count(heldByHost, event);
      return marked && event.status === "unverified" ? event : { ...event, status: "unverified" as const, heldForPromotion: true as const };
    }
    if (heldBefore.has(event.id)) {
      count(releasedByHost, event);
      released.add(event.id);
    }
    return marked ? unmarked : event;
  });
  const listed = (counts: Map<string, number>): HostCounts => [...counts].map(([host, events]) => ({ host, events })).sort((a, b) => b.events - a.events || a.host.localeCompare(b.host));
  return { events: checked, released, heldByHost: listed(heldByHost), releasedByHost: listed(releasedByHost) };
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
    calls: model.calls,
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
 * each source's consecutive failure count forward, for the sources the registry still names. A blocked source's count is left alone:
 * it is neither a success nor a transient failure.
 */
async function checkRegistry(registry: Registry, previous: Record<string, SourceState>, ports: Ports) {
  const sourceReports: SourceReport[] = [];
  const pages: SourcePage[] = [];
  const attempts = noAttempts();
  // A source taken out of the registry leaves no state behind (#82); an excluded one keeps its count for when it returns.
  const sourceState = Object.fromEntries(Object.entries(previous).filter(([name]) => registry.sources.some((s) => s.name === name)));
  const failuresOf = (name: string) => sourceState[name]?.consecutiveFailures ?? 0;

  for (const source of registry.sources) {
    if (source.status === "excluded") {
      sourceReports.push({ name: source.name, result: "excluded", extracted: 0, detail: source.reason });
      continue;
    }
    const checked = await checkSource(source, ports);
    for (const url of [...source.urls, ...checked.pages.map((p) => p.finalUrl)]) attempts.tried.add(pageKey(url));
    for (const url of checked.outages) attempts.outages.add(pageKey(url));
    for (const url of checked.gone) attempts.gone.add(pageKey(url));
    sourceReports.push(checked.report);
    pages.push(...checked.pages.map((page) => ({ source, page })));
    if (checked.report.result === "fetched") sourceState[source.name] = { consecutiveFailures: 0 };
    if (checked.report.result === "failed") sourceState[source.name] = { consecutiveFailures: failuresOf(source.name) + 1 };
  }

  const failingSources = registry.sources
    .filter((s) => s.status === "active" && failuresOf(s.name) >= FAILING_SOURCE_THRESHOLD)
    .map((s) => s.name);
  // Extraction, not fetching, finds the pages not read and the calendars that now redirect to an index page.
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
 * as not extracted; like an unreadable reply, that tells nothing about the events on it. A page whose
 * redirects ended on an index page is not extracted at all. The attempts returned add to the
 * registry lane's: the pages not read (in full), each page's yield, and the outages.
 */
async function extractFromPages(pages: SourcePage[], model: ModelPort, context: ExtractionContext) {
  const sightings: Sighting[] = [];
  const bySource = new Map<string, SourceExtraction>();
  const attempts = noAttempts();
  const tally = noTally();
  let pagesNotExtracted = 0;
  const markUnread = (page: FetchResult) => {
    for (const url of [page.url, page.finalUrl]) attempts.unread.add(pageKey(url));
  };

  for (const { source, page } of pages) {
    const outcome = bySource.get(source.name) ?? { extracted: 0, problems: [] };
    bySource.set(source.name, outcome);
    if (isIndexPage(page.finalUrl, context.config)) {
      // A calendar that now redirects to an index page says nothing about its events; like a lead
      // that does (see discover), they are held as through an outage, not struck (#111).
      attempts.outages.add(pageKey(page.url));
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
    addTally(tally, read.tally);
    if (read.sightings) {
      sightings.push(...read.sightings);
      for (const url of [page.url, page.finalUrl]) attempts.yields.set(pageKey(url), yieldOf(read.sightings, read.tally));
    }
    if (!readInFull(read)) markUnread(page);
    outcome.extracted += read.extracted;
    outcome.problems.push(...read.problems);
  }

  return { sightings, tally, pagesNotExtracted, bySource, attempts };
}

const noTally = (): CandidateTally => ({ outsideGeography: 0, skippedPromotion: 0, skippedNotPublic: 0, overCap: 0, unusableDates: 0, quoteNotOnPage: 0 });

/** The tally each reason to skip a candidate counts under (#81). */
const SKIPPED_AS: Record<SkipReason, keyof CandidateTally> = { promotion: "skippedPromotion", "not-public": "skippedNotPublic" };

function addTally(into: CandidateTally, from: CandidateTally): void {
  for (const cause of Object.keys(into) as (keyof CandidateTally)[]) into[cause] += from[cause];
}

/**
 * Whether a page's reading says everything the page lists: the reply was read and no candidate was
 * dropped over a cap. Otherwise an event missing from the reading may still be on the page, so the
 * page counts as unread for it and it is not struck.
 */
function readInFull(read: { sightings?: Sighting[]; tally: CandidateTally }): boolean {
  return read.sightings !== undefined && read.tally.overCap === 0;
}

/**
 * What a page's reading amounted to, for judging an event it leaves out (#78): how many things it
 * listed, its sightings and the candidates skipped as promotions or not public (#81), which the page
 * did list (a candidate with no title, or outside the geography, is neither, so a reply of only those
 * lists nothing), and the latest start among the sightings, cancelled or not, cited or not, which is
 * as far as the page listed this run. A recurring sighting is listed under no date.
 */
interface PageYield {
  listed: number;
  latestStart?: string;
}

function yieldOf(sightings: Sighting[], tally: CandidateTally): PageYield {
  const starts = sightings.flatMap((s) => (s.event.recurrence === "recurring" ? [] : [calendarDate(s.event.start)])).filter((d): d is string => d !== undefined);
  const latestStart = starts.sort().at(-1);
  const listed = Object.values(SKIPPED_AS).reduce((n, cause) => n + tally[cause], sightings.length);
  return { listed, ...(latestStart !== undefined ? { latestStart } : {}) };
}

function sumTallies(...tallies: CandidateTally[]): CandidateTally {
  const sum = noTally();
  for (const t of tallies) addTally(sum, t);
  return sum;
}

/**
 * One extraction call over one page. Sightings are absent when the reply could not be read. A
 * candidate with no title cannot be an event; one outside the geography, or with a field past its
 * length cap, is dropped and counted. One with a date or time that cannot be used is kept, held
 * uncitable, counted, and reported.
 */
async function extractPage(
  page: FetchResult,
  origin: PageOrigin,
  model: ModelPort,
  context: ExtractionContext,
): Promise<{ sightings?: Sighting[]; extracted: number; tally: CandidateTally; problems: string[] }> {
  const reading = readPage(page, context.config);
  const reply = await model.complete(buildExtractionRequest(page, reading, origin, context));
  const parsed = extractionReplySchema.safeParse(reply.value);
  if (!parsed.success) {
    return {
      extracted: 0,
      tally: noTally(),
      problems: [`extraction reply for ${page.finalUrl} was not in the expected shape`],
    };
  }
  const candidateOrigin = { ...origin, pageUrl: normalizeUrl(page.finalUrl, page.finalUrl), links: reading.links, quotableText: quotableText(reading) };
  const sightings: Sighting[] = [];
  const problems: string[] = [];
  const tally = noTally();
  for (const candidate of parsed.data.events) {
    if (candidate.title.trim() === "") {
      problems.push(`a candidate on ${page.finalUrl} had no title and was skipped`);
      continue;
    }
    const skipped = skipReason(candidate);
    if (skipped !== undefined) {
      tally[SKIPPED_AS[skipped]]++;
      continue;
    }
    if (candidate.outsideGeography || awayGame(candidate)) {
      tally.outsideGeography++;
      continue;
    }
    const capped = overCap(candidate);
    if (capped) {
      tally.overCap++;
      problems.push(`a candidate on ${page.finalUrl} ran past the ${capped.cap}-character cap on ${capped.field} and was dropped`);
      continue;
    }
    const sighting = candidateToSighting(candidate, candidateOrigin, context);
    if (sighting.dateProblem !== undefined) {
      tally.unusableDates++;
      problems.push(`"${sighting.event.title}" on ${page.finalUrl} had ${sighting.dateProblem} and was held uncitable`);
    }
    if (sighting.quoteProblem !== undefined) {
      tally.quoteNotOnPage++;
      problems.push(`"${sighting.event.title}" on ${page.finalUrl} ${sighting.quoteProblem.phrase}, which is not on the page, and was held unverified`);
    }
    if (sighting.daysProblem !== undefined) problems.push(`"${sighting.event.title}" on ${page.finalUrl} ${sighting.daysProblem}`);
    sightings.push(sighting);
  }
  return { sightings, extracted: parsed.data.events.length, tally, problems };
}

function withExtraction(report: SourceReport, extraction: SourceExtraction | undefined): SourceReport {
  if (!extraction) return report;
  const detail = [report.detail, ...extraction.problems].filter(Boolean).join("; ");
  return { ...report, extracted: extraction.extracted, ...(detail ? { detail } : {}) };
}

/**
 * Folds this run's sightings into the dataset, registry lane first. A sighting matching a known
 * event (ADR 0007) is applied to it, unless the event was already read verified this run by a page
 * that speaks for it; an unmatched one is new, unless it is cancelled or already past: nothing
 * to publish. Matching includes expired events, so a page listing one again revives it under
 * its old id rather than starting a duplicate; all but those expired as index-page, which were
 * never read from an event's own page, so a reading of the real page starts a new event. A record
 * expired as duplicate stands for the record it was folded into (#77), which takes its sightings;
 * one folded before that pointer was kept takes none. Within one page's reading, a verified
 * candidate with a known event's title on a date outside the fuzzy window, where the page also
 * lists the event on or near its own date, is a second event: the page lists the show twice, so it
 * starts a record rather than confirming or moving the first, whichever night the page gives first.
 * A cancellation applies only to a known event whose date is inside the window: a cancelled later
 * night is not the earlier night's cancellation. A dated sighting that is one month of a recurring
 * event confirms it and no more: a month's dates would make the standing event dated; a cancelled
 * month is no listing of the standing event at all, so a page that lists nothing else of it strikes
 * it (cancellationReaches and the month rule in applySighting, which re-verification applies too). A venue-less
 * sighting that fits two or more known events with none preferred creates nothing (nothing
 * publishable anyway) and is counted. A sighting from a page with no standing toward the event (see
 * Standing) is not a sighting of it at all (#78): the event is left as it was, strikes included, for
 * re-verification to check its own page; when such a page says cancelled, the report says who said
 * what. When one page lists the show twice within the fuzzy window, the night nearest the stored
 * start is the event's reading, whichever the page gives first (#78); the other confirms it at most.
 */
function mergeSightings(existing: Event[], sightings: Sighting[], { today, nowIso, config }: ExtractionContext) {
  const aliases = config.venueAliases;
  const events = [...existing];
  const touched = new Set<string>();
  const refreshed = new Set<string>();
  const created = new Set<string>();
  const readVerified = new Set<string>();
  const uncitable = new Set<string>();
  const kept = new Map<string, string>();
  const cancellationsFromElsewhere: RunReport["cancellationsFromElsewhere"] = [];
  let venuelessAmbiguous = 0;

  const create = (event: Event) => {
    events.push(event);
    touched.add(event.id);
    created.add(event.id);
    if (event.status === "active") readVerified.add(event.id);
  };

  for (const sighting of sightings) {
    const { event, cancelled } = sighting;
    const match = matchSighting(event, events.filter(matchable), aliases);
    if (match.kind !== "matched") {
      if (cancelled || isPast(event, today)) continue;
      if (match.kind === "ambiguous") {
        venuelessAmbiguous++;
        continue;
      }
      create(event);
      continue;
    }
    const { event: known, rule } = match;
    if (cancelled && !cancellationReaches(event, known, rule)) continue;
    const standing = standingOf(event, known, config.discovery.platformHosts);
    if (cancelled && standing === "none") {
      cancellationsFromElsewhere.push({ ...titleAndUrl(known), reportedBy: event.primaryUrl });
      continue;
    }
    // A verified sighting far from the known event's date, on a page that also lists the event on or near its date
    // (in this reading, before or after this sighting), is a second event: the page lists the show twice. Not one
    // that ends on the event's end date (#68): its start is another reading of the one run, not another night.
    if (event.status === "active" && !cancelled && !nearDates(event, known) && !sameEnd(event, known) && listsNear(known, sighting, sightings)) {
      if (!isPast(event, today)) create(event);
      continue;
    }
    // The first verified reading this run stands; a later page listing the same event, citably or not, only confirms it.
    if (readVerified.has(known.id) && !cancelled) continue;
    // A page with no standing says nothing about the event; its own page decides, in re-verification.
    if (standing === "none") continue;
    // Of this run's verified sightings of the event from pages with standing, the one nearest its stored start is its reading.
    if (event.status === "active" && !cancelled && hasNearerSighting(known, sighting, sightings, events.filter(matchable), config)) continue;
    touched.add(known.id);
    if (event.status === "active" && rule !== "month") readVerified.add(known.id);
    const applied = applySighting(known, sighting, standing, rule, nowIso);
    events[events.indexOf(known)] = applied.event;
    if (applied.refreshed && !created.has(known.id)) refreshed.add(known.id);
    if (applied.uncitable) uncitable.add(known.id);
    if (applied.keptOn !== undefined) kept.set(known.id, applied.keptOn);
    else if (applied.refreshed) kept.delete(known.id);
  }

  // Events this run made unverified are counted on their own, not as held.
  const heldUnverified = events.filter((e) => touched.has(e.id) && !uncitable.has(e.id) && e.status === "unverified").length;
  return {
    events,
    touched,
    uncitable,
    kept,
    cancellationsFromElsewhere,
    counts: { found: touched.size, new: created.size, updated: refreshed.size, heldUnverified, venuelessAmbiguous },
  };
}

/**
 * How far a sighting's page may speak for the known event it matched (ADR 0008, amended #75), from
 * most to least. The event's own primary page can do everything, including hide the event when its
 * re-reading cites nothing (#16). A page that speaks for the event, the registry lane's (a source a
 * person admitted) or one on the event's own site, its primary page's registrable domain, can
 * cancel and refresh it: a ticket subdomain of the venue can cancel its show. Any other page, one
 * the search ranked, has no standing (#78): it says nothing about the event, not even that it is
 * still listed, so the event goes to re-verification against its own page as if the page had not
 * been read. A ticketing platform the config lists is no one's site, since any organizer can put a
 * page on it, so two pages there never speak for each other.
 */
type Standing = "own-page" | "speaks-for" | "none";

function standingOf(sighting: Event, known: Event, platformHosts: readonly string[]): Standing {
  if (samePage(sighting.primaryUrl, known.primaryUrl)) return "own-page";
  const ownSite = sameSite(sighting.primaryUrl, known.primaryUrl) && !onHost(known.primaryUrl, platformHosts);
  return sighting.lead.lane === "registry" || ownSite ? "speaks-for" : "none";
}

/**
 * Whether another of this run's verified, uncancelled sightings of a known event, from a page with
 * standing, starts nearer the event's stored start than this one (#78). When one does, this sighting
 * is not the event's reading: a page that lists the show on two nights within the fuzzy window names
 * the night nearest the one stored, whichever it gives first, so the record does not jump to the
 * earlier night for being listed first. Two nights the same distance away leave the first to stand.
 * The other sighting counts only when the event is its match among every known event (the pool),
 * not merely a fit: one that is another event's sighting cannot stand in for this one.
 */
function hasNearerSighting(known: Event, sighting: Sighting, sightings: Sighting[], pool: Event[], config: RunConfig): boolean {
  const distance = (s: Sighting) => daysApart(s.event, known);
  const matchesKnown = (other: Sighting) => {
    const match = matchSighting(other.event, pool, config.venueAliases);
    return match.kind === "matched" && match.event.id === known.id;
  };
  return sightings.some(
    (other) =>
      other !== sighting &&
      other.event.status === "active" &&
      !other.cancelled &&
      distance(other) < distance(sighting) &&
      matchesKnown(other) &&
      standingOf(other.event, known, config.discovery.platformHosts) !== "none",
  );
}

/**
 * Whether a cancelled sighting says anything about the known event it matched (#77): not when it is
 * one month of a recurring event (a month off is not the standing event's cancellation), nor when
 * its date is outside the fuzzy window of the event's (a later night's cancellation is not this
 * night's). Such a sighting is no listing of the event at all. One that ends on the event's end
 * date (#68) reaches whatever its start: a run that closes on that date is the one run.
 */
function cancellationReaches(sighting: Event, known: Event, rule: MatchRule): boolean {
  return rule !== "month" && (nearDates(sighting, known) || sameEnd(sighting, known));
}

/**
 * Whether the page a sighting was read from also lists the known event's title on or near the
 * event's date, elsewhere in this run's sightings, cancelled or not, cited or not (#77). When it
 * does, a sighting of that title far from the date is another night of the show, not a date move.
 */
function listsNear(known: Event, sighting: Sighting, sightings: Sighting[]): boolean {
  return sightings.some(
    (other) => other !== sighting && samePage(other.event.primaryUrl, sighting.event.primaryUrl) && sameName(other.event.title, sighting.event.title) && nearDates(other.event, known),
  );
}

/**
 * A known event a sighting can be matched to: not one expired as index-page, nor one expired as
 * duplicate before the record it was folded into was kept (#77); a duplicate with that pointer
 * stands for the record, and matching follows it there.
 */
function matchable(event: Event): boolean {
  return event.expiryReason !== "index-page" && (event.expiryReason !== "duplicate" || event.duplicateOf !== undefined);
}

/**
 * What a sighting of a known event does to it, from a page with standing (see Standing) and under
 * the rule that matched them. Saying cancelled expires it (an event already expired keeps its
 * reason); a verified reading refreshes it; a reading of the event's own primary page with nothing
 * citable makes an active event unverified, keeping its old reading and curation, since the rules no
 * longer support publishing it, and leaves any other event's status alone. Another page with nothing
 * citable, such as one that names no venue, cannot cancel or hide the event: it was matched on
 * title and date alone. A dated sighting that is one month of a recurring event confirms it and no
 * more, whatever its page (#77): a month's dates would make the standing event dated. Short of a
 * cancellation, the page still lists the event, so it is not missing and any strike and any run of
 * outages is cleared. A page with no standing never gets here (#78): it clears nothing. One
 * exception to hiding (#124): an own-page reading held only because a quote is not on the page
 * keeps an active event on its stored reading, verified now (keptOn, the failed quote), when the
 * event's stored quotes are on the page this run read and the reading agrees with the stored one
 * (keepsStoredCitation): the page has not changed, only the model's quote has.
 */
function applySighting(
  known: Event,
  sighting: Sighting,
  standing: Exclude<Standing, "none">,
  rule: MatchRule,
  nowIso: string,
): { event: Event; refreshed: boolean; uncitable: boolean; keptOn?: string } {
  const { event, cancelled } = sighting;
  const fromOwnPage = standing === "own-page";
  const confirmsOnly = rule === "month";
  const mayCancel = !confirmsOnly && (fromOwnPage || event.status === "active");
  if (cancelled && mayCancel) return { event: known.status === "expired" ? known : expire(known, "cancelled"), refreshed: false, uncitable: false };
  if (event.status === "active" && !confirmsOnly) return { event: refresh(known, event, rule), refreshed: true, uncitable: false };
  const listed = { ...known, verificationFailures: 0, consecutiveOutages: 0 };
  if (known.status === "active" && fromOwnPage && !confirmsOnly) {
    if (keepsStoredCitation(known, sighting)) return { event: { ...listed, lastVerified: nowIso }, refreshed: false, uncitable: false, keptOn: sighting.quoteProblem!.phrase };
    return { event: { ...listed, status: "unverified" }, refreshed: false, uncitable: true };
  }
  const cleared = known.verificationFailures === 0 && known.consecutiveOutages === 0;
  return { event: cleared ? known : listed, refreshed: false, uncitable: false };
}

/**
 * Whether an active event read from its own page by a reading held only on a quote (#124) stays on
 * its stored citation: the stored date and venue quotes are both on the page this run read, and the
 * reading agrees with the stored one, the same calendar date (and time, when both give one) or the
 * same schedule for a recurring event, and the same venue, case and spacing aside. Any other failed
 * reading (a date that does not exist, no date or venue at all) has no quote problem and hides it.
 */
function keepsStoredCitation(known: Event, { event, quoteProblem }: Sighting): boolean {
  if (quoteProblem === undefined) return false;
  const { pageText } = quoteProblem;
  const { date, venue } = known.evidence;
  if (date === undefined || venue === undefined || !quotedOn(date, pageText) || !quotedOn(venue, pageText)) return false;
  return sameWhen(event, known) && sameAsideFromCaseAndSpacing(event.venue, known.venue);
}

function sameWhen(reading: Event, known: Event): boolean {
  if (known.recurrence === "recurring" || reading.recurrence === "recurring") {
    return known.recurrence === reading.recurrence && sameAsideFromCaseAndSpacing(reading.schedule, known.schedule);
  }
  return calendarDate(reading.start) !== undefined && sameMoment(reading.start, known.start);
}

/** Two texts that are the same once case and runs of whitespace are set aside; an absent one matches nothing. */
function sameAsideFromCaseAndSpacing(a: string | undefined, b: string | undefined): boolean {
  const plain = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
  return a !== undefined && b !== undefined && plain(a) === plain(b);
}

/**
 * Folds records that turn out to be the same event (ADR 0007, amended): any two not expired that
 * match each other under the identity rules, two dated records under the dated rules and two
 * recurring records under the recurring one (#119); a dated and a recurring record are never a
 * pair but under the month rule. The record seen first is kept, a tie going to the one earlier in
 * the dataset, which was created first; the other expires as duplicate, naming the kept record
 * (duplicateOf), so a later sighting of it goes to the kept record (#77). One fold sets the
 * first-seen rule aside: a dated record that is one month of a recurring event folds into it
 * (firstMonthPair). A kept record that is not active takes an active duplicate's reading under its
 * own id and first-seen. Two recurring records' fold ends with the fuller schedule of the pair
 * (withFullerSchedule). Either way the kept record ends with the judgment of the pair's
 * later-judged record (withLaterJudgment). Folding repeats until nothing matches, since a fold can
 * leave a venue-less record with one candidate where it had two. The result depends only on the
 * dataset. Returns which record each duplicate was folded into.
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
    // A recurring record keeps its own reading against a dated month's, even when hidden: the month's
    // dates would make it dated. Re-verification checks a hidden one against its page this run.
    const takesReading = kept.status !== "active" && duplicate.status === "active" && (kept.recurrence !== "recurring" || duplicate.recurrence === "recurring");
    byId.set(kept.id, withLaterJudgment(withFullerSchedule(takesReading ? refresh(kept, duplicate) : kept, duplicate), duplicate));
    byId.set(duplicate.id, { ...expire(duplicate, "duplicate"), duplicateOf: kept.id });
    foldedInto.set(duplicate.id, kept.id);
  }
  return { events: [...byId.values()], foldedInto };
}

/**
 * The first two records, in order seen (ties in dataset order), that are the same event: the one to
 * keep, then its duplicate. Two dated records are compared under sameEvent, as before; two
 * recurring records under the recurring rule alone (#119), not the exact rule too: that one ignores
 * venue, and two recurring readings of one page with one title and no venue cannot be published,
 * so there is nothing to fold. A dated and a recurring record are never a pair here.
 */
function firstMatchingPair(events: Event[], aliases: VenueAliases): [Event, Event] | undefined {
  const live = events.filter((e) => e.status !== "expired").sort((a, b) => Date.parse(a.firstSeen) - Date.parse(b.firstSeen));
  const dated = live.filter((e) => e.recurrence !== "recurring");
  const samePair = (a: Event, b: Event) =>
    a.recurrence === "recurring" ? sameRecurringEvent(a, b, aliases) : b.recurrence !== "recurring" && sameEvent(a, b, dated, aliases);
  for (const [j, later] of live.entries()) {
    const kept = live.slice(0, j).find((earlier) => samePair(earlier, later));
    if (kept) return [kept, later];
  }
  return undefined;
}

/**
 * The record a fold keeps, with the duplicate's schedule and date quote when the kept record's
 * schedule only repeats one of the pair's titles and the duplicate's says when (#119): "First
 * Friday" gives way to "First Friday of every month". Where both or neither say when, the kept
 * record's stands. Only from a duplicate on the kept record's own primary page: the quote must be
 * on the page the record cites (ADR 0002). Only two recurring records carry a schedule, so any
 * other pair is left as it is.
 */
function withFullerSchedule(kept: Event, duplicate: Event): Event {
  if (kept.recurrence !== "recurring" || !samePage(kept.primaryUrl, duplicate.primaryUrl)) return kept;
  const titles = [kept.title, duplicate.title];
  if (scheduleSaysWhen(kept.schedule, titles) || !scheduleSaysWhen(duplicate.schedule, titles)) return kept;
  return { ...kept, schedule: duplicate.schedule, evidence: { ...kept.evidence, date: duplicate.evidence.date } };
}

/**
 * Whether a re-reading of a recurring event from its own primary page gives a schedule that only
 * repeats one of the event's titles where the stored one says when (#119): the page bills "First
 * Friday" once with "First Friday of every month" and once with "First Friday", and the kept record
 * should not flap between them. The stored schedule and its date quote stand.
 */
function holdsSchedule(known: Event, sighting: Event): boolean {
  if (sighting.recurrence !== "recurring" || !samePage(known.primaryUrl, sighting.primaryUrl)) return false;
  const titles = [known.title, sighting.title];
  return scheduleSaysWhen(known.schedule, titles) && !scheduleSaysWhen(sighting.schedule, titles);
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
 * every other field, the description is only taken from a verified reading. The stored title is
 * kept when the new one is a form of it, cut short or with a series name in front (#75): the page
 * billed the same event two ways, and the site should not flap between them. So are the stored title
 * and description when the new one differs only in whitespace or punctuation, the stored own page when
 * the new one is the same page (samePage), and each stored quote when the quote check cannot tell it
 * from the new one, so it is on the page just as surely (#82): the weekly diff carries what changed,
 * not how a reading happened to spell it. A recurring event's stored schedule, with its quote, stands
 * over a new one from the same page that only repeats a title (#119, holdsSchedule). A limited run
 * matched by its end date alone keeps its stored start, with the page and quotes that cite it, over a
 * sighting giving another (#120, keepsStart).
 */
function refresh(known: Event, sighting: Event, rule?: MatchRule): Event {
  const refreshed = refreshReading(known, sighting);
  if (!keepsStart(known, sighting, rule)) return refreshed;
  const { eventUrl: _eventUrl, price: _price, ages: _ages, days: _days, ownPageRead: _ownPageRead, ...rest } = refreshed;
  // The own page's read (#133) belongs with the start and own page it was read on, and its quotes with the evidence.
  return {
    ...rest,
    start: known.start,
    primaryUrl: known.primaryUrl,
    ...(known.eventUrl !== undefined ? { eventUrl: known.eventUrl } : {}),
    ...(known.price !== undefined ? { price: known.price } : {}),
    ...(known.ages !== undefined ? { ages: known.ages } : {}),
    ...(keepsDays(known, rest) ? { days: known.days } : {}),
    ...(known.ownPageRead !== undefined ? { ownPageRead: known.ownPageRead } : {}),
    evidence: rest.recurrence === "limited-run" ? known.evidence : withoutDaysQuote(known.evidence),
  };
}

/**
 * Whether a sighting matched to a limited run only by their shared end date (#68) gives a start
 * other than the stored one, or none (#120). A run is named by when it closes; the start a page
 * gives is its opening or the day the page listed it, so a later reading does not replace an earlier
 * one, and the order pages are read in cannot flap it. The stored start stays with the page and
 * quotes that cite it, since the sighting's page need not carry them (ADR 0002). A stored run with
 * no start takes the sighting's. A date move goes through on the other rules, and from the record's
 * own page under any title: that page is the one the start was read from. A fold passes no rule,
 * so it takes a reading as before (ADR 0007: the fold keeps the record seen first).
 */
function keepsStart(known: Event, sighting: Event, rule: MatchRule | undefined): boolean {
  if (rule !== "same-end" || samePage(sighting.primaryUrl, known.primaryUrl)) return false;
  return known.start !== undefined && calendarDate(sighting.start) !== calendarDate(known.start);
}

/**
 * Whether a re-reading keeps the time an event's own page gave its start (#123): the reading gives the
 * same date with no time, and the same own page. The time stands, with its quote, and the own page is
 * not read again; a new date, a time of the list's own, or another own page drops it.
 */
function keepsOwnPageTime(known: Event, sighting: Event): boolean {
  const { time } = known.evidence;
  if (time === undefined || sighting.start === undefined || hasTime(sighting.start) || sighting.eventUrl === undefined) return false;
  return calendarDate(sighting.start) === calendarDate(known.start) && samePage(sighting.eventUrl, time.page);
}

/** Evidence without a run's days quote, for a record that is no longer a limited run. */
function withoutDaysQuote({ days: _days, ...evidence }: Event["evidence"]): Event["evidence"] {
  return evidence;
}

/**
 * Whether a re-reading keeps what an event's own page gave it (#133): the reading gives the same date
 * and the same own page that was read. The price, age limit and a run's days (#143) stand with their quotes, the own page's
 * description stands over a shorter one, and the page is not read again; a new date or another own
 * page drops them, and a pick's page is read again.
 */
function keepsOwnPageRead(known: Event, sighting: Event): boolean {
  const read = known.ownPageRead;
  if (read === undefined || sighting.start === undefined || sighting.eventUrl === undefined) return false;
  return calendarDate(sighting.start) === calendarDate(known.start) && samePage(sighting.eventUrl, read.page);
}

/** Whether a record keeps the days it carries (#143): the reading still makes it a limited run. Enough on its own for a stored start kept with its quotes (keepsStart); a kept own-page read also asks where they came from (keepsOwnPageDays). */
function keepsDays(known: Event, sighting: Event): boolean {
  return known.days !== undefined && sighting.recurrence === "limited-run";
}

/**
 * Whether a kept own-page read keeps a run's days (#143): the reading still makes it a limited run, and the days were the
 * own page's (or its ticket page's), not the list's. Days quoted from the list (#196) are the date line's, so the list's
 * new reading of them stands, and the own page's stand over it.
 */
function keepsOwnPageDays(known: Event, sighting: Event): boolean {
  return keepsDays(known, sighting) && !fromList(known);
}

/** Whether a run's days were quoted from its primary page (#196) rather than read from an own page. */
function fromList(event: Event): boolean {
  return event.evidence.days !== undefined && samePage(event.evidence.days.page, event.primaryUrl);
}

/**
 * What a kept own-page read carries over (keepsOwnPageRead): the read, the price and age limit, a run's days it gave, and the
 * stored description over a list that still gives none or only a line (LISTING_LINE_LENGTH), which the read replaced.
 */
function ownPageFields(known: Event, sighting: Event): Partial<Event> {
  const listLine = sighting.description === undefined || sighting.description.length <= LISTING_LINE_LENGTH;
  const fuller = listLine && known.description !== undefined && known.description.length > (sighting.description?.length ?? 0);
  return {
    ownPageRead: known.ownPageRead!,
    ...(known.price !== undefined ? { price: known.price } : {}),
    ...(known.ages !== undefined ? { ages: known.ages } : {}),
    ...(keepsOwnPageDays(known, sighting) ? { days: known.days! } : {}),
    ...(fuller ? { description: known.description! } : {}),
  };
}

/** The new reading under the known event's identity and curation, by the field rules refresh gives. */
function refreshReading(known: Event, sighting: Event): Event {
  const ownPageKept = keepsOwnPageRead(known, sighting);
  const curated = sighting.recurrence === "recurring" ? {} : { dontMiss: known.dontMiss, ...(known.whyLine !== undefined ? { whyLine: known.whyLine } : {}) };
  /** The stored value under its field when the new one is the same by the given test, else nothing, so the new one stands. */
  const keepIfSame = (field: string, was: string | undefined, now: string | undefined, same: (a: string, b: string) => boolean) =>
    was !== undefined && now !== undefined && same(was, now) ? { [field]: was } : {};
  return {
    ...(known.description !== undefined ? { description: known.description } : {}),
    ...sighting,
    ...(variantTitles(known.title, sighting.title) ? { title: known.title } : keepIfSame("title", known.title, sighting.title, sameText)),
    ...keepIfSame("description", known.description, sighting.description, sameText),
    ...keepIfSame("eventUrl", known.eventUrl, sighting.eventUrl, samePage),
    ...(holdsSchedule(known, sighting) ? { schedule: known.schedule } : {}),
    ...(keepsOwnPageTime(known, sighting) ? { start: known.start } : {}),
    ...(ownPageKept ? ownPageFields(known, sighting) : {}),
    evidence: {
      ...sighting.evidence,
      ...keepIfSame("date", known.evidence.date, sighting.evidence.date, sameQuote),
      ...keepIfSame("venue", known.evidence.venue, sighting.evidence.venue, sameQuote),
      ...(holdsSchedule(known, sighting) ? { date: known.evidence.date } : {}),
      ...(keepsOwnPageTime(known, sighting) ? { time: known.evidence.time } : {}),
      ...(ownPageKept && known.evidence.price !== undefined ? { price: known.evidence.price } : {}),
      ...(ownPageKept && known.evidence.ages !== undefined ? { ages: known.evidence.ages } : {}),
      ...(ownPageKept && keepsOwnPageDays(known, sighting) ? { days: known.evidence.days! } : {}),
    },
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
 * lanes did not try its primary page: a lane's reading is keyed to the page it read, so an event
 * keyed to another page that the lane's reading did not match stays as it was. An event citing an index page has already
 * expired, so none is fetched here. A page either lane already tried this run is not fetched
 * again; it counts as that attempt ended. A page that loaded and no longer lists the event is a
 * strike, unless the page said nothing about it (#78): the event starts after the horizon, less two
 * days of slack, where extraction was not asked for it; or after the latest start the page listed
 * this run, so the page's window stops short of it. Either way the event is left as it was, and the
 * report counts it. A page that is gone or that robots.txt now disallows is a strike whatever the
 * event's date. A page that could not be loaded (see fetchReadable), or a registry calendar or
 * discovery lead whose redirects ended on an index page (#111), is an outage: it holds an active
 * event as it was, up to the outage limit. So is a page that loaded and read as listing nothing where three or more active
 * events would be struck (#78): a page that renders empty, or a model that returns nothing, is not
 * news about each event; the report names the page. An excluded source's page is not fetched at all
 * (#78): a person took the source out of the run, so its events are held as through an outage, and
 * the report names the source; they are checked again when it is active. An event held for promotion
 * is not read at all while it is held (ADR 0012): no fetch, no model call; one released this run is
 * read whether or not it was ever verified, since its page is what brings it back. A
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
    if (e.heldForPromotion || lane.attempts.unread.has(pageKey(e.primaryUrl))) return false;
    if (e.status === "active") return !sighted(e);
    return (hiddenSinceVerified(e) || lane.released.has(e.id)) && !(sighted(e) && lane.attempts.tried.has(pageKey(e.primaryUrl)));
  });
  const onPage = (url: string) => pending.filter((e) => e.primaryUrl === url);
  const sightingsAt = new Map<string, Sighting[]>();
  /** What each page read this run, by either lane or here, listed. */
  const yieldAt = new Map<string, PageYield>();
  const outageAt = new Set<string>();
  const goneAt = new Set<string>();
  /** Pages read with a candidate dropped over its cap: what is missing from the reading may be on the page. */
  const partlyReadAt = new Set<string>();
  /** Pages not fetched because they are an excluded source's: an outage for their events, by the source. */
  const excludedAt = new Map<string, ExcludedSource>();
  const lastDay = horizonEnd(context.today, context.config.horizonWeeks);
  const refreshed = new Set<string>();
  /** Events a re-read page listed, citably or not. */
  const listedHere = new Set<string>();
  const tally = noTally();
  let notReverified = 0;

  for (const url of new Set(pending.map((e) => e.primaryUrl))) {
    const key = pageKey(url);
    const origin = originFor(onPage(url)[0]!, url, registry);
    // An excluded source's page holds its events whoever read it this run: the exclusion was a decision about the source.
    const excluded = excludedSourceOf(origin, url, registry);
    if (excluded) {
      excludedAt.set(url, excluded);
      outageAt.add(url);
      continue;
    }
    if (lane.attempts.outages.has(key)) {
      outageAt.add(url);
      continue;
    }
    if (lane.attempts.tried.has(key)) {
      if (lane.attempts.gone.has(key)) goneAt.add(url);
      sightingsAt.set(url, []);
      const yielded = lane.attempts.yields.get(key);
      if (yielded) yieldAt.set(url, yielded);
      continue;
    }
    if (ports.model.exhausted()) {
      notReverified += onPage(url).length;
      continue;
    }
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
    let read: Awaited<ReturnType<typeof extractPage>>;
    try {
      read = await extractPage(page, origin, ports.model, context);
    } catch (error) {
      if (error instanceof SpendCapReached) throw error;
      problems.push(`${url} not re-read: ${modelFailed(error)}; ${plural(onPage(url).length, "event")} left unchanged`);
      continue;
    }
    addTally(tally, read.tally);
    problems.push(...read.problems);
    if (read.sightings) {
      sightingsAt.set(url, read.sightings);
      yieldAt.set(url, yieldOf(read.sightings, read.tally));
      if (!readInFull(read)) partlyReadAt.add(url);
    }
  }

  // The empty-reading guard: a page that loaded and read as listing nothing, where it would strike three or more
  // events, is a wobble (the model's, or a page that rendered empty), not news about each of them.
  for (const [url, yielded] of yieldAt) {
    if (yielded.listed > 0 || !sightingsAt.has(url) || goneAt.has(url) || partlyReadAt.has(url)) continue;
    const wouldStrike = onPage(url).filter((e) => e.status === "active" && !startsAfterHorizon(e, lastDay)).length;
    if (wouldStrike < EMPTY_READING_GUARD) continue;
    sightingsAt.delete(url);
    outageAt.add(url);
    problems.push(`${url} loaded but read as listing nothing where ${plural(wouldStrike, "active event")} cite it; counted as an outage for them, not ${plural(wouldStrike, "strike")}`);
  }
  for (const source of new Set(excludedAt.values())) {
    const urls = [...excludedAt].filter(([, s]) => s === source).map(([url]) => url);
    const held = urls.reduce((n, url) => n + onPage(url).length, 0);
    problems.push(`${source.name} is excluded (${source.reason}): ${plural(held, "event")} on ${plural(urls.length, "page")} not fetched, held as through an outage`);
  }

  let heldThroughOutage = 0;
  let heldSourceExcluded = 0;
  let beyondHorizonUnstruck = 0;
  let beyondListingUnstruck = 0;
  const outageLimited: Event[] = [];
  const uncitable = new Set<string>();
  const kept = new Map<string, string>();
  const checked = events.map((event) => {
    if (!pending.includes(event)) return event;
    const url = event.primaryUrl;
    if (outageAt.has(url)) {
      const held = outage(event);
      if (event.status === "active" && held.status === "active") {
        if (excludedAt.has(url)) heldSourceExcluded++;
        else heldThroughOutage++;
      }
      if (event.status === "active" && held.status === "unverified") outageLimited.push(held);
      return held;
    }
    const sightings = sightingsAt.get(url);
    if (!sightings) return event;
    const listed = sightingFor(event, sightings, context.config.venueAliases);
    if (!listed) {
      if (partlyReadAt.has(url)) return event;
      if (goneAt.has(url)) return strike(event);
      if (startsAfterHorizon(event, lastDay)) {
        beyondHorizonUnstruck++;
        return event;
      }
      if (startsAfterListing(event, yieldAt.get(url)?.latestStart)) {
        beyondListingUnstruck++;
        return event;
      }
      return strike(event);
    }
    // The page read here is the event's primary page, whatever page the sighting cites.
    const applied = applySighting(event, listed.sighting, "own-page", listed.rule, context.nowIso);
    listedHere.add(event.id);
    if (applied.refreshed) refreshed.add(event.id);
    if (applied.uncitable) uncitable.add(event.id);
    if (applied.keptOn !== undefined) kept.set(event.id, applied.keptOn);
    return applied.event;
  });
  return {
    events: checked,
    reverified: refreshed.size,
    sighted: listedHere,
    notReverified,
    tally,
    heldThroughOutage,
    heldSourceExcluded,
    beyondHorizonUnstruck,
    beyondListingUnstruck,
    outageLimited,
    uncitable,
    kept,
    sightings: [...sightingsAt.values()].flat(),
    problems,
  };
}

/**
 * The excluded registry source whose page an event's primary page is, if any (#78): the source its
 * lead names, or one that lists the page among its URLs, for an event found elsewhere. A person took
 * the source out of the run, so its pages are not fetched for re-verification either.
 */
function excludedSourceOf(origin: PageOrigin, url: string, registry: Registry): ExcludedSource | undefined {
  if (origin.lane === "registry" && origin.source.status === "excluded") return origin.source;
  return registry.sources.find((s): s is ExcludedSource => s.status === "excluded" && s.urls.some((u) => samePage(u, url)));
}

/**
 * The sighting on a re-read page that is a known event, and by which rule it matched: of those
 * matching, the one whose start is nearest the event's stored start, the first of them on a tie
 * (#77, #78): a page that lists the show twice gives the event's own night among them, and a show
 * given only on another night has moved. A cancelled sighting that does not reach the event
 * (cancellationReaches) is no sighting of it.
 */
function sightingFor(event: Event, sightings: Sighting[], aliases: VenueAliases): { sighting: Sighting; rule: MatchRule } | undefined {
  const matching = sightings.flatMap((sighting) => {
    const match = matchSighting(sighting.event, [event], aliases);
    if (match.kind !== "matched" || (sighting.cancelled && !cancellationReaches(sighting.event, event, match.rule))) return [];
    return [{ sighting, rule: match.rule }];
  });
  return matching.sort((a, b) => daysApart(a.sighting.event, event) - daysApart(b.sighting.event, event))[0];
}

/**
 * The own-page time (#123, ADR 0009 amended). For an active registry source flagged `readEventPages`,
 * every active dated event of it that a page with standing read this run, that starts from today
 * through the horizon on a date with no time, and that has an own page, has that page read the
 * source's way (readOwnPage). A time once read is kept while the list gives the same date with no time
 * and the same own page (refresh), so a page is read again only when one of those changes.
 */
async function readOwnPages(
  events: Event[],
  sighted: Set<string>,
  registry: Registry,
  ports: Ports & { model: CappedModel },
  context: ExtractionContext,
  rules: string,
): Promise<{ events: Event[]; report: OwnPagesReport[]; notRead: number; read: Set<string> }> {
  const { config, today } = context;
  const lastDay = horizonEnd(today, config.horizonWeeks);
  /** Each flagged source by name, with its line in the report. */
  const flagged = new Map(
    registry.sources.filter((s) => s.status === "active" && s.readEventPages).map((source) => [source.name, { source, line: ownPagesLine(source.name) }]),
  );
  const wantsTime = (e: Event) => {
    const date = calendarDate(e.start);
    return (
      e.status === "active" && sighted.has(e.id) && e.eventUrl !== undefined && date !== undefined && !hasTime(e.start) && date >= today && date <= lastDay
    );
  };

  let notRead = 0;
  const read = new Set<string>();
  const out = [];
  for (const event of events) {
    const { lead } = event;
    const flaggedSource = lead.lane === "registry" ? flagged.get(lead.source) : undefined;
    if (!flaggedSource || !wantsTime(event)) {
      out.push(event);
      continue;
    }
    const outcome = await readOwnPage(event, ownPageFetcherFor(flaggedSource.source, ports), ports, context, rules, flaggedSource.line);
    if (outcome === "not-read") notRead++;
    else read.add(event.id);
    out.push(outcome === "not-read" ? event : outcome);
  }
  return { events: out, report: [...flagged.values()].map((f) => f.line), notRead, read };
}

/**
 * The second reading for picks (#133). After curation, every active pick with an own page whose span
 * covers a day from today through the horizon (it starts in that range, or started before today and
 * has not ended, #151) has that page read (readOwnPage), the way its source's pages are
 * fetched, unless the own-page time already read it this run, or a run read it before on the date and
 * own page the list still gives (refresh keeps that read), which the report counts as kept.
 */
async function readPicks(
  events: Event[],
  alreadyRead: Set<string>,
  registry: Registry,
  ports: Ports & { model: CappedModel },
  context: ExtractionContext,
  rules: string,
): Promise<{ events: Event[]; report: OwnPagesReport[]; notRead: number }> {
  const { config, today } = context;
  const lastDay = horizonEnd(today, config.horizonWeeks);
  const line = ownPagesLine("Picks");
  const coversHorizon = (e: Event) => {
    const date = calendarDate(e.start);
    if (date === undefined || date > lastDay) return false;
    const end = calendarDate(e.end);
    return date >= today || (end !== undefined && end >= today);
  };
  const isPick = (e: Event) => e.status === "active" && e.dontMiss && e.eventUrl !== undefined && !alreadyRead.has(e.id) && coversHorizon(e);

  let notRead = 0;
  let picks = 0;
  const out = [];
  for (const event of events) {
    if (!isPick(event)) {
      out.push(event);
      continue;
    }
    picks++;
    if (event.ownPageRead !== undefined && samePage(event.ownPageRead.page, event.eventUrl!)) {
      line.kept++;
      out.push(event);
      continue;
    }
    const { lead } = event;
    const source = lead.lane === "registry" ? registry.sources.find((s): s is Source => s.name === lead.source && s.status === "active") : undefined;
    const outcome = await readOwnPage(event, source ? ownPageFetcherFor(source, ports) : plainly(ports), ports, context, rules, line);
    if (outcome === "not-read") notRead++;
    out.push(outcome === "not-read" ? event : outcome);
  }
  return { events: out, report: picks > 0 ? [line] : [], notRead };
}

/** A line of the report's own pages, with nothing read yet. */
function ownPagesLine(source: string): OwnPagesReport {
  return { source, read: 0, timed: 0, priced: 0, aged: 0, dayed: 0, described: 0, kept: 0, dateDisagreements: 0, failed: 0, problems: [] };
}

/**
 * One event's own page fetched by the route given (through the fetch policy) and read, one call, for
 * the time, price, age limit and description (readOwnPageReply). A time on the list's date joins a
 * start that has none; the list stays the primary page, so identity, standing and the date and venue
 * quotes are untouched. The price and age limit are what this read gives, or nothing; a description
 * replaces only none, or one a list line's length (LISTING_LINE_LENGTH) when the page's is longer.
 * Another date is left for a person and reported. Any failure, a fetch or a model call, costs only
 * the read: the event stays as it was, with no strike or outage, and the line says why. Once the
 * spend cap is reached the page is not read, and the caller counts it.
 */
async function readOwnPage(
  event: Event,
  route: FetchRoute,
  ports: Ports & { model: CappedModel },
  context: ExtractionContext,
  rules: string,
  line: OwnPagesReport,
): Promise<Event | "not-read"> {
  const { config, today } = context;
  const url = event.eventUrl!;
  const failed = (problem: string) => {
    line.failed++;
    line.problems.push(`"${event.title}": ${problem}`);
    return event;
  };
  if (ports.model.exhausted()) return "not-read";
  const fetched = await fetchReadable(url, ...route);
  if (!("page" in fetched)) return failed(`${fetched.problem}; nothing taken`);
  const reading = readPage(fetched.page, config);
  let reply: Awaited<ReturnType<ModelPort["complete"]>>;
  try {
    reply = await ports.model.complete(buildOwnPageRequest(event, fetched.page, reading, rules, config, today));
  } catch (error) {
    if (error instanceof SpendCapReached) return "not-read";
    return failed(`${url} not read: ${modelFailed(error)}`);
  }
  const outcome = readOwnPageReply(reply.value, event, reading, config.timezone);
  if (outcome.kind === "unreadable") return failed(`the reply for ${url} was not in the expected shape`);
  line.read++;
  if (outcome.kind === "disagrees") {
    line.dateDisagreements++;
    line.problems.push(`"${event.title}": ${url} gives ${outcome.date}, the list ${calendarDate(event.start)}; nothing taken`);
    return event;
  }
  for (const problem of outcome.problems) line.problems.push(`"${event.title}": ${url} ${problem}`);
  const { start, price, ages, description } = outcome;
  // Days the list's own date line gave (#196) stand unless this page gives its own; its ticket page is not followed for them.
  const listed = fromList(event) ? { value: event.days!, ...event.evidence.days! } : undefined;
  const followed =
    outcome.days === undefined && outcome.ticketPage !== undefined && listed === undefined ? await readTicketPage(event, outcome.ticketPage, route, ports, context, rules, line) : undefined;
  const ownDays = outcome.days ? { ...outcome.days, page: url } : followed !== "unread" ? followed : undefined;
  const days = ownDays ?? listed;
  const timed = start !== undefined && !hasTime(event.start);
  const described =
    description !== undefined && (event.description === undefined || (event.description.length <= LISTING_LINE_LENGTH && description.length > event.description.length));
  if (timed) line.timed++;
  if (price) line.priced++;
  if (ages) line.aged++;
  if (ownDays) line.dayed++;
  if (described) line.described++;
  const { price: _price, ages: _ages, days: _days, ...unread } = event;
  const { price: _priceQuote, ages: _agesQuote, days: _daysQuote, ...evidence } = event.evidence;
  return {
    ...unread,
    ...(timed ? { start: start.value } : {}),
    ...(price ? { price: price.value } : {}),
    ...(ages ? { ages: ages.value } : {}),
    ...(days ? { days: days.value } : {}),
    ...(described ? { description } : {}),
    // A ticket page that could not be read leaves the read unrecorded, so the next run reads both again (#143).
    ...(followed !== "unread" ? { ownPageRead: { page: url, on: today } } : {}),
    evidence: {
      ...evidence,
      ...(timed ? { time: { page: url, quote: start.quote } } : {}),
      ...(price ? { price: { page: url, quote: price.quote } } : {}),
      ...(ages ? { ages: { page: url, quote: ages.quote } } : {}),
      ...(days ? { days: { page: days.page, quote: days.quote } } : {}),
    },
  };
}

/**
 * A run's ticket page, followed from its own page when that gives no weekdays and links a page of performances (#143),
 * fetched and read, one more call, for the days alone. It must be on the run's primary page's site, its own page's, or
 * a ticketing platform, and not the list itself, whose quotes are the list's (#196). It is fetched through the browser, waiting for the platform's selector, on a platform the
 * config lists as rendered by script (platformWaitFor), and the source's way otherwise. A page that could not be read
 * (a fetch or model failure, or the spend cap) is "unread", with a line saying why, so the caller does not record the
 * read and the next run follows the link again; a page read that gives no days, or none that hold, gives undefined.
 */
async function readTicketPage(
  event: Event,
  url: string,
  route: FetchRoute,
  ports: Ports & { model: CappedModel },
  { config, today }: ExtractionContext,
  rules: string,
  line: OwnPagesReport,
): Promise<(Quoted<Weekday[]> & { page: string }) | "unread" | undefined> {
  const note = (text: string) => line.problems.push(`"${event.title}": ${text}`);
  const unread = (text: string) => {
    note(`${text}; no days taken, read again next run`);
    return "unread" as const;
  };
  const { platformHosts, platformWaitFor } = config.discovery;
  if (!ownPageAllowed(url, event.primaryUrl, platformHosts)) {
    note(`${event.eventUrl} links its performances at ${url}, which is not on the venue's site or a ticketing platform; not followed`);
    return undefined;
  }
  // Days quoted from the primary page are the list's (fromList), so a link back to it is not a page of performances.
  if (samePage(url, event.primaryUrl)) {
    note(`${event.eventUrl} links its performances at ${url}, the list itself; not followed`);
    return undefined;
  }
  if (ports.model.exhausted()) return unread(`${url} not read: the spend cap was reached`);
  const waitFor = Object.entries(platformWaitFor).find(([host]) => onHost(url, [host]))?.[1];
  const [fetcher, options] = waitFor !== undefined ? [ports.browserFetcher, { waitFor }] : route;
  const fetched = await fetchReadable(url, fetcher, options);
  if (!("page" in fetched)) return unread(fetched.problem);
  const reading = readPage(fetched.page, config);
  let reply: Awaited<ReturnType<ModelPort["complete"]>>;
  try {
    reply = await ports.model.complete(buildOwnPageRequest(event, fetched.page, reading, rules, config, today, "ticket"));
  } catch (error) {
    return unread(`${url} not read: ${error instanceof SpendCapReached ? "the spend cap was reached" : modelFailed(error)}`);
  }
  const outcome = readTicketPageReply(reply.value, reading);
  if (outcome.kind === "unreadable") return unread(`the reply for ${url} was not in the expected shape`);
  for (const text of outcome.problems) note(`${url} ${text}`);
  return outcome.days === undefined ? undefined : { ...outcome.days, page: url };
}

/** What the two lanes leave for re-verification: which events they sighted, which the hold released this run, and which pages they tried. */
interface LaneOutcome {
  touched: Set<string>;
  /** Events released from the hold for promotion this run (ADR 0012): read from their page whether or not they were ever verified. */
  released: Set<string>;
  attempts: PageAttempts;
}

/** The pages a lane tried this run and how each attempt ended, all as page keys (pageKey), so two spellings of one URL are one page. */
interface PageAttempts {
  /**
   * Every URL requested or redirected to that said something about its page; never one the spend cap kept
   * from being requested, nor a lead that led to an index page. A registry calendar that redirected to an
   * index page is here and in outages too: re-verification checks outages first (#111).
   */
  tried: Set<string>;
  /** URLs that could not be loaded, or whose redirects ended on an index page (a discovery lead, or a registry calendar, #111): an outage, not a reading. */
  outages: Set<string>;
  /** URLs that are gone (404, 410) or that robots.txt disallows: a strike for every event citing them. */
  gone: Set<string>;
  /** Pages that came back but were not read, or not in full: an unreadable reply, the spend cap, or a candidate dropped over its cap. */
  unread: Set<string>;
  /** What each page whose reply was read listed: how many candidates, and the latest start among them (#78). */
  yields: Map<string, PageYield>;
}

function noAttempts(): PageAttempts {
  return { tried: new Set(), outages: new Set(), gone: new Set(), unread: new Set(), yields: new Map() };
}

function combineAttempts(...all: PageAttempts[]): PageAttempts {
  return {
    tried: new Set(all.flatMap((a) => [...a.tried])),
    outages: new Set(all.flatMap((a) => [...a.outages])),
    gone: new Set(all.flatMap((a) => [...a.gone])),
    unread: new Set(all.flatMap((a) => [...a.unread])),
    yields: new Map(all.flatMap((a) => [...a.yields])),
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

/**
 * The fetcher an event's own page goes through: its source's, but a browser waits for the source's
 * `eventPageWaitFor`, else for the network to go quiet, never for the list's `waitFor`, which an own
 * page does not render (#153).
 */
function ownPageFetcherFor(source: Source, ports: Ports): FetchRoute {
  if (source.fetch !== "browser") return plainly(ports);
  return [ports.browserFetcher, source.eventPageWaitFor ? { waitFor: source.eventPageWaitFor } : undefined];
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
  /** Host to an example page, for every host whose page yielded a verified sighting this run, held for promotion or not. */
  hosts: Map<string, string>;
  report: RunReport["discovery"];
  tally: CandidateTally;
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
 * not at all when the registry lane already tried it, nor when its host is an excluded registry
 * source's (ADR 0012): a person took that host out of the run, whichever lane reaches it, and the
 * report counts the leads by source. Once the spend cap is reached, searches and leads still to go
 * are skipped and counted, so nothing is fetched that could not be read. What the lane finds on a host
 * no one admitted is held for promotion after merging (holdForPromotion), not here.
 */
async function discover(ports: Ports & { model: CappedModel }, context: ExtractionContext, registry: Registry, registryTried: Set<string>): Promise<DiscoveryLaneOutcome> {
  const { config } = context;
  const outcome: DiscoveryLaneOutcome = {
    sightings: [],
    attempts: noAttempts(),
    hosts: new Map(),
    report: { enabled: config.discovery.enabled, queries: 0, aggregatorPages: 0, pagesExtracted: 0, problems: [], leadsOnExcludedSources: [] },
    tally: noTally(),
    pagesNotExtracted: 0,
    queriesNotSearched: 0,
    leadsNotFollowed: 0,
  };
  const { report, attempts } = outcome;
  /** Pages followed this run, as page keys. */
  const followed = new Set<string>();

  /** Whether a lead is on an excluded source's host, before its fetch or where its redirects ended; counted for the report by source. */
  const onExcludedHost = (url: string): boolean => {
    const excluded = excludedSourceOnHost(url, registry);
    if (!excluded) return false;
    const line = report.leadsOnExcludedSources.find((l) => l.source === excluded.name);
    if (line) line.leads++;
    else report.leadsOnExcludedSources.push({ source: excluded.name, reason: excluded.reason, leads: 1 });
    return true;
  };

  /** The page behind a lead not yet followed this run, or nothing: already followed, an excluded host, the cap, or a problem fetching it. */
  const follow = async (url: string): Promise<FetchResult | undefined> => {
    if (followed.has(pageKey(url)) || registryTried.has(pageKey(url))) return undefined;
    followed.add(pageKey(url));
    if (onExcludedHost(url)) return undefined;
    if (ports.model.exhausted()) {
      outcome.leadsNotFollowed++;
      return undefined;
    }
    const fetched = await fetchReadable(url, ports.fetcher);
    if ("page" in fetched) return fetched.page;
    if (fetched.failure === "outage") attempts.outages.add(pageKey(url));
    else attempts.gone.add(pageKey(url));
    report.problems.push(fetched.problem);
    return undefined;
  };

  /**
   * A lead's page read as a primary page. A lead counts as tried only once its fetch has said
   * something about the page: it loaded, or it is gone. One the cap skipped is no reading, so
   * re-verification is left to judge it, and one that could not be loaded is an outage. One whose
   * redirects end on an index page cannot be read as a primary page either; it is an outage too, so
   * the events citing it are held up to the outage limit rather than struck.
   */
  const readPrimaryPage = async (url: string, query: string) => {
    const page = await follow(url);
    if (!page) {
      if (attempts.gone.has(pageKey(url))) attempts.tried.add(pageKey(url));
      return;
    }
    const pageUrls = [url, page.finalUrl].map(pageKey);
    if (isIndexPage(page.finalUrl, config)) {
      attempts.outages.add(pageKey(url));
      report.problems.push(`${url} led to an index page and was not extracted`);
      return;
    }
    // A lead whose redirects end on an excluded host is not read either (ADR 0012); like one that could not be read, it says nothing about its events.
    if (onExcludedHost(page.finalUrl)) {
      attempts.outages.add(pageKey(url));
      return;
    }
    for (const u of pageUrls) attempts.tried.add(u);
    let read: Awaited<ReturnType<typeof extractPage>>;
    try {
      read = await extractPage(page, { lane: "discovery", query }, ports.model, context);
    } catch (error) {
      for (const u of pageUrls) attempts.unread.add(u);
      if (error instanceof SpendCapReached) outcome.pagesNotExtracted++;
      else report.problems.push(`${url} not extracted: ${modelFailed(error)}`);
      return;
    }
    report.pagesExtracted++;
    addTally(outcome.tally, read.tally);
    report.problems.push(...read.problems);
    if (!readInFull(read)) for (const u of pageUrls) attempts.unread.add(u);
    if (!read.sightings) return;
    for (const u of pageUrls) attempts.yields.set(u, yieldOf(read.sightings, read.tally));
    outcome.sightings.push(...read.sightings);
    const host = hostOf(page.finalUrl);
    if (host && !outcome.hosts.has(host) && read.sightings.some((s) => s.event.status === "active")) outcome.hosts.set(host, normalizeUrl(page.finalUrl, url));
  };

  const readIndex = async (url: string, query: string) => {
    const page = await follow(url);
    if (!page) return;
    report.aggregatorPages++;
    for (const link of outboundLinks(page, config)) await readPrimaryPage(link, query);
  };

  const queries = config.discovery.enabled ? discoveryQueries(config, context.today) : [];
  for (const [i, query] of queries.entries()) {
    if (ports.model.exhausted()) {
      outcome.queriesNotSearched++;
      continue;
    }
    let results: Awaited<ReturnType<Ports["search"]["search"]>>;
    try {
      results = await ports.search.search(query);
    } catch (error) {
      // A spent quota fails every query the same way: say so once and make no more.
      if (error instanceof SearchQuotaExhausted) {
        report.problems.push(`search quota exhausted (${errorMessage(error)}); ${plural(queries.length - i - 1, "search", "searches")} not made`);
        break;
      }
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
 * Every event not expired at a venue the config's venueNeighborhoods maps (#150), by its display name (see
 * venueAndRoom), placed in the venue's neighborhood, whatever its page said or was stored; never the catch-all, so
 * it carries no unplaced mark. For the report, each venue that moved an event, and how many. An expired event is
 * left as it is: a reading that revives it is placed again then.
 */
function placeMappedVenues(events: Event[], list: string[], config: RunConfig) {
  const mapped = new Map(Object.entries(config.venueNeighborhoods).map(([venue, n]) => [normalizeName(venue), { venue, neighborhood: placeStored(n, list, config) }]));
  const report: RunReport["venueNeighborhoods"] = [];
  const placed = events.map((event) => {
    if (event.status === "expired" || event.venue === undefined) return event;
    const entry = mapped.get(normalizeName(venueAndRoom(event.venue, config.venueAliases).venue));
    if (entry === undefined || entry.neighborhood === event.neighborhood) return event;
    const line = report.find((r) => r.venue === entry.venue);
    if (line) line.events++;
    else report.push({ venue: entry.venue, placed: entry.neighborhood, events: 1 });
    const { unplaced: _, ...rest } = event;
    return { ...rest, neighborhood: entry.neighborhood };
  });
  return { events: placed, report };
}

/**
 * Every event not expired whose stored neighborhood is off the list, placed again (see placeStored),
 * and for the report, each stored value, where it went, and how many events. A config that renames or
 * regroups neighborhoods would otherwise leave the old names on every event no page re-reads,
 * unnoticed. One in the catch-all not marked unplaced, placed there before #104 or by this, is marked with
 * no proposal, so the next report knows this one counted it (#104). An expired event is left as it is: a
 * reading that revives it places it from its page.
 */
function placeOffList(events: Event[], list: string[], config: RunConfig, registry: Registry) {
  const report: RunReport["offListNeighborhoods"] = [];
  const placed = events.map((event) => {
    if (event.status === "expired") return event;
    const { lead } = event;
    const source = lead.lane === "registry" ? registry.sources.find((s) => s.name === lead.source) : undefined;
    const neighborhood = placeStored(event.neighborhood, list, config, source?.neighborhood);
    const mark = neighborhood === ELSEWHERE_IN_THE_METRO && event.unplaced === undefined ? { unplaced: {} } : {};
    if (neighborhood === event.neighborhood) return { ...event, ...mark };
    const line = report.find((r) => r.stored === event.neighborhood && r.placed === neighborhood);
    if (line) line.events++;
    else report.push({ stored: event.neighborhood, placed: neighborhood, events: 1 });
    return { ...event, neighborhood, ...mark };
  });
  return { events: placed, report };
}

/**
 * Curation: every event due for it (active, not recurring, new or changed since last judged) goes
 * to the curation model in batches with the curation prompt. A judgment is applied to the event it
 * names; an event the reply does not name, or names with a flag but no why-line or one past the
 * cap, is left unjudged
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
      if (whyLineOverCap(judgment)) {
        report.problems.push(`"${event.title}" was flagged with a why-line past the ${WHY_LINE_CAP}-character cap and was left unjudged`);
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
 * The run report's unmappable neighborhoods (#104): every record not expired that ends the run in the
 * catch-all, read from the records rather than this run's readings, since a reading in the catch-all
 * may not be the one that stands. Each is marked listed before when it began the run in the catch-all,
 * not expired, marked unplaced with the same proposal: a run since #104 wrote it so, and that run's
 * report listed it, or counted it when it had no venue. It is counted now but not listed again.
 */
function unmappableNeighborhoods(previous: Event[], events: Event[]): RunReport["unmappableNeighborhoods"] {
  const inCatchAll = (e: Event) => e.status !== "expired" && e.neighborhood === ELSEWHERE_IN_THE_METRO;
  const proposedBefore = new Map(previous.filter((e) => inCatchAll(e) && e.unplaced !== undefined).map((e) => [e.id, e.unplaced!.proposed]));
  return events.filter(inCatchAll).map((e) => {
    const proposed = e.unplaced?.proposed;
    return {
      eventId: e.id,
      eventTitle: e.title,
      ...(e.venue !== undefined ? { venue: e.venue } : {}),
      ...(proposed !== undefined ? { proposed } : {}),
      // A record marked with no proposal maps to undefined, so has() tells it from one not marked or not there.
      listedBefore: proposedBefore.has(e.id) && proposedBefore.get(e.id) === proposed,
    };
  });
}

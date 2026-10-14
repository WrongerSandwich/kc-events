import { z } from "zod";
import { EXPIRY_REASONS, type ExpiryReason } from "./dataset.js";
import { ARCHIVE_AFTER_WEEKS } from "./archive.js";
import { markdownList, plural, tableCell } from "./markdown.js";
import type { ModelCall } from "./spend.js";

export type SourceResult = "fetched" | "failed" | "blocked" | "excluded";

export interface SourceReport {
  name: string;
  result: SourceResult;
  /** Candidate events extracted from this source this run. */
  extracted: number;
  /** Why a source was blocked, failed, or excluded. */
  detail?: string;
}

/**
 * One flagged source's own-page reads this run (#123), or the picks' (#133, source "Picks"): pages
 * read, times, prices, age limits and descriptions filled, picks kept from an earlier read, dates that
 * disagreed with the list, reads that failed, and a line for each of the last two and for any value not taken.
 */
export interface OwnPagesReport {
  source: string;
  read: number;
  timed: number;
  priced: number;
  aged: number;
  described: number;
  kept: number;
  dateDisagreements: number;
  failed: number;
  problems: string[];
}

/** Candidates the run's page readings dropped or could not cite, by cause. */
export interface CandidateTally {
  /** Dropped because their page placed them outside the geography, or as an away game a team's schedule names no venue for (#81). */
  outsideGeography: number;
  /** Skipped because their title is a promotion's: a business's standing night, a watch party (#81). */
  skippedPromotion: number;
  /** Skipped because they are not open to the public: a graduation, a board meeting, an online session (#81). */
  skippedNotPublic: number;
  /** Dropped because a field the model wrote ran past its length cap. */
  overCap: number;
  /** Held uncitable because a date or time the model wrote does not exist, or the end came before the start. */
  unusableDates: number;
  /** Held unverified because a quote the model gave for the date or venue is not on the page (#74). */
  quoteNotOnPage: number;
}

/** An event as the report names it: by title and primary page. */
export interface EventRef {
  title: string;
  primaryUrl: string;
}

/** The record of one run, committed as Markdown with a JSON twin. */
export interface RunReport {
  /** Local calendar date of the run; reports are named by it. */
  runDate: string;
  startedAt: string;
  finishedAt: string;
  horizonWeeks: number;
  counts: CandidateTally & {
    found: number;
    new: number;
    updated: number;
    reverified: number;
    heldUnverified: number;
    /** Active events whose primary page could not be loaded this run, or loaded and read as listing nothing where three or more active events cite it (#78), held as they were. */
    heldThroughOutage: number;
    /** Active events whose lead source is excluded from the registry, so their primary page was not fetched (#78); held as through an outage. */
    heldSourceExcluded: number;
    /** Events whose primary page loaded without them, left unstruck because they start after the horizon, which extraction is not asked to read. */
    beyondHorizonUnstruck: number;
    /** Events whose primary page loaded without them, left unstruck because they start after the latest start it listed this run: its window stops short of them (#78). */
    beyondListingUnstruck: number;
    /** Active events made unverified this run by their third consecutive outage. */
    unverifiedByOutageLimit: number;
    /** Active events made unverified this run because their page still lists them but a re-reading cited no date or venue. */
    unverifiedByUncitableReading: number;
    /** Active events an own-page reading held only on a quote left active on their stored citation (#124). */
    keptOnStoredCitation: number;
    /** Venue-less sightings that fit two or more known events with none preferred, so no record was made: nothing publishable anyway (#77). */
    venuelessAmbiguous: number;
    /** Discovery-led events held for promotion this run (ADR 0012): found on a host no active registry source is on and no ticketing platform, new this run or read before the rule. */
    heldForPromotion: number;
    /** Events released this run because a person promoted their host into the registry; re-verified against their page from here on. */
    releasedForPromotion: number;
    expired: Record<ExpiryReason, number>;
    /** Expired records moved out of the live dataset into the archive this run: gone more than eight weeks (#82). */
    archived: number;
  };
  spend: {
    totalUsd: number;
    capUsd: number;
    /** Spend reached the cap and it cut work: some model call the run needed was not made. */
    capHit: boolean;
    /**
     * What the cap left undone: fetched pages never extracted, events never re-verified,
     * discovery searches never made and leads never followed, and events due for curation never judged.
     */
    shortfall: { pagesNotExtracted: number; eventsNotReverified: number; queriesNotSearched: number; leadsNotFollowed: number; eventsNotCurated: number; ownPagesNotRead: number };
    /** Every model call that went out, with what OpenRouter's activity page lists it by; the JSON twin only. */
    modelCalls: ModelCall[];
  };
  /** The discovery lane this run; all zero when it is disabled. */
  discovery: {
    enabled: boolean;
    /** Searches made. */
    queries: number;
    /** Index pages (aggregator pages and platform listings) read for their links; never extracted. Named before platform listings counted. */
    aggregatorPages: number;
    /** Primary pages found by discovery and handed to extraction. */
    pagesExtracted: number;
    /** Leads that could not be fetched, searches that failed, and replies that could not be read. */
    problems: string[];
    /** Leads not followed because their host is an excluded registry source's (ADR 0012): the source, its reason, and how many. */
    leadsOnExcludedSources: { source: string; reason: string; leads: number }[];
  };
  /**
   * Re-verification this run: pages re-fetched and not re-read because the model call threw, leaving
   * their events as they were; pages read as listing nothing where several active events cite them,
   * counted as an outage; and excluded sources whose events were not fetched (#78).
   */
  reverification: { problems: string[] };
  /** Don't-miss curation this run: only events new or changed since last judged are sent, so a quiet run makes no calls. */
  curation: {
    /** Curation model calls made; events go in batches. */
    calls: number;
    /** Events that received a judgment. */
    judged: number;
    /** Of those, events flagged don't-miss. */
    flagged: number;
    /** Replies that could not be read, events the model did not answer, and flags with no why-line. */
    problems: string[];
  };
  sources: SourceReport[];
  /** Own pages read for a time the list does not give, by flagged source (#123). */
  ownPages: OwnPagesReport[];
  /** Registry sources at three or more consecutive failures. */
  failingSources: string[];
  /**
   * Stored neighborhoods off the list: for events not expired that no page placed this run, each
   * neighborhood value no longer on the list, where those events were placed again, and how many.
   */
  offListNeighborhoods: { stored: string; placed: string; events: number }[];
  /**
   * Unmappable neighborhoods: every record not expired that ends the run in the elsewhere-in-the-metro
   * catch-all (#104), with the neighborhood or city the extractor proposed instead, when it proposed
   * one, and whether an earlier report listed it (or counted it, having no venue): the record began the
   * run in the catch-all, marked unplaced by a run since #104, with the same proposal. The Markdown
   * lists only the rest. Reports before #104 listed this run's readings instead, with no id and
   * nothing listed before.
   */
  unmappableNeighborhoods: { eventId?: string; eventTitle: string; venue?: string; proposed?: string; listedBefore: boolean }[];
  /**
   * Hosts the discovery lane has found events on in two or more runs, including this one, suggested
   * for promotion into the registry; never added to it automatically.
   */
  promotionSuggestions: { host: string; runsSeen: number; exampleUrl: string; heldEvents: number }[];
  /** Events held for promotion this run, by host (ADR 0012). */
  heldForPromotion: { host: string; events: number }[];
  /** Events released this run by a host's promotion, by host. */
  releasedForPromotion: { host: string; events: number }[];
  /** The events unverified by the outage limit this run; re-checked each run until their page lists them again. */
  outageLimited: EventRef[];
  /** The events unverified by an uncitable re-reading this run; a model wobble shows up here. Re-checked each run until a reading is verified again. */
  uncitableReadings: EventRef[];
  /**
   * The events kept active on their stored citation this run (#124): a re-reading of their own page
   * quoted something not on it, but their stored quotes are on it and the reading agrees. The failed
   * quote is the model's, kept here so its variance stays visible.
   */
  keptOnStoredCitation: (EventRef & { failedQuote: string })[];
  /**
   * Cancellations the run did not apply: a page off the event's own site, found by discovery, said a
   * known event is cancelled (ADR 0008, amended #75). The event was left as it was; its own page decides.
   */
  cancellationsFromElsewhere: (EventRef & { reportedBy: string })[];
  /** Events whose title or primary page changed this run, as they are now and as they were (#82): a flap shows here the week it happens. */
  identityChurn: (EventRef & { was: EventRef })[];
  /** What changed on the site this run, for its changes page (#135; runChanges). Absent in reports before it. */
  changes?: RunChanges;
}

/** An event in the changes section: its id, for the site to find it by, and what the Markdown lists. */
export type ChangeRef = EventRef & { id: string };

/** The run's difference from the dataset it started from, as the site's changes page shows it (#135). */
export interface RunChanges {
  /** The last successful run of the dataset this run started from; null on the first run. */
  comparedWith: string | null;
  /** Active and flagged don't-miss now, and not flagged before. */
  newPicks: ChangeRef[];
  /** Active before and now, with the start it had before. */
  moved: (ChangeRef & { from: string })[];
  /** Active before, and expired this run as cancelled or as no longer listed (two strikes). */
  gone: (ChangeRef & { reason: "cancelled" | "two-strike" })[];
}

const count = z.number().int().nonnegative();
/** A count, or a list, that a report written before it existed does not carry: zero, or empty. */
const countSince = count.default(0);
/** A flag that a report written before it existed does not carry: false. */
const flagSince = z.boolean().default(false);
const listSince = <T extends z.ZodType>(item: T) => z.array(item).default([]);
const eventRef = z.strictObject({ title: z.string(), primaryUrl: z.string() });
const changeRef = eventRef.extend({ id: z.string() });
const hostEvents = z.strictObject({ host: z.string(), events: count });
const servedBy = z.strictObject({ model: z.string(), provider: z.string().optional(), generationId: z.string() });

/**
 * The JSON twin as committed in `data/runs/`. A field added after the first run defaults to zero or
 * empty, as a report written before it would have counted it, so every committed report parses into
 * today's `RunReport`; a key this does not name is refused, so a renamed field fails here first.
 */
export const runReportSchema: z.ZodType<RunReport, unknown> = z.strictObject({
  runDate: z.iso.date(),
  startedAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }),
  horizonWeeks: z.number().int().positive(),
  counts: z.strictObject({
    found: count,
    new: count,
    updated: count,
    reverified: count,
    heldUnverified: count,
    heldThroughOutage: countSince,
    heldSourceExcluded: countSince,
    beyondHorizonUnstruck: countSince,
    beyondListingUnstruck: countSince,
    unverifiedByOutageLimit: countSince,
    unverifiedByUncitableReading: countSince,
    keptOnStoredCitation: countSince,
    venuelessAmbiguous: countSince,
    heldForPromotion: countSince,
    releasedForPromotion: countSince,
    outsideGeography: count,
    skippedPromotion: countSince,
    skippedNotPublic: countSince,
    overCap: countSince,
    unusableDates: countSince,
    quoteNotOnPage: countSince,
    expired: z.strictObject(Object.fromEntries(EXPIRY_REASONS.map((r) => [r, countSince])) as Record<ExpiryReason, typeof countSince>),
    archived: countSince,
  }),
  spend: z.strictObject({
    totalUsd: z.number().nonnegative(),
    capUsd: z.number().positive(),
    capHit: z.boolean(),
    shortfall: z.strictObject({ pagesNotExtracted: count, eventsNotReverified: count, queriesNotSearched: count, leadsNotFollowed: count, eventsNotCurated: count, ownPagesNotRead: countSince }),
    modelCalls: listSince(
      z.union([
        z.strictObject({ model: z.string(), servedBy: servedBy.optional(), costUsd: z.number().nonnegative() }),
        z.strictObject({ model: z.string(), servedBy: servedBy.optional(), costUsd: z.number().nonnegative().optional(), error: z.string() }),
      ]),
    ),
  }),
  discovery: z.strictObject({
    enabled: z.boolean(),
    queries: count,
    aggregatorPages: count,
    pagesExtracted: count,
    problems: z.array(z.string()),
    leadsOnExcludedSources: listSince(z.strictObject({ source: z.string(), reason: z.string(), leads: count })),
  }),
  reverification: z.strictObject({ problems: z.array(z.string()) }).default({ problems: [] }),
  curation: z.strictObject({ calls: count, judged: count, flagged: count, problems: z.array(z.string()) }),
  sources: z.array(z.strictObject({ name: z.string(), result: z.enum(["fetched", "failed", "blocked", "excluded"]), extracted: count, detail: z.string().optional() })),
  ownPages: listSince(
    z.strictObject({
      source: z.string(),
      read: count,
      timed: count,
      priced: countSince,
      aged: countSince,
      described: countSince,
      kept: countSince,
      dateDisagreements: count,
      failed: count,
      problems: z.array(z.string()),
    }),
  ),
  failingSources: z.array(z.string()),
  offListNeighborhoods: listSince(z.strictObject({ stored: z.string(), placed: z.string(), events: count })),
  unmappableNeighborhoods: z.array(
    z.strictObject({ eventId: z.string().optional(), eventTitle: z.string(), venue: z.string().optional(), proposed: z.string().optional(), listedBefore: flagSince }),
  ),
  promotionSuggestions: z.array(z.strictObject({ host: z.string(), runsSeen: count, exampleUrl: z.string(), heldEvents: countSince })),
  heldForPromotion: listSince(hostEvents),
  releasedForPromotion: listSince(hostEvents),
  outageLimited: listSince(eventRef),
  uncitableReadings: listSince(eventRef),
  keptOnStoredCitation: listSince(eventRef.extend({ failedQuote: z.string() })),
  cancellationsFromElsewhere: listSince(eventRef.extend({ reportedBy: z.string() })),
  identityChurn: listSince(eventRef.extend({ was: eventRef })),
  changes: z
    .strictObject({
      comparedWith: z.iso.datetime({ offset: true }).nullable(),
      newPicks: z.array(changeRef),
      moved: z.array(changeRef.extend({ from: z.string() })),
      gone: z.array(changeRef.extend({ reason: z.enum(["cancelled", "two-strike"]) })),
    })
    .optional(),
});

/** Reads a committed JSON twin, filling the fields it predates. */
export function parseRunReport(raw: unknown): RunReport {
  return runReportSchema.parse(raw);
}

export function renderReportMarkdown(report: RunReport): string {
  const { counts, spend } = report;
  return `# Run report ${report.runDate}

Started ${report.startedAt}, finished ${report.finishedAt}. Horizon ${report.horizonWeeks} weeks.

## Counts

| Count | Value |
| --- | ---: |
| Found | ${counts.found} |
| New | ${counts.new} |
| Updated | ${counts.updated} |
| Re-verified | ${counts.reverified} |
| Held unverified | ${counts.heldUnverified} |
| Held through an outage | ${counts.heldThroughOutage} |
| Held: lead source excluded | ${counts.heldSourceExcluded} |
| Not struck: starts after the horizon | ${counts.beyondHorizonUnstruck} |
| Not struck: starts after the last date the page listed | ${counts.beyondListingUnstruck} |
| Unverified by outage limit | ${counts.unverifiedByOutageLimit} |
| Unverified by an uncitable re-reading | ${counts.unverifiedByUncitableReading} |
| Kept on its stored citation | ${counts.keptOnStoredCitation} |
| Not created: a venue-less sighting fitting more than one known event, none preferred | ${counts.venuelessAmbiguous} |
| Held for promotion | ${counts.heldForPromotion} |
| Released for promotion | ${counts.releasedForPromotion} |
| Dropped: outside geography | ${counts.outsideGeography} |
| Skipped as promotion | ${counts.skippedPromotion} |
| Skipped as not public | ${counts.skippedNotPublic} |
| Dropped: a field past its length cap | ${counts.overCap} |
| Uncitable: a date or time that does not exist, or an end before the start | ${counts.unusableDates} |
| Unverified: a quote not on its page | ${counts.quoteNotOnPage} |
| Stored neighborhoods off the list, placed again | ${report.offListNeighborhoods.reduce((n, r) => n + r.events, 0)} |
${EXPIRY_REASONS.map((reason) => `| Expired: ${reason} | ${counts.expired[reason]} |`).join("\n")}
| Archived: expired more than ${ARCHIVE_AFTER_WEEKS} weeks back | ${counts.archived} |
| Identity churn: title or primary page changed | ${report.identityChurn.length} |

## Spend

${spend.totalUsd.toFixed(4)} USD of a ${spend.capUsd} USD cap.${spend.capHit ? ` **Cap hit: no model calls were made after it.** Shortfall: ${plural(spend.shortfall.pagesNotExtracted, "page")} not extracted, ${plural(spend.shortfall.eventsNotReverified, "event")} not re-verified, ${plural(spend.shortfall.queriesNotSearched, "discovery search", "discovery searches")} not made, ${plural(spend.shortfall.leadsNotFollowed, "discovery lead")} not followed, ${plural(spend.shortfall.eventsNotCurated, "event")} not curated, ${plural(spend.shortfall.ownPagesNotRead, "own page")} not read; they stay as they were and are checked next run.` : ""}

## Sources

${
  report.sources.length === 0
    ? "_No sources checked._"
    : [
        "| Source | Result | Extracted | Detail |",
        "| --- | --- | ---: | --- |",
        ...report.sources.map((s) => `| ${tableCell(s.name)} | ${s.result} | ${s.extracted} | ${tableCell(s.detail ?? "")} |`),
      ].join("\n")
}

## Own pages

${markdownList(
  report.ownPages.flatMap((o) => [
    `${o.source}: ${plural(o.read, "own page")} read, ${plural(o.timed, "time")}, ${plural(o.priced, "price")}, ${plural(o.aged, "age limit")}, ${plural(o.described, "description")} filled, ${o.kept} kept from an earlier read, ${plural(o.dateDisagreements, "date disagreement")}, ${plural(o.failed, "failure")}`,
    ...o.problems.map((p) => `${o.source}: ${p}`),
  ]),
)}

## Discovery

${
  report.discovery.enabled
    ? `${plural(report.discovery.queries, "search", "searches")}, ${plural(report.discovery.aggregatorPages, "index page")} read for links, ${plural(report.discovery.pagesExtracted, "primary page")} extracted.${
        report.discovery.leadsOnExcludedSources.length > 0
          ? `\n\n${markdownList(report.discovery.leadsOnExcludedSources.map((l) => `${plural(l.leads, "lead")} not followed: ${l.source} is excluded (${l.reason})`))}`
          : ""
      }${report.discovery.problems.length > 0 ? `\n\n${markdownList(report.discovery.problems)}` : ""}`
    : "_Disabled._"
}

## Re-verification

${markdownList(report.reverification.problems)}

## Curation

${plural(report.curation.judged, "event")} judged in ${plural(report.curation.calls, "call")}, ${report.curation.flagged} flagged don't-miss.${
  report.curation.problems.length > 0 ? `\n\n${markdownList(report.curation.problems)}` : ""
}

## Failing sources

${markdownList(report.failingSources)}

## Unmappable neighborhoods

${unmappableSection(report.unmappableNeighborhoods)}

## Stored neighborhoods off the list

${markdownList(report.offListNeighborhoods.map((r) => `"${r.stored}": ${plural(r.events, "event")} placed in ${r.placed}`))}

## Unverified by outage limit

${eventList(report.outageLimited)}

## Unverified by an uncitable re-reading

${eventList(report.uncitableReadings)}

## Kept on its stored citation

${markdownList(report.keptOnStoredCitation.map((e) => `${e.title}: ${e.primaryUrl} (${e.failedQuote})`))}

## Cancellations from elsewhere

${markdownList(report.cancellationsFromElsewhere.map((c) => `${c.reportedBy} says ${c.title} (${c.primaryUrl}) is cancelled; the event was left as it was`))}

## Identity churn

${markdownList(report.identityChurn.map((c) => `${c.was.title} (${c.was.primaryUrl}) is now ${c.title} (${c.primaryUrl})`))}

## Held for promotion

${markdownList([
  ...report.heldForPromotion.map((h) => `${h.host}: ${plural(h.events, "event")} held`),
  ...report.releasedForPromotion.map((h) => `${h.host}: ${plural(h.events, "event")} released`),
])}

## Promotion suggestions

${markdownList(report.promotionSuggestions.map((p) => `${p.host}: events found in ${p.runsSeen} runs, ${plural(p.heldEvents, "held event")} promotion would release, e.g. ${p.exampleUrl}`))}
${report.changes === undefined ? "" : changesSection(report.changes)}`;
}

/** The site's changes page in words (#135): new picks, moves with the start they had, and what went. */
function changesSection(changes: RunChanges): string {
  const heading = changes.comparedWith === null ? "## Changes (first run)" : `## Changes since the run of ${changes.comparedWith}`;
  const lines = [
    ...changes.newPicks.map((e) => `${e.title} (${e.primaryUrl}), a new pick`),
    ...changes.moved.map((e) => `${e.title} (${e.primaryUrl}), from ${e.from}`),
    ...changes.gone.map((e) => `${e.title} (${e.primaryUrl}), ${e.reason === "cancelled" ? "cancelled" : "no longer listed"}`),
  ];
  return `\n${heading}\n\n${markdownList(lines)}\n`;
}

/**
 * The records ending the run in the catch-all (#104): a line counting them all and those an earlier
 * report listed or counted, then the rest, but for those with no venue, which are counted in one line.
 */
function unmappableSection(inCatchAll: RunReport["unmappableNeighborhoods"]): string {
  if (inCatchAll.length === 0) return markdownList([]);
  const before = inCatchAll.filter((u) => u.listedBefore).length;
  const ofThem = before === 0 ? "none" : before === inCatchAll.length ? "all" : `${before}`;
  const newHere = inCatchAll.filter((u) => !u.listedBefore);
  const venueless = newHere.filter((u) => u.venue === undefined).length;
  const lines = [
    ...newHere
      .filter((u) => u.venue !== undefined)
      .map((u) => `${u.eventTitle} at ${u.venue}: ${u.proposed !== undefined ? `the extractor proposed "${u.proposed}"` : "no neighborhood proposed"}`),
    ...(venueless > 0 ? [`${plural(venueless, "new one", "new ones")} with no venue`] : []),
  ];
  const total = `In the catch-all as the run ends: ${plural(inCatchAll.length, "event")}, ${ofThem} of them in an earlier report.`;
  return lines.length === 0 ? total : `${total}\n\n${markdownList(lines)}`;
}

function eventList(events: EventRef[]): string {
  return markdownList(events.map((e) => `${e.title}: ${e.primaryUrl}`));
}

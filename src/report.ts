import { EXPIRY_REASONS, type ExpiryReason } from "./dataset.js";
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
    /** Venue-less sightings that fit two or more known events with none preferred, so no record was made: nothing publishable anyway (#77). */
    venuelessAmbiguous: number;
    /** Discovery-led events held for promotion this run (ADR 0012): found on a host no active registry source is on and no ticketing platform, new this run or read before the rule. */
    heldForPromotion: number;
    /** Events released this run because a person promoted their host into the registry; re-verified against their page from here on. */
    releasedForPromotion: number;
    expired: Record<ExpiryReason, number>;
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
    shortfall: { pagesNotExtracted: number; eventsNotReverified: number; queriesNotSearched: number; leadsNotFollowed: number; eventsNotCurated: number };
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
  /** Registry sources at three or more consecutive failures. */
  failingSources: string[];
  /**
   * Stored neighborhoods off the list: for events not expired that no page placed this run, each
   * neighborhood value no longer on the list, where those events were placed again, and how many.
   */
  offListNeighborhoods: { stored: string; placed: string; events: number }[];
  /**
   * Unmappable neighborhoods: events whose address landed in the elsewhere-in-the-metro catch-all,
   * with the neighborhood or city the extractor proposed instead, when it proposed one.
   */
  unmappableNeighborhoods: { eventTitle: string; venue?: string; proposed?: string }[];
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
   * Cancellations the run did not apply: a page off the event's own site, found by discovery, said a
   * known event is cancelled (ADR 0008, amended #75). The event was left as it was; its own page decides.
   */
  cancellationsFromElsewhere: (EventRef & { reportedBy: string })[];
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

## Spend

${spend.totalUsd.toFixed(4)} USD of a ${spend.capUsd} USD cap.${spend.capHit ? ` **Cap hit: no model calls were made after it.** Shortfall: ${plural(spend.shortfall.pagesNotExtracted, "page")} not extracted, ${plural(spend.shortfall.eventsNotReverified, "event")} not re-verified, ${plural(spend.shortfall.queriesNotSearched, "discovery search", "discovery searches")} not made, ${plural(spend.shortfall.leadsNotFollowed, "discovery lead")} not followed, ${plural(spend.shortfall.eventsNotCurated, "event")} not curated; they stay as they were and are checked next run.` : ""}

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

${markdownList(
  report.unmappableNeighborhoods.map(
    (c) => `${c.eventTitle} at ${c.venue ?? "an unnamed venue"}: ${c.proposed !== undefined ? `the extractor proposed "${c.proposed}"` : "no neighborhood proposed"}`,
  ),
)}

## Stored neighborhoods off the list

${markdownList(report.offListNeighborhoods.map((r) => `"${r.stored}": ${plural(r.events, "event")} placed in ${r.placed}`))}

## Unverified by outage limit

${eventList(report.outageLimited)}

## Unverified by an uncitable re-reading

${eventList(report.uncitableReadings)}

## Cancellations from elsewhere

${markdownList(report.cancellationsFromElsewhere.map((c) => `${c.reportedBy} says ${c.title} (${c.primaryUrl}) is cancelled; the event was left as it was`))}

## Held for promotion

${markdownList([
  ...report.heldForPromotion.map((h) => `${h.host}: ${plural(h.events, "event")} held`),
  ...report.releasedForPromotion.map((h) => `${h.host}: ${plural(h.events, "event")} released`),
])}

## Promotion suggestions

${markdownList(report.promotionSuggestions.map((p) => `${p.host}: events found in ${p.runsSeen} runs, ${plural(p.heldEvents, "held event")} promotion would release, e.g. ${p.exampleUrl}`))}
`;
}

function eventList(events: EventRef[]): string {
  return markdownList(events.map((e) => `${e.title}: ${e.primaryUrl}`));
}

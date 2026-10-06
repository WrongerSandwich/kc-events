import { EXPIRY_REASONS, type ExpiryReason } from "./dataset.js";
import { markdownList, plural, tableCell } from "./markdown.js";

export type SourceResult = "fetched" | "failed" | "blocked" | "excluded";

export interface SourceReport {
  name: string;
  result: SourceResult;
  /** Candidate events extracted from this source this run. */
  extracted: number;
  /** Why a source was blocked, failed, or excluded. */
  detail?: string;
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
  counts: {
    found: number;
    new: number;
    updated: number;
    reverified: number;
    heldUnverified: number;
    /** Active events whose primary page could not be loaded this run, held as they were. */
    heldThroughOutage: number;
    /** Active events made unverified this run by their third consecutive outage. */
    unverifiedByOutageLimit: number;
    /** Active events made unverified this run because their page still lists them but a re-reading cited no date or venue. */
    unverifiedByUncitableReading: number;
    /** Candidates dropped because their page placed them outside the geography. */
    outsideGeography: number;
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
  };
  /** Re-verification this run: pages re-fetched and not re-read because the model call threw, leaving their events as they were. */
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
  promotionSuggestions: { host: string; runsSeen: number; exampleUrl: string }[];
  /** The events unverified by the outage limit this run; re-checked each run until their page lists them again. */
  outageLimited: EventRef[];
  /** The events unverified by an uncitable re-reading this run; a model wobble shows up here. Re-checked each run until a reading is verified again. */
  uncitableReadings: EventRef[];
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
| Unverified by outage limit | ${counts.unverifiedByOutageLimit} |
| Unverified by an uncitable re-reading | ${counts.unverifiedByUncitableReading} |
| Dropped: outside geography | ${counts.outsideGeography} |
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
        report.discovery.problems.length > 0 ? `\n\n${markdownList(report.discovery.problems)}` : ""
      }`
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

## Promotion suggestions

${markdownList(report.promotionSuggestions.map((p) => `${p.host}: events found in ${p.runsSeen} runs, e.g. ${p.exampleUrl}`))}
`;
}

function eventList(events: EventRef[]): string {
  return markdownList(events.map((e) => `${e.title}: ${e.primaryUrl}`));
}

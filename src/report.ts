import type { ExpiryReason } from "./dataset.js";

export type SourceResult = "fetched" | "failed" | "blocked" | "excluded";

export interface SourceReport {
  name: string;
  result: SourceResult;
  /** Candidate events extracted from this source this run. */
  extracted: number;
  /** Why a source was blocked, failed, or excluded. */
  detail?: string;
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
    /** Candidates dropped because their page placed them outside the geography. */
    outsideGeography: number;
    expired: Record<ExpiryReason, number>;
  };
  spend: {
    totalUsd: number;
    capUsd: number;
    /** Spend reached the cap, so any model call after that point was not made. */
    capHit: boolean;
    /** What the cap left undone: fetched pages never extracted, and events never re-verified. */
    shortfall: { pagesNotExtracted: number; eventsNotReverified: number };
  };
  sources: SourceReport[];
  /** Registry sources at three or more consecutive failures. */
  failingSources: string[];
  /**
   * Unmappable neighborhoods: events whose address landed in the elsewhere-in-the-metro catch-all,
   * with the neighborhood or city the extractor proposed instead, when it proposed one.
   */
  unmappableNeighborhoods: { eventTitle: string; venue?: string; proposed?: string }[];
  /** Discovery sources found twice, suggested for promotion; never added to the registry automatically. */
  promotionSuggestions: string[];
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function markdownList(items: string[]): string {
  return items.length === 0 ? "_None._" : items.map((i) => `- ${i}`).join("\n");
}

/** Keeps free text (error messages, reasons) from breaking a Markdown table row. */
function tableCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
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
| Dropped: outside geography | ${counts.outsideGeography} |
| Expired: past | ${counts.expired.past} |
| Expired: two-strike | ${counts.expired["two-strike"]} |
| Expired: cancelled | ${counts.expired.cancelled} |

## Spend

${spend.totalUsd.toFixed(4)} USD of a ${spend.capUsd.toFixed(2)} USD cap.${spend.capHit ? ` **Cap hit: no model calls were made after it.** Shortfall: ${plural(spend.shortfall.pagesNotExtracted, "page")} not extracted, ${plural(spend.shortfall.eventsNotReverified, "event")} not re-verified; they stay as they were and are checked next run.` : ""}

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

## Failing sources

${markdownList(report.failingSources)}

## Unmappable neighborhoods

${markdownList(
  report.unmappableNeighborhoods.map(
    (c) => `${c.eventTitle} at ${c.venue ?? "an unnamed venue"}: ${c.proposed !== undefined ? `the extractor proposed "${c.proposed}"` : "no neighborhood proposed"}`,
  ),
)}

## Promotion suggestions

${markdownList(report.promotionSuggestions)}
`;
}

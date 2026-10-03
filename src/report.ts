import type { ExpiryReason } from "./dataset.js";

export type SourceResult = "fetched" | "failed" | "blocked" | "excluded";

export interface SourceReport {
  name: string;
  result: SourceResult;
  /** Candidate events extracted from this source this run. */
  extracted: number;
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
    expired: Record<ExpiryReason, number>;
  };
  spend: { totalUsd: number; capUsd: number; capHit: boolean };
  sources: SourceReport[];
  /** Registry sources at three or more consecutive failures. */
  failingSources: string[];
  /** Unmappable neighborhoods: events whose address landed in a neighborhood catch-all. */
  unmappableNeighborhoods: { eventTitle: string; venue: string; neighborhood: string }[];
  /** Discovery sources found twice, suggested for promotion; never added to the registry automatically. */
  promotionSuggestions: string[];
}

function markdownList(items: string[]): string {
  return items.length === 0 ? "_None._" : items.map((i) => `- ${i}`).join("\n");
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
| Expired: past | ${counts.expired.past} |
| Expired: two-strike | ${counts.expired["two-strike"]} |
| Expired: cancelled | ${counts.expired.cancelled} |

## Spend

${spend.totalUsd.toFixed(4)} USD of a ${spend.capUsd.toFixed(2)} USD cap.${spend.capHit ? " **Cap hit: the run stopped early and remaining candidates stay unverified.**" : ""}

## Sources

${
  report.sources.length === 0
    ? "_No sources checked._"
    : ["| Source | Result | Extracted |", "| --- | --- | ---: |", ...report.sources.map((s) => `| ${s.name} | ${s.result} | ${s.extracted} |`)].join("\n")
}

## Failing sources

${markdownList(report.failingSources)}

## Unmappable neighborhoods

${markdownList(report.unmappableNeighborhoods.map((c) => `${c.eventTitle} at ${c.venue}: ${c.neighborhood}`))}

## Promotion suggestions

${markdownList(report.promotionSuggestions)}
`;
}

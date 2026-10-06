/**
 * The milestone-one grading document (spec #1, ticket #11): four counts as headings. Counts three
 * and four are filled from the run report and dataset by this module; counts one and two are
 * Evan's. Everything this module writes sits between marker comments, so re-rendering after a
 * repeated run replaces only those blocks and keeps the hand-written text around them.
 */
import { citedDate, type Dataset, type Event } from "./dataset.js";
import { hiddenSinceVerified } from "./expiry.js";
import { normalizeName } from "./identity.js";
import { markdownTable, plural, tableCell } from "./markdown.js";
import type { RunReport } from "./report.js";
import { horizonEnd } from "./time.js";

/** What makes a run the milestone run, and what passes count four. */
const MILESTONE = {
  horizonWeeks: 3,
  capUsd: 5,
  /** The monthly figure Evan is willing to pay for years. */
  passLineUsdPerMonth: 15,
  /** Weekly runs: 52 a year over 12 months. */
  runsPerMonth: 52 / 12,
} as const;

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export interface GradingInput {
  report: RunReport;
  dataset: Dataset;
  /** The document as it stands, when it exists: its filled blocks are replaced and the rest is kept. */
  existing?: string;
}

/**
 * The grading document for a milestone run. Rendered fresh when none exists; otherwise the filled
 * blocks in the existing document are replaced and everything Evan wrote around them is kept.
 */
export function renderGrading({ report, dataset, existing }: GradingInput): string {
  if (report.horizonWeeks !== MILESTONE.horizonWeeks) {
    throw new Error(`run ${report.runDate} has horizon ${report.horizonWeeks} weeks; the milestone run has ${MILESTONE.horizonWeeks}`);
  }
  if (report.spend.capUsd !== MILESTONE.capUsd) {
    throw new Error(`run ${report.runDate} has cap ${report.spend.capUsd} USD; the milestone run has ${MILESTONE.capUsd}`);
  }
  const blocks: Record<string, string> = {
    header: `Run ${report.runDate} (\`data/runs/${report.runDate}.md\`), horizon ${report.horizonWeeks} weeks, cap ${report.spend.capUsd} USD.`,
    "count-3": countThree(report, dataset),
    "count-4": countFour(report),
  };
  if (existing === undefined) return template(blocks);
  return Object.entries(blocks).reduce((doc, [id, body]) => replaceBlock(doc, id, body), existing);
}

const begin = (id: string) => `<!-- grading:begin ${id} -->`;
const end = (id: string) => `<!-- grading:end ${id} -->`;
const block = (id: string, body: string) => `${begin(id)}\n${body}\n${end(id)}`;

function replaceBlock(doc: string, id: string, body: string): string {
  const from = doc.indexOf(begin(id));
  const to = doc.indexOf(end(id));
  if (from === -1 || to === -1 || to < from) {
    throw new Error(`the grading document has lost its "${id}" markers; restore them, or delete the file to render it fresh`);
  }
  return doc.slice(0, from) + block(id, body) + doc.slice(to + end(id).length);
}

function template(blocks: Record<string, string>): string {
  return `# Milestone one grading

${block("header", blocks.header!)}

Counts one and two are Evan's: write under their headings. Counts three and four are filled by \`pnpm grade\` from the run report and dataset, and their marked blocks are replaced on every re-run; write outside the markers, never inside.

## 1. Found and would propose

## 2. Missed that friends knew about

## 3. Wrong or unverifiable dates and venues

${block("count-3", blocks["count-3"]!)}

### Wrong dates or venues found

## 4. Cost per run, extrapolated monthly

${block("count-4", blocks["count-4"]!)}

## Result
`;
}

function countThree(report: RunReport, dataset: Dataset): string {
  const unverified = dataset.events.filter((e) => e.status === "unverified");
  const active = dataset.events.filter((e) => e.status === "active");
  const doubts = active.flatMap((e) => auditDoubts(e, report).map((doubt) => `- ${e.title}: ${doubt} (${e.primaryUrl})`));

  return `Count three: **${report.counts.heldUnverified} unverifiable** (held, never published) plus whatever the audit records under "Wrong dates or venues found" below.

Unverifiable: ${report.counts.heldUnverified} held unverified this run; ${plural(unverified.length, "event is", "events are")} unverified in the dataset. None of them is published.

${markdownTable(
  ["Event", "Primary page", "Why unverified"],
  unverified.map((e) => [tableCell(e.title), e.primaryUrl, whyUnverified(e)]),
  "_No unverified events._",
)}

Wrong: ${plural(active.length, "active event is", "active events are")} published. Each date and venue below was read from the page named, and the text it was read from is beside it. ${doubts.length === 0 ? "Nothing was flagged mechanically" : `${plural(doubts.length, "reading was", "readings were")} flagged mechanically`}; the audit checks every row against its primary page regardless.

### Flagged for checking

${doubts.length === 0 ? "_None._" : doubts.join("\n")}

### Every active reading

${markdownTable(
  ["Event", "Date read", "Venue read", "Date evidence", "Venue evidence", "Primary page"],
  active.map((e) => [tableCell(e.title), tableCell(dateRead(e)), tableCell(e.venue), tableCell(e.evidence.date), tableCell(e.evidence.venue), e.primaryUrl]),
  "_No active events._",
)}`;
}

/** Why cite-or-drop held an event: what could not be read, or that its page was never fetched. */
function whyUnverified(e: Event): string {
  if (hiddenSinceVerified(e)) return "verified before; since hidden by an outage limit or an uncitable re-reading";
  const noDate = citedDate(e) === undefined || e.evidence.date === undefined;
  const noVenue = e.venue === undefined || e.evidence.venue === undefined;
  if (noDate && noVenue) return "no date or venue could be cited";
  if (noDate) return "no date could be cited";
  if (noVenue) return "no venue could be cited";
  return "primary page not fetched this run";
}

function dateRead(e: Event): string {
  if (e.recurrence === "recurring") return e.schedule ?? "";
  const show = (iso: string) => (iso.includes("T") ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso);
  if (e.start === undefined) return e.end === undefined ? "" : `through ${show(e.end)}`;
  return e.end === undefined ? show(e.start) : `${show(e.start)} to ${show(e.end)}`;
}

/**
 * Mechanical doubts about one active event's readings, for the audit to settle: a date whose
 * evidence does not carry its day or month, a venue whose evidence does not carry its name, a
 * one-off already past, or a start beyond the horizon. Recurring events have a schedule phrase
 * instead of a date, so only their venue is checked.
 */
function auditDoubts(e: Event, report: Pick<RunReport, "runDate" | "horizonWeeks">): string[] {
  const doubts: string[] = [];
  const dateEvidence = (e.evidence.date ?? "").toLowerCase();
  if (e.recurrence !== "recurring") {
    for (const iso of [e.start, e.end].filter((d): d is string => d !== undefined)) {
      const [, month, day] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
      if (!new RegExp(`(^|[^0-9])0?${day}([^0-9]|$)`).test(dateEvidence)) doubts.push(`the date evidence does not mention day ${day}`);
      const monthName = MONTHS[month - 1]!;
      const mentionsMonth = dateEvidence.includes(monthName.slice(0, 3)) || new RegExp(`(^|[^0-9])0?${month}[/.-]`).test(dateEvidence);
      if (!mentionsMonth) doubts.push(`the date evidence does not mention ${monthName[0]!.toUpperCase()}${monthName.slice(1)}`);
    }
    const lastDay = horizonEnd(report.runDate, report.horizonWeeks);
    if (e.start !== undefined && e.start.slice(0, 10) > lastDay) doubts.push(`starts ${e.start.slice(0, 10)}, after the horizon ends on ${lastDay}`);
    const last = (e.end ?? e.start)?.slice(0, 10);
    if (e.recurrence === "one-off" && last !== undefined && last < report.runDate) doubts.push(`ended ${last}, before the run date`);
  }
  if (e.venue !== undefined && !normalizeName(e.evidence.venue ?? "").includes(normalizeName(e.venue))) {
    doubts.push(`the venue evidence does not mention "${e.venue}"`);
  }
  return doubts;
}

function countFour(report: RunReport): string {
  const perRun = report.spend.totalUsd;
  const monthly = perRun * MILESTONE.runsPerMonth;
  const verdict = monthly <= MILESTONE.passLineUsdPerMonth ? "pass" : "fail";
  const coldStart = report.counts.reverified === 0 && report.counts.new > 0;
  return `This run cost ${perRun.toFixed(4)} USD of the ${report.spend.capUsd} USD cap in model calls. Weekly, that is ${monthly.toFixed(2)} USD a month against the ${MILESTONE.passLineUsdPerMonth} USD pass line.${
    coldStart
      ? ` This was a first run: every event was new and every eligible one was judged, with nothing to re-verify. A steady weekly run re-fetches each active event's primary page and judges only what changed, so its cost differs from this one in both directions.`
      : ""
  } Search is not in the figure: ${plural(report.discovery.queries, "Tavily search", "Tavily searches")} this run, against a free tier of 1,000 a month.

Count four: **${verdict}**.`;
}

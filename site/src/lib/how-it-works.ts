/**
 * The How it works page's words for the figures it is given (src/generated/how-it-works.ts): money, a run's length
 * and day, a cron line's days and time, and the spend bar's shares.
 */
import { formatLong, formatTime } from "./dates";
import type { RunFigures } from "./types";

/** Who does a step: the colour key the page's diagrams carry (DESIGN.md, The Diagram-Roles Exception). */
export type Role = "network" | "extraction" | "curation" | "code" | "hand";
/** What a box in a diagram is tinted as: a role, the dataset, a warning, or nothing. */
export type Tone = Role | "data" | "warn" | "plain";

export const ROLE_NAMES: Record<Role, string> = {
  network: "Network",
  extraction: "Extraction model",
  curation: "Curation model",
  code: "Code",
  hand: "By hand",
};

/** A model call's stage (MODEL_STAGES in the job's src/ports.ts), as the spend bar names it. */
export const STAGE_NAMES: Record<string, string> = {
  extraction: "Reading list pages",
  discovery: "Discovery",
  reverification: "Re-verification",
  "own-page": "Own pages",
  "ticket-page": "Ticket pages",
  curation: "Curation",
};

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** A count for running prose: a word up to twelve (the site's house style), figures with their commas past it. */
export function inWords(n: number): string {
  return WORDS[n] ?? n.toLocaleString("en-US");
}

/**
 * One run's count where a sentence speaks of every run ("reads about 60 calendars"): the nearest ten from twenty up,
 * since next week's count will differ by a few, and the count itself below that.
 */
export function roughly(n: number): string {
  return n < 20 ? inWords(n) : `about ${Math.round(n / 10) * 10}`;
}

/** "$0.69"; an amount that would round to no cents is "under $0.01", and nothing at all is "$0.00". */
export function usd(n: number): string {
  if (n > 0 && n < 0.005) return "under $0.01";
  return `$${n.toFixed(2)}`;
}

/** "23 min", "1 h", "1 h 12 min". */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "November 16", from a report's run date. */
export function runDay(runDate: string): string {
  return formatLong(runDate).replace(/^[^,]+, /, "");
}

const CRON_DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/**
 * The days and time of a cron line that fires once a day or once a week ("17 6 * * 1" is Mondays at 6:17 am), which is
 * all the job's schedule holds; any other line throws, so a schedule the page cannot say is never said wrongly.
 */
export function cronWhen(expr: string): { days: string; time: string } {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* (\*|[0-6])$/.exec(expr);
  if (!m) throw new Error(`cronWhen reads a daily or weekly cron line, not "${expr}"`);
  const time = formatTime(`2000-01-01T${m[2]!.padStart(2, "0")}:${m[1]!.padStart(2, "0")}`);
  return { days: m[3] === "*" ? "every day" : CRON_DAYS[Number(m[3])]!, time };
}

/** The least of the bar a stage that spent anything is given, so a half-cent stage can still be seen. */
const MIN_SHARE = 2;

/**
 * The spend bar's segments: each stage that spent anything, in the order given, with its share of the bar in whole
 * percents that sum to 100. No segments when nothing was spent.
 */
export function barShares(stages: RunFigures["stages"]): { stage: string; calls: number; usd: number; share: number }[] {
  const spent = stages.filter((s) => s.usd > 0);
  const total = spent.reduce((sum, s) => sum + s.usd, 0);
  if (total === 0) return [];
  const shares = spent.map((s) => ({ ...s, share: Math.max(MIN_SHARE, Math.round((s.usd / total) * 100)) }));
  // Rounding and the floor leave the sum a point or two off 100: the widest segment takes the difference.
  const widest = shares.reduce((a, b) => (b.share > a.share ? b : a));
  widest.share += 100 - shares.reduce((sum, s) => sum + s.share, 0);
  return shares;
}

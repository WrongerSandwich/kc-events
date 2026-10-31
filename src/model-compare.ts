/**
 * The extraction model comparison (#222): every candidate model reads the same saved pages through
 * the run's own extraction (`extractPage`), several times each, and this scores what came back. It
 * does no I/O; `model-compare-cli.ts` fetches, calls, and writes.
 *
 * What is scored, per model: whether its quotes are on the page (the run's own check), how stable its
 * readings of one page are from one repeat to the next, how many candidates it finds, how far its
 * verified readings agree with the stored records, a few known hard cases, and cost, time and failures.
 *
 * And, per set-up of one or two reads of every page (#223), what the run's own merge makes of the
 * stored dataset from them: `measureSetups`.
 */
import type { Event, Weekday } from "./dataset.js";
import { comparable, type ExtractionContext, type SightedPage, type Sighting } from "./extraction.js";
import { pageKey } from "./hosts.js";
import { sameName, type VenueAliases } from "./identity.js";
import { likelyDuplicate } from "./likely-duplicates.js";
import { foldDuplicates, mergeSightings } from "./run.js";

/** One event as a trial read it: the fields scored, kept small so a comparison's trials fit in one file. */
export interface TrialEvent {
  title: string;
  start?: string;
  end?: string;
  schedule?: string;
  venue?: string;
  recurrence: Event["recurrence"];
  days?: Weekday[];
  kind: string;
  status: Event["status"];
  primaryUrl: string;
  /** Which quote was not on the page, when one was not. */
  quoteProblem?: string;
  dateEvidence?: string;
  venueEvidence?: string;
}

/** One model reading one saved page once. */
export interface Trial {
  model: string;
  /** The saved page's key, the same for every model and repeat. */
  page: string;
  source: string;
  repeat: number;
  costUsd: number;
  ms: number;
  /** Why the call or its reply failed; nothing else is scored for a failed trial but its cost and time. */
  error?: string;
  /** Candidates the model returned, before the run's skips and drops. */
  extracted?: number;
  events?: TrialEvent[];
  /** The sightings themselves, for the two-read measure (#223); trials saved before it have none. */
  sightings?: TrialSighting[];
}

/** A sighting as a trial saves it: the quote problem's phrase, without the page (#251), which the saved page gives again. */
export type TrialSighting = Omit<Sighting, "quoteProblem" | "page"> & { quoteProblem?: string };

export function trialSighting({ quoteProblem, page: _page, ...rest }: Sighting): TrialSighting {
  return { ...rest, ...(quoteProblem !== undefined ? { quoteProblem: quoteProblem.phrase } : {}) };
}

export function trialEvent({ event, quoteProblem }: Sighting): TrialEvent {
  return {
    title: event.title,
    ...(event.start !== undefined ? { start: event.start } : {}),
    ...(event.end !== undefined ? { end: event.end } : {}),
    ...(event.schedule !== undefined ? { schedule: event.schedule } : {}),
    ...(event.venue !== undefined ? { venue: event.venue } : {}),
    recurrence: event.recurrence,
    ...(event.days !== undefined ? { days: event.days } : {}),
    kind: event.kind,
    status: event.status,
    primaryUrl: event.primaryUrl,
    ...(quoteProblem !== undefined ? { quoteProblem: quoteProblem.phrase } : {}),
    ...(event.evidence.date !== undefined ? { dateEvidence: event.evidence.date } : {}),
    ...(event.evidence.venue !== undefined ? { venueEvidence: event.evidence.venue } : {}),
  };
}

/** A reading known to be easy to get wrong, and what a right one looks like. */
export interface HardCase {
  label: string;
  /** Whether a trial event is this case's event. */
  matches(e: TrialEvent): boolean;
  /** What is wrong with a reading of it, or undefined when it is right. */
  problem(e: TrialEvent): string | undefined;
}

const titled = (fragment: string, host: string) => (e: TrialEvent) => comparable(e.title).includes(comparable(fragment)) && new URL(e.primaryUrl).hostname.endsWith(host);
const day = (iso: string | undefined) => iso?.slice(0, 10);
const time = (iso: string | undefined) => (iso !== undefined && iso.length > 10 ? iso.slice(11, 16) : undefined);
/** The last day of a dated reading: its end's, or its start's when it gives no end, so a same-day end is no disagreement. */
const lastDay = (e: { start?: string; end?: string }) => day(e.end) ?? day(e.start);
const sameDays = (a: Weekday[] | undefined, b: Weekday[]) => (a ?? []).join() === b.join();
const firstProblem = (...checks: [boolean, string][]) => checks.find(([ok]) => !ok)?.[1];

function run(start: string, end: string, days?: Weekday[]): HardCase["problem"] {
  return (e) =>
    firstProblem(
      [e.recurrence === "limited-run", `read as ${e.recurrence}${e.schedule ? ` ("${e.schedule}")` : ""}`],
      [day(e.start) === start && day(e.end) === end, `span ${day(e.start)} to ${day(e.end)}`],
      [days === undefined ? e.days === undefined : sameDays(e.days, days), `days ${e.days?.join(",") ?? "none"}`],
    );
}

/** The 10-23 traps (#154, #218, #221): a dated run read as a schedule, a weekend run's days, a year-round market's season read as a run, a doors time taken as the start. */
export const HARD_CASES: HardCase[] = [
  { label: "Secret Show: dated monthly run, no days", matches: titled("The Secret Show", "kccrossroads.org"), problem: run("2026-10-02", "2027-02-05") },
  { label: "Merry Market: weekend run, Sat+Sun", matches: titled("Merry Market", "artgardenkc.org"), problem: run("2026-11-28", "2026-12-20", ["Sat", "Sun"]) },
  // Year-round with hours by season ("Nov. 1 – Nov. 22: Sat & Sun", "Jan–Feb: Saturdays only"): one season's line is not a run that ends.
  {
    label: "Farmers Market: year-round, stays recurring",
    matches: titled("Farmers Market", "thecitymarketkc.org"),
    problem: (e) => (e.recurrence === "recurring" ? undefined : `read as ${e.recurrence} ${day(e.start)} to ${day(e.end)}`),
  },
  {
    label: "Kenneth Spencer: start 19:00, not doors",
    matches: titled("Kenneth Spencer Lecture", "liberty-hall.com"),
    problem: (e) => (time(e.start) === "19:00" ? undefined : `start ${time(e.start) ?? "no time"}`),
  },
];

export interface HardCaseScore {
  label: string;
  /** Trials of the case's page, a failed call included. */
  read: number;
  /** Of those, the trials with a verified, right reading. */
  right: number;
  /** What the others got: "call failed", "not found", "unverified (quote …)", or the problem, with how often. */
  misses: Record<string, number>;
}

export interface StoredDisagreement {
  title: string;
  field: "date" | "time" | "venue" | "recurrence";
  stored: string;
  read: string;
  /** In how many trials the reading disagreed so. */
  times: number;
}

export interface ModelScore {
  model: string;
  calls: number;
  failed: number;
  /** Each failure's message, cut short, with how often. */
  failures: Record<string, number>;
  costUsd: number;
  /** Mean cost of a call that went through. */
  costPerPage: number;
  medianMs: number;
  /** Events kept after the run's skips and drops, per successful trial. */
  eventsPerPage: number;
  verified: number;
  /** Candidates the run would hold unverified because a quote was not on the page. */
  quoteMisses: number;
  /** Candidates with no usable date or no venue quoted, so never citable. */
  uncited: number;
  /** verified / (verified + quoteMisses). */
  quotePassRate: number;
  /** Mean, over pages, of the mean pairwise overlap (Jaccard) of the repeats' event sets by title and date. */
  setStability: number;
  /** Of the events read in two or more repeats of a page, the share every one of those repeats read alike. */
  fieldStability: number;
  /** Verified readings that matched a stored active record by page and title. */
  storedMatched: number;
  storedAgreement: { date: number; time: number; venue: number; recurrence: number };
  storedDisagreements: StoredDisagreement[];
  hardCases: HardCaseScore[];
}

const ratio = (n: number, d: number) => (d === 0 ? Number.NaN : n / d);
const median = (xs: number[]) => {
  if (xs.length === 0) return Number.NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const mean = (xs: number[]) => (xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length);

/** An event's identity within one page: its title and first date, or "recurring". */
export function eventKey(e: Pick<TrialEvent, "title" | "start">): string {
  return `${comparable(e.title)}|${day(e.start) ?? "recurring"}`;
}

/** The fields two readings of one event must share to count as read alike. */
function shape(e: TrialEvent): string {
  return JSON.stringify([e.start ?? null, lastDay(e) === day(e.start) ? null : (e.end ?? null), e.schedule ? comparable(e.schedule) : null, e.venue ? comparable(e.venue) : null, e.recurrence, e.days ?? null, e.status]);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let both = 0;
  for (const k of a) if (b.has(k)) both++;
  return both / (a.size + b.size - both);
}

/** Pairwise mean overlap of the repeats' event sets for each page any repeat found something on, then the mean of those. */
function setStability(byPage: Map<string, TrialEvent[][]>): number {
  const perPage: number[] = [];
  for (const repeats of byPage.values()) {
    if (repeats.length < 2 || repeats.every((r) => r.length === 0)) continue;
    const sets = repeats.map((r) => new Set(r.map(eventKey)));
    const pairs: number[] = [];
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) pairs.push(jaccard(sets[i]!, sets[j]!));
    perPage.push(mean(pairs));
  }
  return mean(perPage);
}

function fieldStability(byPage: Map<string, TrialEvent[][]>): number {
  let seen = 0;
  let alike = 0;
  for (const repeats of byPage.values()) {
    // One reading per event per repeat (the first, when a page lists it twice), so repeats are compared with each other, not themselves.
    const shapes = new Map<string, string[]>();
    for (const events of repeats) {
      const once = new Map<string, string>();
      for (const e of events) if (!once.has(eventKey(e))) once.set(eventKey(e), shape(e));
      for (const [key, s] of once) shapes.set(key, [...(shapes.get(key) ?? []), s]);
    }
    for (const readings of shapes.values()) {
      if (readings.length < 2) continue;
      seen++;
      if (readings.every((s) => s === readings[0])) alike++;
    }
  }
  return ratio(alike, seen);
}

/** The stored active record a verified reading is of: same page and title, the same first date when there are several. */
function storedFor(e: TrialEvent, stored: Map<string, Event[]>): Event | undefined {
  const candidates = stored.get(`${e.primaryUrl}|${comparable(e.title)}`) ?? [];
  return candidates.find((s) => day(s.start) === day(e.start)) ?? candidates[0];
}

function compareStored(trials: Trial[], dataset: Event[]) {
  const stored = new Map<string, Event[]>();
  for (const s of dataset) {
    if (s.status !== "active") continue;
    const key = `${s.primaryUrl}|${comparable(s.title)}`;
    stored.set(key, [...(stored.get(key) ?? []), s]);
  }
  const agree = { date: 0, time: 0, venue: 0, recurrence: 0 };
  const disagreements = new Map<string, StoredDisagreement>();
  let matched = 0;
  const differ = (title: string, field: StoredDisagreement["field"], was: string, now: string) => {
    const key = `${title}|${field}|${was}|${now}`;
    const known = disagreements.get(key);
    if (known) known.times++;
    else disagreements.set(key, { title, field, stored: was, read: now, times: 1 });
  };
  for (const trial of trials) {
    for (const e of trial.events ?? []) {
      if (e.status !== "active") continue;
      const s = storedFor(e, stored);
      if (s === undefined) continue;
      matched++;
      const checks: [StoredDisagreement["field"], string, string][] = [
        ["date", s.recurrence === "recurring" ? "recurring" : `${day(s.start)}–${lastDay(s)}`, e.recurrence === "recurring" ? "recurring" : `${day(e.start)}–${lastDay(e)}`],
        ["time", time(s.start) ?? "none", time(e.start) ?? "none"],
        ["venue", comparable(s.venue ?? ""), comparable(e.venue ?? "")],
        ["recurrence", s.recurrence, e.recurrence],
      ];
      for (const [field, was, now] of checks) {
        if (was === now) agree[field]++;
        else differ(s.title, field, was, now);
      }
    }
  }
  return {
    matched,
    agreement: { date: ratio(agree.date, matched), time: ratio(agree.time, matched), venue: ratio(agree.venue, matched), recurrence: ratio(agree.recurrence, matched) },
    disagreements: [...disagreements.values()].sort((a, b) => b.times - a.times || a.title.localeCompare(b.title)),
  };
}

/** One model's trials of a hard case's pages: those any model's trial found the case on, so never finding it counts as a miss. */
function scoreHardCase(hardCase: HardCase, trials: Trial[], pages: Set<string>): HardCaseScore {
  const misses: Record<string, number> = {};
  const miss = (why: string) => (misses[why] = (misses[why] ?? 0) + 1);
  let read = 0;
  let right = 0;
  for (const trial of trials) {
    if (!pages.has(trial.page)) continue;
    read++;
    if (trial.events === undefined) {
      miss("call failed");
      continue;
    }
    const found = trial.events.filter(hardCase.matches);
    if (found.length === 0) {
      miss("not found");
      continue;
    }
    if (found.some((e) => e.status === "active" && hardCase.problem(e) === undefined)) {
      right++;
      continue;
    }
    const e = found.find((x) => x.status === "active") ?? found[0]!;
    miss(e.status !== "active" ? `unverified${e.quoteProblem ? ` (${e.quoteProblem})` : ""}` : hardCase.problem(e)!);
  }
  return { label: hardCase.label, read, right, misses };
}

/** Every model's score, from all of its trials, in the order the models are given. */
export function scoreModels(models: string[], trials: Trial[], dataset: Event[], hardCases: HardCase[] = HARD_CASES): ModelScore[] {
  const casePages = hardCases.map((c) => new Set(trials.filter((t) => t.events?.some(c.matches)).map((t) => t.page)));
  return models.map((model) => {
    const mine = trials.filter((t) => t.model === model);
    const ok = mine.filter((t) => t.error === undefined);
    const failures: Record<string, number> = {};
    for (const t of mine) if (t.error !== undefined) failures[t.error.slice(0, 120)] = (failures[t.error.slice(0, 120)] ?? 0) + 1;
    const events = ok.flatMap((t) => t.events ?? []);
    const verified = events.filter((e) => e.status === "active").length;
    const quoteMisses = events.filter((e) => e.quoteProblem !== undefined).length;
    const byPage = new Map<string, TrialEvent[][]>();
    for (const t of ok) byPage.set(t.page, [...(byPage.get(t.page) ?? []), t.events ?? []]);
    const stored = compareStored(ok, dataset);
    return {
      model,
      calls: mine.length,
      failed: mine.length - ok.length,
      failures,
      costUsd: mine.reduce((sum, t) => sum + t.costUsd, 0),
      costPerPage: mean(ok.map((t) => t.costUsd)),
      medianMs: median(ok.map((t) => t.ms)),
      eventsPerPage: ratio(events.length, ok.length),
      verified,
      quoteMisses,
      uncited: events.length - verified - quoteMisses,
      quotePassRate: ratio(verified, verified + quoteMisses),
      setStability: setStability(byPage),
      fieldStability: fieldStability(byPage),
      storedMatched: stored.matched,
      storedAgreement: stored.agreement,
      storedDisagreements: stored.disagreements,
      hardCases: hardCases.map((c, i) => scoreHardCase(c, mine, casePages[i]!)),
    };
  });
}

const pct = (x: number) => (Number.isNaN(x) ? "–" : `${(x * 100).toFixed(1)}%`);
const usd = (x: number, digits = 4) => (Number.isNaN(x) ? "–" : `$${x.toFixed(digits)}`);
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export interface ComparisonMeta {
  date: string;
  pages: number;
  sources: number;
  repeats: number;
  capUsd: number;
  spentUsd: number;
  capHit: boolean;
  /** Pages the run would have read that could not be fetched, by source. */
  unfetched: string[];
}

/** The comparison as Markdown: the summary table, the hard cases, failures, and where each model disagreed with the stored records. */
export function renderComparison(scores: ModelScore[], meta: ComparisonMeta): string {
  const lines: string[] = [];
  lines.push(`# Extraction model comparison ${meta.date}`, "");
  lines.push(
    `${meta.pages} saved page(s) from ${meta.sources} active registry source(s), each read ${meta.repeats} time(s) by each model through the run's own extraction (\`extractPage\`: the same rules, schema, skips and quote check). ` +
      `Its trials cost ${usd(meta.spentUsd, 2)} in all (each invocation capped at ${usd(meta.capUsd, 2)})${meta.capHit ? " (**cap hit**: later trials were not made, so the models are not scored on the same calls)" : ""}. Made by \`pnpm compare-models\` (#222).`,
    "",
  );
  if (meta.unfetched.length > 0) lines.push(`Not fetched: ${meta.unfetched.join("; ")}.`, "");

  lines.push("## Summary", "");
  lines.push("| Model | Quote pass | Set stability | Field stability | Events/page | Verified | Quote misses | Failed calls | $/page | Total | Median s |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const s of scores) {
    lines.push(
      `| \`${s.model}\` | ${pct(s.quotePassRate)} | ${pct(s.setStability)} | ${pct(s.fieldStability)} | ${Number.isNaN(s.eventsPerPage) ? "–" : s.eventsPerPage.toFixed(1)} | ${s.verified} | ${s.quoteMisses} | ${s.failed} of ${s.calls} | ${usd(s.costPerPage)} | ${usd(s.costUsd, 3)} | ${Number.isNaN(s.medianMs) ? "–" : (s.medianMs / 1000).toFixed(1)} |`,
    );
  }
  lines.push(
    "",
    "- **Quote pass**: of the candidates with a usable date and a venue quoted, the share whose quotes are on the page; the rest the run would hold unverified (#220).",
    "- **Set stability**: how far the repeats of one page find the same events (by title and first date), averaged over pages.",
    "- **Field stability**: of the events found in two or more repeats of a page, the share read identically every time (dates, times, schedule, venue, recurrence, days, verified or not).",
    "",
  );

  lines.push("## Agreement with the stored records", "");
  lines.push(
    "Verified readings matched to a stored active record by page and title. The stored records are mostly `openai/gpt-6-luna`'s own past readings (some hand-fixed), so this leans toward it: a disagreement is something to read, not a wrong answer.",
    "",
  );
  lines.push("| Model | Matched | Date | Time | Venue | Recurrence |", "| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const s of scores) {
    const a = s.storedAgreement;
    lines.push(`| \`${s.model}\` | ${s.storedMatched} | ${pct(a.date)} | ${pct(a.time)} | ${pct(a.venue)} | ${pct(a.recurrence)} |`);
  }
  lines.push("");

  lines.push("## Hard cases", "");
  lines.push("Right means a verified reading with the right fields, out of the model's trials of the case's page (a failed call counts as a miss).", "");
  const labels = scores[0]?.hardCases.map((c) => c.label) ?? [];
  lines.push(`| Model | ${labels.map(cell).join(" | ")} |`, `| --- |${labels.map(() => " :---: |").join("")}`);
  for (const s of scores) lines.push(`| \`${s.model}\` | ${s.hardCases.map((c) => (c.read === 0 ? "–" : `${c.right}/${c.read}`)).join(" | ")} |`);
  lines.push("");
  for (const s of scores) {
    const missed = s.hardCases.filter((c) => Object.keys(c.misses).length > 0);
    if (missed.length === 0) continue;
    lines.push(`- \`${s.model}\`: ${missed.map((c) => `${c.label.split(":")[0]}: ${Object.entries(c.misses).map(([why, n]) => `${why} ×${n}`).join(", ")}`).join("; ")}`);
  }
  lines.push("");

  const failing = scores.filter((s) => s.failed > 0);
  if (failing.length > 0) {
    lines.push("## Failed calls", "");
    for (const s of failing) lines.push(`- \`${s.model}\`: ${Object.entries(s.failures).map(([why, n]) => `${cell(why)} ×${n}`).join("; ")}`);
    lines.push("");
  }

  lines.push("## Disagreements with the stored records", "");
  for (const s of scores) {
    lines.push(`### \`${s.model}\``, "");
    if (s.storedDisagreements.length === 0) {
      lines.push("_None._", "");
      continue;
    }
    const shown = s.storedDisagreements.slice(0, 25);
    for (const d of shown) lines.push(`- ${cell(d.title)}: ${d.field} stored "${cell(d.stored)}", read "${cell(d.read)}"${d.times > 1 ? ` ×${d.times}` : ""}`);
    if (s.storedDisagreements.length > shown.length) lines.push(`- …and ${s.storedDisagreements.length - shown.length} more (in the trials file)`);
    lines.push("");
  }
  return lines.join("\n");
}

/** One way of reading every page on Monday: one model once, one model twice, or two models once each (#223). */
export interface ReadSetup {
  label: string;
  models: [string] | [string, string];
}

/** A saved page as the measure needs it: its key in the trials, where it ended up, and what a sighting keeps of it. */
export interface MeasuredPage {
  key: string;
  /** Where it ended up, or the listing it is a page of (#226): the page its records cite. */
  finalUrl: string;
  /** Its quotable text and links, which a sighting carries in the run (#124, #251). */
  page: SightedPage;
}

export interface SetupScore {
  label: string;
  /** How many combinations of saved repeats the set-up was measured on; each figure below is the mean over them. */
  draws: number;
  /** Stored active records whose primary page is one of the saved pages. */
  storedOnPages: number;
  /** Of those, read verified. */
  verified: number;
  /** Of those, kept active on their stored citation by a reading held only on a quote (#124, #220). */
  kept: number;
  /** Of those, made unverified by a reading of their own page that cited nothing usable (#220's failure). */
  madeUnverified: number;
  /** Of those, sighted by no reading, so each takes a strike. */
  unsighted: number;
  /** Of those, given another title by a reading (the first verified one of a page stands, so a later read cannot). */
  retitled: number;
  /** Records the readings started, still standing after the duplicate fold. */
  newRecords: number;
  /** New records the duplicate fold caught as another record's. */
  folded: number;
  /** New records that are likely another record under a new identity (see `isChurn`). */
  churn: number;
  costUsd: number;
  /** Model time of the draw's calls, every page's reads one after the other. */
  serialMinutes: number;
  /** The same with a page's two reads side by side. */
  parallelMinutes: number;
}

type Read = { model: string; repeat: number };

/** The repeats of a model saved with their sightings. */
function readableRepeats(model: string, trials: Trial[]): number[] {
  return [...new Set(trials.filter((t) => t.model === model && t.sightings !== undefined).map((t) => t.repeat))].sort((a, b) => a - b);
}

/** One model's repeats one at a time; two reads of one model, every pair of its repeats; two models, their repeats side by side. */
function draws({ models }: ReadSetup, trials: Trial[]): Read[][] {
  const [a, b] = models;
  const ra = readableRepeats(a, trials);
  if (b === undefined) return ra.map((repeat) => [{ model: a, repeat }]);
  if (b === a) return ra.flatMap((r, i) => ra.slice(i + 1).map((s) => [{ model: a, repeat: r }, { model: a, repeat: s }]));
  const rb = readableRepeats(b, trials);
  return ra.slice(0, rb.length).map((r, i) => [{ model: a, repeat: r }, { model: b, repeat: rb[i]! }]);
}

const samePageKey = (a: { primaryUrl: string }, b: { primaryUrl: string }) => pageKey(a.primaryUrl) === pageKey(b.primaryUrl);
/**
 * A new record is churn when a standing record is likely the same event (`likelyDuplicate`, #228): on
 * its page or at its venue, on the same day (or both recurring) under a title one of the two contains
 * ("Endrid" and "Endrid, Poets Mortis, …"), or under the same title with one's span taking in the
 * other's first day. Two shows of one night under different names are not, nor two nights of one
 * show. The other record is a stored one or a new one started before it, so of two new records of
 * one event only the second counts.
 */
function isChurn(record: Event, standing: Event[], storedIds: Set<string>, aliases: VenueAliases): boolean {
  const earlier = standing.slice(0, standing.indexOf(record));
  return standing.some((other) => other.id !== record.id && (storedIds.has(other.id) || earlier.includes(other)) && likelyDuplicate(other, record, aliases));
}

/** A saved sighting as the run made it, with its page again (the inverse of `trialSighting`). */
function savedSighting({ quoteProblem, ...rest }: TrialSighting, page: SightedPage): Sighting {
  return { ...rest, ...(quoteProblem !== undefined ? { quoteProblem: { phrase: quoteProblem, pageText: page.quotable } } : {}), page };
}

/** What the run's merge and duplicate fold make of the stored dataset from one draw's readings of every saved page. */
function measureDraw(reads: Read[], trials: Trial[], dataset: Event[], storedOn: Event[], pages: MeasuredPage[], context: ExtractionContext) {
  const trialOf = new Map(trials.map((t) => [`${t.model} ${t.repeat} ${t.page}`, t]));
  const sightings: Sighting[] = [];
  let costUsd = 0;
  let serialMs = 0;
  let parallelMs = 0;
  for (const page of pages) {
    // A page's reads in set-up order, so the first read's verified sighting stands and the second's confirms it, as in the run.
    const trialsOfPage = reads.map((r) => trialOf.get(`${r.model} ${r.repeat} ${page.key}`)).filter((t): t is Trial => t !== undefined);
    for (const t of trialsOfPage) {
      costUsd += t.costUsd;
      for (const s of t.sightings ?? []) sightings.push(savedSighting(s, page.page));
    }
    serialMs += trialsOfPage.reduce((sum, t) => sum + t.ms, 0);
    parallelMs += Math.max(0, ...trialsOfPage.map((t) => t.ms));
  }
  const merged = mergeSightings(dataset, sightings, context);
  const folded = foldDuplicates(merged.events, context.config.venueAliases);
  const after = new Map(folded.events.map((e) => [e.id, e]));
  const storedIds = new Set(dataset.map((e) => e.id));
  // As in the run: a reading that sighted a duplicate sighted the record it was folded into.
  const touched = new Set(merged.touched);
  for (const [duplicate, kept] of folded.foldedInto) if (touched.has(duplicate)) touched.add(kept);
  // As in the run's report: made unverified and still so, and kept and still active, once every reading is in.
  const status = (e: Event) => after.get(e.id)?.status;
  const count = { verified: 0, kept: 0, madeUnverified: 0, unsighted: 0 };
  for (const e of storedOn) {
    if (merged.kept.has(e.id) && status(e) === "active") count.kept++;
    else if (merged.uncitable.has(e.id) && status(e) === "unverified") count.madeUnverified++;
    else if (!touched.has(e.id)) count.unsighted++;
    else if (status(e) === "active") count.verified++;
  }
  const standing = folded.events.filter((e) => e.status !== "expired");
  const created = standing.filter((e) => !storedIds.has(e.id) && e.status === "active");
  return {
    ...count,
    retitled: storedOn.filter((e) => !sameName(e.title, after.get(e.id)?.title)).length,
    newRecords: created.length,
    folded: [...folded.foldedInto.keys()].filter((id) => !storedIds.has(id)).length,
    churn: created.filter((e) => isChurn(e, standing, storedIds, context.config.venueAliases)).length,
    costUsd,
    serialMinutes: serialMs / 60_000,
    parallelMinutes: parallelMs / 60_000,
  };
}

/**
 * Each set-up's readings of the saved pages sent through the run's own merge (`mergeSightings`) and
 * duplicate fold against the stored dataset, as Monday's run would, averaged over its draws of the
 * saved repeats. Only trials saved with their sightings count; a failed call reads nothing on its page.
 */
export function measureSetups(setups: ReadSetup[], trials: Trial[], dataset: Event[], pages: MeasuredPage[], context: ExtractionContext): SetupScore[] {
  const storedOn = dataset.filter((e) => e.status === "active" && pages.some((p) => samePageKey(e, { primaryUrl: p.finalUrl })));
  const storedOnPages = storedOn.length;
  return setups.map((setup) => {
    const measured = draws(setup, trials).map((reads) => measureDraw(reads, trials, dataset, storedOn, pages, context));
    const avg = (field: Exclude<keyof SetupScore, "label" | "draws" | "storedOnPages">) => mean(measured.map((m) => m[field]));
    return {
      label: setup.label,
      draws: measured.length,
      storedOnPages,
      verified: avg("verified"),
      kept: avg("kept"),
      madeUnverified: avg("madeUnverified"),
      unsighted: avg("unsighted"),
      retitled: avg("retitled"),
      newRecords: avg("newRecords"),
      folded: avg("folded"),
      churn: avg("churn"),
      costUsd: avg("costUsd"),
      serialMinutes: avg("serialMinutes"),
      parallelMinutes: avg("parallelMinutes"),
    };
  });
}

/** The set-ups side by side, as a section of the comparison. */
export function renderSetups(scores: SetupScore[]): string {
  const n = (x: number) => (Number.isNaN(x) ? "–" : x.toFixed(1));
  const lines = [
    "## Two reads",
    "",
    "Each set-up's readings of every saved page, sent through the run's own merge and duplicate fold against the stored dataset, as Monday's run would make them (#223). " +
      "Figures are the mean over the set-up's draws: each saved repeat for one read, each pair of repeats for two reads of one model, the repeats side by side for two models. " +
      "The stored records are mostly one model's past readings, so a model that titles or dates them another way finds fewer of them and starts more new records.",
    "",
    "| Set-up | Draws | Stored on pages | Verified | Kept on stored citation | Made unverified | Unsighted (a strike) | Retitled | New records | Churn | Folded | $ a run | Minutes, one after the other | Minutes, side by side |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const s of scores) {
    lines.push(
      `| ${cell(s.label)} | ${s.draws} | ${s.storedOnPages} | ${pct(ratio(s.verified, s.storedOnPages))} | ${n(s.kept)} | ${n(s.madeUnverified)} | ${n(s.unsighted)} | ${n(s.retitled)} | ${n(s.newRecords)} | ${n(s.churn)} | ${n(s.folded)} | ${usd(s.costUsd, 3)} | ${n(s.serialMinutes)} | ${n(s.parallelMinutes)} |`,
    );
  }
  lines.push(
    "",
    "- **Verified**: the share of the stored records read verified. **Kept on stored citation**: held only on a quote, kept on the stored one (#124, #220). **Made unverified**: hidden by an own-page reading that cited nothing usable. **Unsighted**: no reading found it, so it takes a strike. **Retitled**: given another title by a reading.",
    "- **New records**: what the readings started, after the fold. **Churn**: of those, the ones beside an earlier record of the same page or venue that the run report would list as a likely duplicate (#228): on the same day under a title one of the two contains as whole words, or under the same title with one's span taking in the other's first day; likely an event under a second identity. Before #228 it also counted the same title on another day, and on the page alone, so an earlier report's Churn is not this one's. **Folded**: new records the fold caught.",
    "- **Retitled** includes the title rules' own clean-ups of stored titles (a venue or presenter dropped, #217), which every set-up makes alike.",
    "- **Minutes**: model time for the extraction calls alone; the run reads pages one after the other.",
    "",
  );
  return lines.join("\n");
}

/**
 * The curation prompt comparison (ADR 0014): the eligible events judged several times under the current prompt,
 * and under a candidate when one is given, scored for repeatability (how often the same event gets another
 * verdict), for the pick rate against the calibration figure, for agreement with the stored judgments, and for
 * what moves between the two prompts. The CLI is `curation-compare-cli.ts`; this file is the pure part.
 */
import { createHash } from "node:crypto";
import { curationEligible } from "./curation.js";
import type { Event, PickReason } from "./dataset.js";
import { tableCell } from "./markdown.js";

export type Verdict = "pick" | "close" | "no";
export type PromptSide = "current" | "candidate";

/** One judgment of one event under one prompt in one repeat. */
export interface CurationTrial {
  prompt: PromptSide;
  repeat: number;
  id: string;
  verdict: Verdict;
  reason: PickReason | "none";
  why: string;
  costUsd: number;
  /** The hash (promptHash) of the prompt text the trial was made under; absent on a trial saved before it was kept. */
  promptHash?: string;
}

/**
 * The saved trials made under the prompts as they now stand: a trial of a side whose hash is not the side's current
 * one, or that carries none, is left out, so an edited prompt is never measured on the old prompt's trials.
 */
export function trialsUnder(trials: CurationTrial[], hashes: { current: string; candidate?: string }): CurationTrial[] {
  return trials.filter((t) => t.promptHash !== undefined && t.promptHash === hashes[t.prompt]);
}

/** The spec's calibration figure: picks across an eight-week horizon of about 450 eligible events. */
export const CALIBRATION = { low: 50, high: 80 } as const;

/** Every eligible event, or `n` of them drawn by a seed so the same ids come up for the same seed. */
export function sampleEligible(events: Event[], n: number | undefined, seed: string): Event[] {
  const eligible = events.filter(curationEligible);
  if (n === undefined) return eligible;
  const rank = (e: Event) => createHash("sha256").update(`${seed}\n${e.id}`).digest("hex");
  return [...eligible].sort((a, b) => rank(a).localeCompare(rank(b))).slice(0, n);
}

/** What an event's judgments amount to across repeats: the verdict most of them gave, and the reason most of its picks gave. */
interface Majority {
  verdict: Verdict;
  reason: PickReason | "none";
  why: string;
  flipped: boolean;
}

const VERDICT_ORDER: Verdict[] = ["pick", "close", "no"];

function mostCommon<T extends string>(values: T[], order: readonly T[] = []): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0]![0];
}

function majorityOf(trials: CurationTrial[]): Majority {
  const verdict = mostCommon(
    trials.map((t) => t.verdict),
    VERDICT_ORDER,
  );
  const agreeing = trials.filter((t) => t.verdict === verdict);
  const reason = verdict === "pick" ? mostCommon(agreeing.map((t) => t.reason)) : "none";
  const why = agreeing.find((t) => verdict !== "pick" || t.reason === reason)?.why ?? "";
  return { verdict, reason, why, flipped: trials.some((t) => t.verdict !== verdict) };
}

/** Trials grouped by event id, for one prompt side. */
function byEvent(trials: CurationTrial[], prompt: PromptSide): Map<string, CurationTrial[]> {
  const out = new Map<string, CurationTrial[]>();
  for (const t of trials) {
    if (t.prompt !== prompt) continue;
    out.set(t.id, [...(out.get(t.id) ?? []), t]);
  }
  return out;
}

/** The label an answer is counted under: a pick's reason, or the verdict. */
const answerLabel = (m: Majority) => (m.verdict === "pick" ? m.reason : m.verdict);

export interface RepeatScore {
  prompt: PromptSide;
  /** Distinct events judged under this prompt. */
  events: number;
  /** Repeats made (the highest repeat index plus one). */
  repeats: number;
  /** Events whose verdict differed between repeats. */
  flipped: number;
  flipRate: number;
  /** Events and flips by the majority answer: a pick's reason, or close, or no; by name. */
  byMajorityAnswer: { answer: string; events: number; flipped: number }[];
  /** Events whose majority verdict is a pick. */
  picks: number;
  pickRate: number;
  /** The majority verdict against the stored flag: a stored flag is a pick, anything else is not. */
  agreementWithStored: { same: number; storedPickNowNot: number; nowPickStoredNot: number };
  /** The majority picks counted by the event's kind, most first, then by name: the skew the reasons exist to correct. */
  picksByKind: { name: string; count: number }[];
  costUsd: number;
}

/** One score per prompt side that has trials, current first. */
export function scoreRepeats(trials: CurationTrial[], dataset: Event[]): RepeatScore[] {
  const stored = new Map(dataset.map((e) => [e.id, e]));
  const sides: PromptSide[] = ["current", "candidate"];
  return sides
    .filter((side) => trials.some((t) => t.prompt === side))
    .map((prompt) => {
      const grouped = byEvent(trials, prompt);
      const majorities = [...grouped.entries()].map(([id, ts]) => ({ id, majority: majorityOf(ts) }));
      const byAnswer = new Map<string, { events: number; flipped: number }>();
      const byKind = new Map<string, number>();
      const agreement = { same: 0, storedPickNowNot: 0, nowPickStoredNot: 0 };
      for (const { id, majority } of majorities) {
        const label = answerLabel(majority);
        const row = byAnswer.get(label) ?? { events: 0, flipped: 0 };
        row.events++;
        if (majority.flipped) row.flipped++;
        byAnswer.set(label, row);
        const storedPick = stored.get(id)?.dontMiss === true;
        const nowPick = majority.verdict === "pick";
        if (nowPick) {
          const kind = stored.get(id)?.kind ?? "unknown";
          byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
        }
        if (storedPick === nowPick) agreement.same++;
        else if (storedPick) agreement.storedPickNowNot++;
        else agreement.nowPickStoredNot++;
      }
      const own = trials.filter((t) => t.prompt === prompt);
      const events = majorities.length;
      const flipped = majorities.filter((m) => m.majority.flipped).length;
      const picks = majorities.filter((m) => m.majority.verdict === "pick").length;
      return {
        prompt,
        events,
        repeats: Math.max(0, ...own.map((t) => t.repeat + 1)),
        flipped,
        flipRate: events === 0 ? 0 : flipped / events,
        byMajorityAnswer: [...byAnswer].map(([answer, row]) => ({ answer, ...row })).sort((a, b) => a.answer.localeCompare(b.answer)),
        picks,
        pickRate: events === 0 ? 0 : picks / events,
        agreementWithStored: agreement,
        picksByKind: [...byKind].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        costUsd: own.reduce((sum, t) => sum + t.costUsd, 0),
      };
    });
}

export interface PromptMove {
  id: string;
  title: string;
  from: string;
  to: string;
  fromWhy: string;
  toWhy: string;
}

const answerText = (m: Majority) => (m.verdict === "pick" ? `pick (${m.reason})` : m.verdict);

/** The events judged under both prompts whose majority answer differs, in the dataset's order. */
export function promptDiff(trials: CurationTrial[], events: Event[]): PromptMove[] {
  const current = byEvent(trials, "current");
  const candidate = byEvent(trials, "candidate");
  const moves: PromptMove[] = [];
  for (const e of events) {
    const [a, b] = [current.get(e.id), candidate.get(e.id)];
    if (a === undefined || b === undefined) continue;
    const [from, to] = [majorityOf(a), majorityOf(b)];
    if (from.verdict === to.verdict && from.reason === to.reason) continue;
    moves.push({ id: e.id, title: e.title, from: answerText(from), to: answerText(to), fromWhy: from.why, toWhy: to.why });
  }
  return moves;
}

export interface ComparisonMeta {
  date: string;
  model: string;
  currentHash: string;
  candidateHash?: string;
  /** Events judged (the sample, or every eligible event). */
  sample: number;
  minutes: number;
  capHit?: boolean;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** The comparison as Markdown, for docs/curation-comparison/<date>.md. */
export function renderCurationComparison(scores: RepeatScore[], diff: PromptMove[], meta: ComparisonMeta): string {
  const lines: string[] = [];
  lines.push(`# Curation prompt comparison ${meta.date}`, "");
  lines.push(
    `${meta.sample} eligible event(s) judged under the current prompt (\`${meta.currentHash}\`)${meta.candidateHash ? ` and a candidate (\`${meta.candidateHash}\`)` : ""} by \`${meta.model}\`, in batches formed as the run forms them, ${meta.minutes < 0.05 ? "rendered from saved trials" : `over ${meta.minutes.toFixed(1)} minute(s) of calls this invocation`}${meta.capHit ? " (**cap hit**: later trials were not made)" : ""}. Made by \`pnpm compare-curation\` (ADR 0014).`,
    "",
  );
  lines.push("## Repeatability and rate", "");
  lines.push("| Prompt | Events | Repeats | Flipped | Flip rate | Picks | Pick rate | Agree with stored | Stored pick, now not | Now pick, stored not | USD |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const s of scores) {
    lines.push(
      `| ${s.prompt} | ${s.events} | ${s.repeats} | ${s.flipped} | ${pct(s.flipRate)} | ${s.picks} | ${pct(s.pickRate)} | ${s.agreementWithStored.same} | ${s.agreementWithStored.storedPickNowNot} | ${s.agreementWithStored.nowPickStoredNot} | ${s.costUsd.toFixed(3)} |`,
    );
  }
  lines.push("");
  for (const s of scores) {
    const sampled = s.events;
    const projected = sampled === 0 ? 0 : Math.round(s.picks);
    lines.push(
      `- **${s.prompt}**: ${projected} ${projected === 1 ? "pick" : "picks"} by majority over ${sampled} event(s); the spec's calibration figure is ${CALIBRATION.low} to ${CALIBRATION.high} over an eight-week horizon of about 450 eligible events${sampled > 0 && sampled < 400 ? `, so scale by the sample (${pct(s.pickRate)} of the horizon's events)` : ""}.`,
    );
  }
  lines.push("");
  for (const s of scores) {
    lines.push(`Picks by kind (${s.prompt}): ${s.picksByKind.length === 0 ? "none" : s.picksByKind.map((k) => `${k.name} ${k.count}`).join(", ")}.`, "");
  }
  lines.push("## Flips by majority answer", "");
  lines.push("| Prompt | Answer | Events | Flipped |");
  lines.push("| --- | --- | ---: | ---: |");
  for (const s of scores) for (const row of s.byMajorityAnswer) lines.push(`| ${s.prompt} | ${row.answer} | ${row.events} | ${row.flipped} |`);
  lines.push("", "A flip is an event whose verdict (pick, close, no) differed between repeats of the same prompt; a change of reason alone is not one.", "");
  if (scores.some((s) => s.prompt === "candidate")) {
    lines.push("## What moves from the current prompt to the candidate", "");
    if (diff.length === 0) lines.push("_Nothing: every event judged under both has the same majority answer._", "");
    else {
      lines.push("| Event | Current | Candidate | Current why | Candidate why |");
      lines.push("| --- | --- | --- | --- | --- |");
      for (const m of diff) lines.push(`| ${tableCell(m.title)} | ${m.from} | ${m.to} | ${tableCell(m.fromWhy)} | ${tableCell(m.toWhy)} |`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

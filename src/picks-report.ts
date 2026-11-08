/**
 * The report's view of the picks (ADR 0014): every pick and close call in the horizon, with its reason or note, what
 * moved this run and why, and the picks counted by kind and by reason. This is where a person reads the week's
 * judgments and decides which to overrule in data/picks.yaml.
 */
import type { Event, PickReason } from "./dataset.js";
import { isPast } from "./expiry.js";
import { calendarDate } from "./identity.js";
import { horizonEnd } from "./time.js";

export interface PickLine {
  id: string;
  title: string;
  venue: string;
  kind: string;
  start?: string;
  end?: string;
  primaryUrl: string;
  reason: PickReason;
  whyLine: string;
  /** `new` when the previous dataset did not hold it as a pick; `hand` when an entry in data/picks.yaml governs it. */
  marks: ("new" | "hand")[];
}

export type CloseLine = Omit<PickLine, "reason" | "whyLine" | "marks"> & { closeNote: string };

export type Standing = "pick" | "close" | "no";

export const MOVE_CAUSES = [
  "new event",
  "re-judged after a change",
  "re-judged under a new prompt",
  "hand pick",
  "hand un-pick",
  "hand entry removed",
  "expired",
  "left unjudged",
  "made recurring",
] as const;
export type MoveCause = (typeof MOVE_CAUSES)[number];

export interface PickMove {
  id: string;
  title: string;
  primaryUrl: string;
  from: Standing;
  to: Standing;
  cause: MoveCause;
}

/** The date an event is listed under: its start, or its end when it has no start. */
function anchor(e: Event): string | undefined {
  return calendarDate(e.start ?? e.end);
}

/** Whether an active event is still to come and starts (or, open-ended, runs) no later than the horizon's last day. */
function inHorizon(e: Event, today: string, horizonWeeks: number): boolean {
  const date = anchor(e);
  return e.status === "active" && date !== undefined && !isPast(e, today) && date <= horizonEnd(today, horizonWeeks);
}

const soonestFirst = (a: Event, b: Event) => anchor(a)!.localeCompare(anchor(b)!) || a.title.localeCompare(b.title);

function lineOf(e: Event): Omit<CloseLine, "closeNote"> {
  return {
    id: e.id,
    title: e.title,
    venue: e.venue ?? "",
    kind: e.kind,
    ...(e.start !== undefined ? { start: e.start } : {}),
    ...(e.end !== undefined ? { end: e.end } : {}),
    primaryUrl: e.primaryUrl,
  };
}

/** The active picks in the horizon, soonest first, marked new against the previous dataset and hand when an entry governs them. */
export function picksInHorizon(events: Event[], today: string, horizonWeeks: number, previous: Event[]): PickLine[] {
  const wasPick = new Set(previous.filter((e) => e.dontMiss).map((e) => e.id));
  return events
    .filter((e) => e.dontMiss && inHorizon(e, today, horizonWeeks))
    .sort(soonestFirst)
    .map((e) => ({
      ...lineOf(e),
      reason: e.pickReason!,
      whyLine: e.whyLine!,
      marks: [...(wasPick.has(e.id) ? [] : ["new" as const]), ...(e.pickedBy !== undefined ? ["hand" as const] : [])],
    }));
}

/** The active close calls in the horizon, soonest first, with their notes. */
export function closeCallsInHorizon(events: Event[], today: string, horizonWeeks: number): CloseLine[] {
  return events
    .filter((e) => e.closeCall !== undefined && inHorizon(e, today, horizonWeeks))
    .sort(soonestFirst)
    .map((e) => ({ ...lineOf(e), closeNote: e.closeNote! }));
}

/**
 * Where an event stands: a pick, a close call, or neither. An expired event stands as neither; an unverified one keeps
 * its stored standing, since its fields come back to the site with its next verified reading and nothing was judged.
 */
export function standing(e: Event | undefined): Standing {
  if (e === undefined || e.status === "expired") return "no";
  return e.dontMiss ? "pick" : e.closeCall !== undefined ? "close" : "no";
}

/** Why an event's standing changed this run, by the first test that holds. */
function causeOf(was: Event | undefined, now: Event, nowIso: string): MoveCause {
  if (was === undefined) return "new event";
  if (now.pickedBy !== undefined && was.pickedBy === undefined) return now.dontMiss ? "hand pick" : "hand un-pick";
  if (was.pickedBy !== undefined && now.pickedBy === undefined) return "hand entry removed";
  if (now.status === "expired") return "expired";
  if (now.recurrence === "recurring" && was.recurrence !== "recurring") return "made recurring";
  if (now.lastJudged === nowIso && now.lastChanged === nowIso) return "re-judged after a change";
  if (now.lastJudged === nowIso) return "re-judged under a new prompt";
  return "left unjudged";
}

/** Every event whose standing differs from the previous dataset's, with the cause, in the events' order. */
export function pickMoves(previous: Event[], events: Event[], nowIso: string): PickMove[] {
  const before = new Map(previous.map((e) => [e.id, e]));
  const moves: PickMove[] = [];
  for (const now of events) {
    const was = before.get(now.id);
    const [from, to] = [standing(was), standing(now)];
    if (from === to) continue;
    moves.push({ id: now.id, title: now.title, primaryUrl: now.primaryUrl, from, to, cause: causeOf(was, now, nowIso) });
  }
  return moves;
}

/** The picks counted by kind or by reason, most first, then by name. */
export function countBy(lines: PickLine[], key: "kind" | "reason"): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line[key], (counts.get(line[key]) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

import { formatDay, formatTime, isDateOnly, localDate } from "./dates";
import type { GoneEvent, PublishedEvent } from "./types";

/** A start as the page gives it: "Wed Oct 14 · 5:30 pm", or "Wed Oct 14" for a date with no time. */
export function startLine(start: string): string {
  return `${formatDay(localDate(start))}${isDateOnly(start) ? "" : ` · ${formatTime(start)}`}`;
}

/** A moved event's line under its row: "Was Wed Oct 14 · 5:30 pm". */
export function wasLine(from: string): string {
  return `Was ${startLine(from)}`;
}

/**
 * Why an event went, as the page says it: the job's two strikes are the page it was read from (a venue's or an
 * organizer's) no longer listing it, or saying it is not found.
 */
export function goneReason(reason: GoneEvent["reason"]): string {
  return reason === "cancelled" ? "Cancelled" : "No longer on the page it was listed on";
}

/**
 * What a section says in place of its list: "None." when it is empty, and for the run's own groups (new picks, moved,
 * gone), when the run's report records no comparison, that it was not recorded. Nothing when it has a list.
 */
export function emptyLine(list: readonly unknown[] | undefined): string | undefined {
  if (list === undefined) return "Not recorded for this run.";
  return list.length === 0 ? "None." : undefined;
}

/** Events by kind, in the config's order of kinds, each group in the order given; a kind with none is left out. */
export function byKind(events: PublishedEvent[], kinds: string[]): { kind: string; events: PublishedEvent[] }[] {
  return kinds.map((kind) => ({ kind, events: events.filter((e) => e.kind === kind) })).filter((g) => g.events.length > 0);
}

import { formatDay, formatTime, isDateOnly, localDate } from "./dates";
import type { GoneEvent, PublishedEvent } from "./types";

/** A moved event's line under its row: "Was Wed Oct 14 · 5:30 pm", or "Was Wed Oct 14" for a date with no time. */
export function wasLine(from: string): string {
  return `Was ${formatDay(localDate(from))}${isDateOnly(from) ? "" : ` · ${formatTime(from)}`}`;
}

/** Why an event went, as the page says it: the job's two strikes are the venue's page no longer listing it. */
export function goneReason(reason: GoneEvent["reason"]): string {
  return reason === "cancelled" ? "Cancelled" : "No longer listed by the venue";
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

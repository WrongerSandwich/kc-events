/**
 * Recurrence class, derived from what the page says by rules rather than by the model's opinion:
 * a sports season is recurring; a schedule with no fixed end is recurring; an end date more than a
 * few days after the start is a limited run; anything else is a one-off.
 */
import type { RecurrenceClass } from "./dataset.js";

/** A span longer than this (a festival weekend, a band's two nights) is a limited run rather than a one-off. */
const ONE_OFF_MAX_SPAN_DAYS = 3;
const DAY_MS = 86_400_000;

export interface RecurrenceEvidence {
  /** ISO date or date-time. */
  start?: string;
  /** ISO date or date-time. */
  end?: string;
  /** How the page says the thing repeats, e.g. "Every Tuesday, 7pm". */
  schedule?: string;
  /** The page lists a team's season as a whole rather than one game. */
  sportsSeason: boolean;
}

export function deriveRecurrence({ start, end, schedule, sportsSeason }: RecurrenceEvidence): RecurrenceClass {
  if (sportsSeason) return "recurring";
  if (schedule !== undefined && end === undefined) return "recurring";
  if (start !== undefined && end !== undefined && spanDays(start, end) > ONE_OFF_MAX_SPAN_DAYS) return "limited-run";
  return "one-off";
}

/** Whole calendar days between two ISO dates or date-times, by their local dates. */
function spanDays(start: string, end: string): number {
  return (Date.parse(end.slice(0, 10)) - Date.parse(start.slice(0, 10))) / DAY_MS;
}

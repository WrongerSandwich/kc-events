import { localDate } from "./dates";
import type { PublishedEvent } from "./types";

export function isDated(e: PublishedEvent): boolean {
  return e.recurrence !== "recurring";
}

/** Dated, and with a first day to state: not recurring, and not a run read after it began. */
export function hasStartDay(e: PublishedEvent): boolean {
  return isDated(e) && firstDay(e) !== undefined;
}

/** The first local day, undefined for a recurring event or a limited run read after it began. */
export function firstDay(e: PublishedEvent): string | undefined {
  return e.start === undefined ? undefined : localDate(e.start);
}

/** The last local day: the end, else the start; undefined for a recurring event. */
export function lastDay(e: PublishedEvent): string | undefined {
  const last = e.end ?? e.start;
  return last === undefined ? undefined : localDate(last);
}

/** The job's rule: past when the last day is before today. An undated event cannot be past. */
export function isPast(e: PublishedEvent, today: string): boolean {
  const last = lastDay(e);
  return last !== undefined && last < today;
}

/** Ends on a later day than it starts; a start-less run counts. */
export function isMultiDay(e: PublishedEvent): boolean {
  const first = firstDay(e);
  const last = lastDay(e);
  if (last === undefined) return false;
  return first === undefined || last > first;
}

/** On now: a multi-day span that includes today. Single-day events are never underway; they are listed under their day. */
export function isUnderway(e: PublishedEvent, today: string): boolean {
  if (!isMultiDay(e)) return false;
  const first = firstDay(e);
  return (first === undefined || first <= today) && lastDay(e)! >= today;
}

/** "therecordbar.com" for a link label; the input when it is not a URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Where a reader goes for details and tickets: the event's own page when the job found one, else the page it was read from. */
export function linkOut(e: PublishedEvent): string {
  return e.eventUrl ?? e.primaryUrl;
}

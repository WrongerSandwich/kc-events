import { isDateOnly, localDate, weekday } from "./dates";
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

/**
 * The last local day: the end, else the start; undefined for a recurring event. A night that runs past midnight (a
 * timed end less than a day after a timed start) is one evening, so its last day is its first (#90).
 */
export function lastDay(e: PublishedEvent): string | undefined {
  if (isOvernight(e)) return firstDay(e);
  const last = e.end ?? e.start;
  return last === undefined ? undefined : localDate(last);
}

const DAY_MS = 24 * 3_600_000;

function isOvernight(e: PublishedEvent): boolean {
  if (e.start === undefined || e.end === undefined || isDateOnly(e.start) || isDateOnly(e.end)) return false;
  return Date.parse(e.end) - Date.parse(e.start) < DAY_MS;
}

/** The job's rule: past when the last day is before today. An undated event cannot be past. */
export function isPast(e: PublishedEvent, today: string): boolean {
  const last = lastDay(e);
  return last !== undefined && last < today;
}

/** Ends on a later day than it starts (lastDay, so a night past midnight does not); a start-less run counts. */
export function isMultiDay(e: PublishedEvent): boolean {
  const first = firstDay(e);
  const last = lastDay(e);
  if (last === undefined) return false;
  return first === undefined || last > first;
}

/**
 * A multi-day span that includes today. Single-day events are never underway; they are listed under their day. Only a
 * limited run is shown as "On now"; a multi-day one-off (three days at most) is listed under each of its days (#90).
 */
export function isUnderway(e: PublishedEvent, today: string): boolean {
  if (!isMultiDay(e)) return false;
  const first = firstDay(e);
  return (first === undefined || first <= today) && lastDay(e)! >= today;
}

/** A limited run open today: what "On now" lists and the cards call "On now". A run with days is open only on them (#143). */
export function isOnNow(e: PublishedEvent, today: string): boolean {
  return isOpen(e, today) && playsOn(e, today);
}

/** A limited run whose span includes today, whether or not it plays today (#143): on now, or between its days. */
export function isOpen(e: PublishedEvent, today: string): boolean {
  return e.recurrence === "limited-run" && isUnderway(e, today);
}

/** Whether a date falls on one of a run's weekdays (#143); a run without days plays every day. */
export function playsOn(e: PublishedEvent, date: string): boolean {
  return !e.days || e.days.includes(weekday(date));
}

/** "therecordbar.com" for a link label; the input when it is not a URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Where "Details and tickets" goes: the event's own page when the job found one, else the page it was read from. */
export function detailsUrl(e: PublishedEvent): string {
  return e.eventUrl ?? e.primaryUrl;
}

/** What it costs and who may go, as the event's own page stated them ("Free · All ages"); undefined when it stated neither. */
export function admissionLine(e: PublishedEvent): string | undefined {
  const line = [e.price, e.ages].filter((s) => s !== undefined).join(" · ");
  return line === "" ? undefined : line;
}

/** Where an event is, as cards and lists say it: the venue, then the room when the page named one. */
export function venueLine(e: PublishedEvent): string {
  return e.room === undefined ? e.venue : `${e.venue} · ${e.room}`;
}

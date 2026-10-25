import { formatDay, isDateOnly, localDate, weekday } from "./dates";
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

/**
 * The event's days in words, for Save's accessible name, so the same title on several dates reads as several saves
 * (#181): "Fri Oct 9", "Sun Sep 20 to Sun Oct 11", "through Sun Oct 11"; undefined for a recurring event.
 */
export function daysSaid(e: PublishedEvent): string | undefined {
  const first = firstDay(e);
  const last = lastDay(e);
  if (last === undefined) return undefined;
  if (first === undefined) return `through ${formatDay(last)}`;
  return last > first ? `${formatDay(first)} to ${formatDay(last)}` : formatDay(first);
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

/** A limited run open today: what the explorer's "On now" lists; a card says only when it closes. A run with days is open only on them (#143). */
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

/**
 * What the event page's main link says: "Tickets at host" when the own page gave a price to pay, else "Details at host",
 * so a free art walk, or an event whose price the job never read, does not promise a ticket.
 */
export function detailsLabel(e: PublishedEvent): string {
  const paid = e.price !== undefined && !/\bfree\b/i.test(e.price);
  return `${paid ? "Tickets" : "Details"} at ${hostOf(detailsUrl(e))}`;
}

/** What on the event page a model wrote, as the verified line owns up to it; undefined when the page has neither. */
export function modelNote(whyLine: string | undefined, description: string | undefined): string | undefined {
  if (whyLine && description) return "The reason and description are written by a model.";
  if (whyLine) return "The reason is written by a model.";
  if (description) return "The description is written by a model.";
  return undefined;
}

/** What it costs and who may go, as the event's own page stated them ("Free · All ages"); undefined when it stated neither. */
export function admissionLine(e: PublishedEvent): string | undefined {
  const line = [e.price, e.ages].filter((s) => s !== undefined).join(" · ");
  return line === "" ? undefined : line;
}

/** "Crossroads · Central KC"; a neighborhood that is its own region (Lawrence, Elsewhere in the metro) is named once. */
export function neighborhoodLine(neighborhood: string, region: string): string {
  return region === neighborhood ? neighborhood : `${neighborhood} · ${region}`;
}

/** The catch-all region and neighborhood: src/config.ts's ELSEWHERE_IN_THE_METRO, which the browser cannot import. */
const CATCH_ALL = "Elsewhere in the metro";

/**
 * The neighborhood beside a venue on a row or card, left out when it says nothing the venue does not (#186): when it is
 * the venue's own name ("Crown Center · Crown Center") or the catch-all, which is no place.
 */
export function neighborhoodShown(e: PublishedEvent): string | undefined {
  const n = e.neighborhood;
  return n === CATCH_ALL || samePlace(n, e.venue) ? undefined : n;
}

/** A neighborhood and a venue of one name, whatever the casing ("Crown Center" in Crown Center). */
export function samePlace(neighborhood: string, venue: string): boolean {
  return neighborhood.toLowerCase() === venue.toLowerCase();
}

/** What a check confirmed: a recurring event has a schedule rather than a date (#186). */
export function verifiedLabel(e: PublishedEvent): string {
  return e.recurrence === "recurring" ? "Schedule and venue verified" : "Date and venue verified";
}

/** Where an event is, as cards and lists say it: the venue, then the room when the page named one. */
export function venueLine(e: PublishedEvent): string {
  return e.room === undefined ? e.venue : `${e.venue} · ${e.room}`;
}

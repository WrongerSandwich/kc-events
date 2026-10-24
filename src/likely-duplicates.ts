/**
 * Likely duplicates (#228): two records no identity rule joins that a person should look at, as a
 * check after the duplicate fold. Nothing here merges, expires or changes a record, and no model is
 * asked: the pairs go to the run report for a person (or the weekly audit) to judge.
 */

import { comparable } from "./extraction.js";
import { samePage } from "./hosts.js";
import { calendarDate, sameVenue, type EventIdentity, type VenueAliases } from "./identity.js";

/**
 * Two records are likely one event when they share a primary page or a venue (aliases applied) and
 * either start on the same calendar day (or are both recurring) under titles one of which contains
 * the other, the titles not equal ("Artist Market @ Rooms We Carry Opening Reception" and "Rooms We
 * Carry Opening Reception"), or have equal titles and one's span, start through end, covers the
 * other's first day (a run on the venue's events page and a month of it on the homepage; a one-off
 * night inside a run of the same name). Titles are compared as quotes are (`comparable`); an empty
 * one never counts. Two shows of one night under different names are not a pair, nor two nights of
 * one play stored one by one.
 */
export function likelyDuplicate(a: EventIdentity, b: EventIdentity, aliases: VenueAliases): boolean {
  const [x, y] = [comparable(a.title), comparable(b.title)];
  if (x === "" || y === "") return false;
  const shared = samePage(a.primaryUrl, b.primaryUrl) || (a.venue !== undefined && b.venue !== undefined && sameVenue(a.venue, b.venue, aliases));
  if (!shared) return false;
  if (x === y) return covers(a, b) || covers(b, a);
  return sameDay(a, b) && (x.includes(y) || y.includes(x));
}

/** Every likely pair among the records, each once, in the order the records come. */
export function likelyDuplicatePairs<T extends EventIdentity>(events: readonly T[], aliases: VenueAliases): [T, T][] {
  return events.flatMap((a, i) => events.slice(i + 1).filter((b) => likelyDuplicate(a, b, aliases)).map((b): [T, T] => [a, b]));
}

/** Both recurring, or both dated and starting on one calendar day. */
function sameDay(a: EventIdentity, b: EventIdentity): boolean {
  if (a.recurrence === "recurring" || b.recurrence === "recurring") return a.recurrence === b.recurrence;
  const day = calendarDate(a.start);
  return day !== undefined && day === calendarDate(b.start);
}

/** Whether one record's first day through its last takes in the other's first day. */
function covers(span: EventIdentity, other: EventIdentity): boolean {
  const [first, last, day] = [calendarDate(span.start), calendarDate(span.end ?? span.start), calendarDate(other.start)];
  return first !== undefined && last !== undefined && day !== undefined && first <= day && day <= last;
}

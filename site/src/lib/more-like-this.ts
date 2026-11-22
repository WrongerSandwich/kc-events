import { daysBetween } from "./dates";
import { firstDay, hasStartDay } from "./events";
import type { PublishedEvent } from "./types";
import { venueSlug } from "./venues";

/** How many an event page lists: a short list reads as chosen, where a long one reads as an aggregator's filler. */
const SHOWN = 3;

/**
 * The event page's "More like this" (#301): at most three events still to come, never the event itself, so each page
 * shows its own three. First what else is at the venue, soonest first; then the same kind, nearest the event's first
 * day on either side (today's, for an event with no day); then picks, soonest first. An event is listed once, in the
 * first group it falls in, and ties go by title, then id, so a build lists the same three whatever the list's order.
 * "Still to come" is a first day today or later, as the kind's list counts it: a run already playing has its own row
 * there, and an undated event has no day to be near.
 */
export function moreLikeThis(e: PublishedEvent, events: readonly PublishedEvent[], today: string): PublishedEvent[] {
  const ahead = events.filter((o) => o.id !== e.id && hasStartDay(o) && firstDay(o)! >= today);
  const anchor = firstDay(e) ?? today;
  const byTitle = (a: PublishedEvent, b: PublishedEvent) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  const soonest = (a: PublishedEvent, b: PublishedEvent) => firstDay(a)!.localeCompare(firstDay(b)!) || byTitle(a, b);
  const nearest = (a: PublishedEvent, b: PublishedEvent) => daysBetween(firstDay(a)!, anchor) - daysBetween(firstDay(b)!, anchor) || byTitle(a, b);
  const venue = venueSlug(e.venue);
  const groups = [
    ahead.filter((o) => venueSlug(o.venue) === venue).sort(soonest),
    ahead.filter((o) => o.kind === e.kind).sort(nearest),
    ahead.filter((o) => o.dontMiss).sort(soonest),
  ];
  const listed = new Map<string, PublishedEvent>();
  for (const o of groups.flat()) if (listed.size < SHOWN && !listed.has(o.id)) listed.set(o.id, o);
  return [...listed.values()];
}

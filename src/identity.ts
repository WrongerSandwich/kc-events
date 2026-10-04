/**
 * Event identity (ADR 0007): an event is its primary page plus its normalized title; failing
 * that, the same normalized title (or one cut short) at the same venue on a date within a few days,
 * or, for a sighting that names no venue, on the same date when only one known event qualifies. Ids
 * are opaque and fixed at first-seen; matching never looks at them.
 */

import type { EventStatus } from "./dataset.js";

/** How far apart two dates can be and still be the same event under the fuzzy match. */
const FUZZY_DATE_WINDOW_DAYS = 3;
const DAY_MS = 86_400_000;

/** Case, punctuation, whitespace, and a leading "the" do not make a different title or venue. */
export function normalizeName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the /, "");
}

/** Two names (titles or venues) are the same when they normalize alike; two absent names are the same too. */
export function sameName(a: string | undefined, b: string | undefined): boolean {
  return a === undefined || b === undefined ? a === b : normalizeName(a) === normalizeName(b);
}

/**
 * Venue aliases from the run config: a venue's display name to the other names it goes by (a room
 * inside it, a program that runs there). Hand-kept; compared normalized.
 */
export type VenueAliases = Record<string, string[]>;

export interface EventIdentity {
  primaryUrl: string;
  title: string;
  venue?: string;
  /** ISO date or date-time; its local calendar date is what the fuzzy match compares. */
  start?: string;
  /** An expired known event is no candidate when a venue-less sighting needs exactly one. */
  status?: EventStatus;
}

/**
 * The known event a sighting is, if any: an exact match on primary page and title first,
 * then the fuzzy match on title, venue, and nearby date, then for a sighting with no venue the one
 * known event, not expired, with its title on its date.
 */
export function findMatch<T extends EventIdentity>(sighting: EventIdentity, known: readonly T[], aliases: VenueAliases): T | undefined {
  return (
    known.find((k) => sameEventExactly(sighting, k)) ??
    known.find((k) => sameEventFuzzily(sighting, k, aliases)) ??
    onlyCandidateForVenueless(sighting, known)
  );
}

/**
 * Whether two records in the dataset are the same event under the rules findMatch applies to a
 * sighting, either way round; `live` is every record not expired, for the venue-less rule's count.
 */
export function sameEvent(a: EventIdentity, b: EventIdentity, live: readonly EventIdentity[], aliases: VenueAliases): boolean {
  return (
    sameEventExactly(a, b) ||
    sameEventFuzzily(a, b, aliases) ||
    onlyCandidateForVenueless(a, live) === b ||
    onlyCandidateForVenueless(b, live) === a
  );
}

/**
 * Two venue names are one venue when they normalize alike, when one contains the other at word
 * boundaries ("The Midland" in "The Midland Theatre - MO"), or when the alias list names both under
 * one venue, by the same two rules ("Bartle Exhibit Hall (A – E)" is "Bartle Exhibit Hall").
 */
export function sameVenue(a: string, b: string, aliases: VenueAliases): boolean {
  const [x, y] = [normalizeName(a), normalizeName(b)];
  if (sameOrContained(x, y)) return true;
  return Object.entries(aliases).some(([venue, names]) => {
    const group = [venue, ...names].map(normalizeName);
    return group.some((n) => sameOrContained(x, n)) && group.some((n) => sameOrContained(y, n));
  });
}

function sameOrContained(a: string, b: string): boolean {
  const [shorter, longer] = byLength(a, b);
  return shorter !== "" && ` ${longer} `.includes(` ${shorter} `);
}

function sameEventExactly(a: EventIdentity, b: EventIdentity): boolean {
  return a.primaryUrl === b.primaryUrl && sameName(a.title, b.title);
}

/**
 * The same title, or one that is the other cut short at a word boundary: a page may bill an
 * event in full one week ("A / Orchestra and Choirs") and give only its lead title the next.
 */
function sameOrShortenedTitle(a: string, b: string): boolean {
  const [shorter, longer] = byLength(normalizeName(a), normalizeName(b));
  return shorter !== "" && (longer === shorter || longer.startsWith(`${shorter} `));
}

function byLength(a: string, b: string): [string, string] {
  return a.length <= b.length ? [a, b] : [b, a];
}

/** The local calendar date of an ISO date or date-time, as read. */
function calendarDate(iso: string | undefined): string | undefined {
  return iso?.slice(0, 10);
}

/** Dates are compared first, as the cheapest test: folding compares every pair of records. */
function sameEventFuzzily(a: EventIdentity, b: EventIdentity, aliases: VenueAliases): boolean {
  if (a.venue === undefined || b.venue === undefined || a.start === undefined || b.start === undefined) return false;
  return (
    Math.abs(Date.parse(calendarDate(a.start)!) - Date.parse(calendarDate(b.start)!)) <= FUZZY_DATE_WINDOW_DAYS * DAY_MS &&
    sameOrShortenedTitle(a.title, b.title) &&
    sameVenue(a.venue, b.venue, aliases)
  );
}

/**
 * For a sighting that names no venue, the known event with the same or shortened title on the same
 * calendar date, when it is the only one not expired; with two or more, nothing can say which. A
 * recurring event has no date, so it never qualifies; the sighting itself, when it is a record among
 * the known, is no candidate either.
 */
function onlyCandidateForVenueless<T extends EventIdentity>(sighting: EventIdentity, known: readonly T[]): T | undefined {
  const date = calendarDate(sighting.start);
  if (sighting.venue !== undefined || date === undefined) return undefined;
  const candidates = known.filter((k) => k !== sighting && k.status !== "expired" && calendarDate(k.start) === date && sameOrShortenedTitle(sighting.title, k.title));
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * Event identity (ADR 0007): an event is its primary page plus its normalized title; failing
 * that, the same normalized title at the same venue on a date within a few days. Ids are opaque
 * and fixed at first-seen; matching never looks at them.
 */

/** How far apart two dates can be and still be the same event under the fuzzy match. */
const FUZZY_DATE_WINDOW_DAYS = 3;
const DAY_MS = 86_400_000;

/** Case, punctuation, and whitespace do not make a different title or venue. */
export function normalizeName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface EventIdentity {
  primaryUrl: string;
  title: string;
  venue?: string;
  /** ISO date or date-time; its local calendar date is what the fuzzy match compares. */
  start?: string;
}

/**
 * The known event a sighting is, if any: an exact match on primary page and title first,
 * then the fuzzy match on title, venue, and nearby date.
 */
export function findMatch<T extends EventIdentity>(sighting: EventIdentity, known: readonly T[]): T | undefined {
  return known.find((k) => sameEventExactly(sighting, k)) ?? known.find((k) => sameEventFuzzily(sighting, k));
}

function sameEventExactly(a: EventIdentity, b: EventIdentity): boolean {
  return a.primaryUrl === b.primaryUrl && normalizeName(a.title) === normalizeName(b.title);
}

function sameEventFuzzily(a: EventIdentity, b: EventIdentity): boolean {
  if (a.venue === undefined || b.venue === undefined || a.start === undefined || b.start === undefined) return false;
  return (
    normalizeName(a.title) === normalizeName(b.title) &&
    normalizeName(a.venue) === normalizeName(b.venue) &&
    Math.abs(Date.parse(a.start.slice(0, 10)) - Date.parse(b.start.slice(0, 10))) <= FUZZY_DATE_WINDOW_DAYS * DAY_MS
  );
}

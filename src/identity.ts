/**
 * Event identity (ADR 0007): an event is its primary page plus its normalized title; failing
 * that, the same normalized title (or one cut short) at the same venue on a date within a few days. Ids are opaque
 * and fixed at first-seen; matching never looks at them.
 */

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
  return a.primaryUrl === b.primaryUrl && sameName(a.title, b.title);
}

/**
 * The same title, or one that is the other cut short at a word boundary: a page may bill an
 * event in full one week ("A / Orchestra and Choirs") and give only its lead title the next.
 */
function sameOrShortenedTitle(a: string, b: string): boolean {
  const [shorter, longer] = [normalizeName(a), normalizeName(b)].sort((x, y) => x.length - y.length) as [string, string];
  return shorter !== "" && (longer === shorter || longer.startsWith(`${shorter} `));
}

function sameEventFuzzily(a: EventIdentity, b: EventIdentity): boolean {
  if (a.venue === undefined || b.venue === undefined || a.start === undefined || b.start === undefined) return false;
  return (
    sameOrShortenedTitle(a.title, b.title) &&
    sameName(a.venue, b.venue) &&
    Math.abs(Date.parse(a.start.slice(0, 10)) - Date.parse(b.start.slice(0, 10))) <= FUZZY_DATE_WINDOW_DAYS * DAY_MS
  );
}

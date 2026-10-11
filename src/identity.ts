/**
 * Event identity (ADR 0007): an event is its primary page plus its normalized title; failing
 * that, the same normalized title (or one cut short, or on the same date one with a series name in
 * front) at the same venue on a date within a few days, or, for a sighting that names no venue, on
 * the same date the one known event that qualifies, or the one preferred among several; failing all
 * of that, a dated sighting may be one month of a recurring event on the same page. Ids are opaque
 * and fixed at first-seen; matching never compares them, and only follows one as a pointer from a
 * record folded as a duplicate to the record it was folded into.
 */

import type { EventStatus, RecurrenceClass } from "./dataset.js";
import { hostOf, samePage } from "./hosts.js";

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
  /** An expired known event is no candidate for a venue-less sighting. */
  status?: EventStatus;
  /** The event's own page, when its primary page links one: a tie-breaker for a venue-less sighting. */
  eventUrl?: string;
  /** A recurring event has no date; a dated sighting may be one month of it. */
  recurrence?: RecurrenceClass;
  id?: string;
  /** The id of the record this one was folded into as a duplicate; a match on this record is a match on that one. */
  duplicateOf?: string;
}

/** Which rule matched a sighting to a known event. */
export type MatchRule = "page-and-title" | "fuzzy" | "venueless" | "month";

export interface Match<T> {
  /** The known event the sighting is, when one is. */
  event?: T;
  rule?: MatchRule;
  /** A venue-less sighting that fits two or more known events with none preferred: nothing can say which. */
  ambiguous: boolean;
}

/**
 * The known event a sighting is, if any, and by which rule: the match on primary page and title
 * first (among several such records, the one whose date is nearest), then the fuzzy match on
 * title, venue, and nearby date, then for a sighting with no venue the known event with its title
 * on its date, then a recurring event the sighting is one month of. A match on a record folded as a
 * duplicate is a match on the record it was folded into, as far as that chain goes within `known`.
 */
export function matchSighting<T extends EventIdentity>(sighting: EventIdentity, known: readonly T[], aliases: VenueAliases): Match<T> {
  const onPage = known.filter((k) => samePageAndTitle(sighting, k));
  const direct = onPage.reduce<T | undefined>((nearest, k) => (nearest === undefined || daysApart(sighting, k) < daysApart(sighting, nearest) ? k : nearest), undefined);
  if (direct) return followed(direct, "page-and-title", known);
  const fuzzy = known.find((k) => sameEventFuzzily(sighting, k, aliases));
  if (fuzzy) return followed(fuzzy, "fuzzy", known);
  const venueless = candidateForVenueless(sighting, known);
  if (venueless.event) return { event: venueless.event, rule: "venueless", ambiguous: false };
  const month = known.find((k) => k.recurrence === "recurring" && k.status !== "expired" && oneMonthOf(sighting, k));
  if (month) return { event: month, rule: "month", ambiguous: false };
  return { ambiguous: venueless.ambiguous };
}

/** The known event a sighting is, if any; see matchSighting. */
export function findMatch<T extends EventIdentity>(sighting: EventIdentity, known: readonly T[], aliases: VenueAliases): T | undefined {
  return matchSighting(sighting, known, aliases).event;
}

/** The match, taken through any chain of duplicate pointers to the record kept; none when the chain leaves `known`. */
function followed<T extends EventIdentity>(matched: T, rule: MatchRule, known: readonly T[]): Match<T> {
  const seen = new Set<T>();
  let kept: T | undefined = matched;
  while (kept !== undefined && kept.duplicateOf !== undefined && !seen.has(kept)) {
    seen.add(kept);
    const id: string = kept.duplicateOf;
    kept = known.find((k) => k.id === id);
  }
  // A chain that leaves the known events, or that loops, points at no record.
  return kept === undefined || kept.duplicateOf !== undefined ? { ambiguous: false } : { event: kept, rule, ambiguous: false };
}

/**
 * Whether two records in the dataset are the same event under the rules matchSighting applies to a
 * sighting, either way round, but for the month rule, which folds on its own terms (see
 * foldDuplicates in run); `live` is every record not expired, for the venue-less rule's count.
 * Two records on one page with one title are the same event only when their dates are near: a
 * page that lists a title twice, weeks apart, lists two shows.
 */
export function sameEvent(a: EventIdentity, b: EventIdentity, live: readonly EventIdentity[], aliases: VenueAliases): boolean {
  return (
    (samePageAndTitle(a, b) && nearDates(a, b)) ||
    sameEventFuzzily(a, b, aliases) ||
    venuelessTwins(a, b) ||
    candidateForVenueless(a, live).event === b ||
    candidateForVenueless(b, live).event === a
  );
}

/**
 * Two venue-less records on one host with one title on one calendar date (#77): the host listed the
 * event twice, naming no venue either time, so they are two readings of one listing. Without this,
 * three such twins would each have two preferred candidates and none would ever fold.
 */
function venuelessTwins(a: EventIdentity, b: EventIdentity): boolean {
  if (a.venue !== undefined || b.venue !== undefined || a.start === undefined) return false;
  return calendarDate(a.start) === calendarDate(b.start) && onSameHost(a, b) && (sameOrShortenedTitle(a.title, b.title) || sameTitleWithSeries(a.title, b.title));
}

/**
 * A month tag at the end of a title: a month's name or abbreviation in parentheses, with or without
 * a period, optionally with a year ("(Oct. 2026)", "(November)", "(Sept 2026)"). Kept this narrow:
 * a title that differs in any other way is a different event.
 */
const MONTH_TAG = /\s*\(\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?:\s+\d{4})?\s*\)\s*$/iu;

/**
 * Whether a dated record is one month of a recurring event (#63): the same primary page, and its
 * title is the recurring event's with a month tag after it. A page that titles a recurring event
 * month by month ("Main Gallery Tours (Oct. 2026)") is read as the one recurring event, but a
 * reading may still give one month as a dated event.
 */
export function oneMonthOf(dated: EventIdentity, recurring: EventIdentity): boolean {
  if (!samePage(dated.primaryUrl, recurring.primaryUrl)) return false;
  const untagged = dated.title.replace(MONTH_TAG, "");
  return untagged !== dated.title && sameName(untagged, recurring.title);
}

/**
 * Two venue names are one venue when they normalize alike, when one contains the other at word
 * boundaries ("The Midland" in "The Midland Theatre - MO"), when they are the same words in another
 * order ("New American Royal Campus" is "American Royal New Campus"), or when the alias list names
 * both under one venue (see aliasName).
 */
export function sameVenue(a: string, b: string, aliases: VenueAliases): boolean {
  const [x, y] = [normalizeName(a), normalizeName(b)];
  if (oneVenueName(x, y)) return true;
  return Object.entries(aliases).some(([venue, names]) => {
    const group = [venue, ...names].map(normalizeName);
    return group.some((n) => aliasName(x, n)) && group.some((n) => aliasName(y, n));
  });
}

/** Two normalized venue names that are one venue under any of sameVenue's three rules. */
function oneVenueName(a: string, b: string): boolean {
  return sameOrContained(a, b) || sameWordsReordered(a, b);
}

/**
 * Whether a normalized venue name goes by an alias entry: the same name, the same words in another
 * order, or the entry with a label added ("Bartle Exhibit Hall (A – E)" for "Bartle Exhibit Hall").
 * Never a name shorter than the entry, though contained in it (#77): "Kansas City" would be every
 * entry that starts with it. A short form in use ("Kauffman Center") is an entry of its own.
 */
function aliasName(name: string, entry: string): boolean {
  return name === entry || sameWordsReordered(name, entry) || (name.length > entry.length && sameOrContained(entry, name));
}

function sameOrContained(a: string, b: string): boolean {
  const [shorter, longer] = byLength(a, b);
  return shorter !== "" && ` ${longer} `.includes(` ${shorter} `);
}

/**
 * The same words in another order. Not for a name with a letter or number label in it: "Studio A
 * Room B" and "Studio B Room A" are two rooms, though their words are the same.
 */
function sameWordsReordered(a: string, b: string): boolean {
  const words = (name: string) => name.split(" ").sort();
  const [x, y] = [words(a), words(b)];
  if ([...x, ...y].some((word) => word.length < 2 || /\p{N}/u.test(word))) return false;
  return x.join(" ") === y.join(" ");
}

/** The same primary page, whichever way its URL is written, and the same title; the date is not looked at. */
function samePageAndTitle(a: EventIdentity, b: EventIdentity): boolean {
  return samePage(a.primaryUrl, b.primaryUrl) && sameName(a.title, b.title);
}

/** Where a series name in front of a title ends: a bar, a colon, a dash, or a spaced hyphen. */
const TITLE_SEPARATOR = /\||:|–|—|\s-\s/gu;

/**
 * The same title, or one that is the other cut short at a word boundary: a page may bill an
 * event in full one week ("A / Orchestra and Choirs") and give only its lead title the next.
 */
function sameOrShortenedTitle(a: string, b: string): boolean {
  const [shorter, longer] = byLength(normalizeName(a), normalizeName(b));
  return shorter !== "" && sameOrCutShort(shorter, longer);
}

/**
 * The same or shortened title with a series name in front of the longer one: one reading of a page
 * may put the series first ("Pershing Lecture Series | A") where another does not. The shorter title
 * must start right after a separator in the longer, so two events in one series ("Series | A",
 * "Series | B") stay two. Only the same reading of one listing differs this way, so callers ask for
 * the same calendar date: a nearby date would fold "Open Mic" into Thursday's "Comedy Night: Open Mic".
 */
function sameTitleWithSeries(a: string, b: string): boolean {
  const [x, y] = [normalizeName(a), normalizeName(b)];
  const [short, longer] = x.length <= y.length ? [x, b] : [y, a];
  if (short === "") return false;
  return [...longer.matchAll(TITLE_SEPARATOR)].some((m) => sameOrCutShort(short, normalizeName(longer.slice(m.index + m[0].length))));
}

/**
 * Whether two titles are two forms of one title under the rules above, the same cut short or with a
 * series name in front, without being the same title (#75). A page may give an event's title in
 * full one week and its lead title the next; a refresh keeps the stored form rather than flap.
 */
export function variantTitles(a: string, b: string): boolean {
  return !sameName(a, b) && (sameOrShortenedTitle(a, b) || sameTitleWithSeries(a, b));
}

function sameOrCutShort(shorter: string, longer: string): boolean {
  return longer === shorter || longer.startsWith(`${shorter} `);
}

function byLength(a: string, b: string): [string, string] {
  return a.length <= b.length ? [a, b] : [b, a];
}

/** The local calendar date of an ISO date or date-time, as read. */
function calendarDate(iso: string | undefined): string | undefined {
  return iso?.slice(0, 10);
}

/** Whole days between two events' calendar dates; none when either has no date, which is as near as can be. */
function daysApart(a: EventIdentity, b: EventIdentity): number {
  const [x, y] = [calendarDate(a.start), calendarDate(b.start)];
  if (x === undefined || y === undefined) return 0;
  return Math.abs(Date.parse(x) - Date.parse(y)) / DAY_MS;
}

/**
 * Whether two events' dates are within the fuzzy window of each other, or either has none. Two
 * dates apart by more are two occurrences: the same show on another night, not a date that moved.
 */
export function nearDates(a: EventIdentity, b: EventIdentity): boolean {
  return daysApart(a, b) <= FUZZY_DATE_WINDOW_DAYS;
}

/**
 * A nearby date, the same or shortened title (or, on the same date, that title with a series name in
 * front), and the same venue. Dates are compared first, as the cheapest test: folding compares every
 * pair of records.
 */
function sameEventFuzzily(a: EventIdentity, b: EventIdentity, aliases: VenueAliases): boolean {
  if (a.venue === undefined || b.venue === undefined || a.start === undefined || b.start === undefined) return false;
  return (
    nearDates(a, b) &&
    (sameOrShortenedTitle(a.title, b.title) || (calendarDate(a.start) === calendarDate(b.start) && sameTitleWithSeries(a.title, b.title))) &&
    sameVenue(a.venue, b.venue, aliases)
  );
}

/**
 * For a sighting that names no venue, the known event with the same or shortened title, with or
 * without a series name in front, on the same calendar date, not expired. With one such event, it is
 * the match. With two or more, the one on the sighting's host is preferred, then the one whose own
 * page is the sighting's (#77): a program's calendar and its venue's list the same concert, and the
 * venue-less twin the program's page made last week is on the program's host. Where neither narrows
 * it to one, nothing can say which: the sighting is ambiguous. A recurring event has no date, so it
 * never qualifies; the sighting itself, when it is a record among the known, is no candidate either.
 */
function candidateForVenueless<T extends EventIdentity>(sighting: EventIdentity, known: readonly T[]): { event?: T; ambiguous: boolean } {
  const date = calendarDate(sighting.start);
  if (sighting.venue !== undefined || date === undefined) return { ambiguous: false };
  const candidates = known.filter(
    (k) => k !== sighting && k.status !== "expired" && calendarDate(k.start) === date && (sameOrShortenedTitle(sighting.title, k.title) || sameTitleWithSeries(sighting.title, k.title)),
  );
  let pool = candidates;
  for (const prefer of [onSameHost, sameOwnPage]) {
    if (pool.length <= 1) break;
    const narrowed = pool.filter((k) => prefer(sighting, k));
    if (narrowed.length > 0) pool = narrowed;
  }
  if (pool.length === 1) return { event: pool[0]!, ambiguous: false };
  return { ambiguous: candidates.length > 1 };
}

function onSameHost(a: EventIdentity, b: EventIdentity): boolean {
  const host = hostOf(a.primaryUrl);
  return host !== undefined && host === hostOf(b.primaryUrl);
}

function sameOwnPage(a: EventIdentity, b: EventIdentity): boolean {
  return a.eventUrl !== undefined && b.eventUrl !== undefined && samePage(a.eventUrl, b.eventUrl);
}

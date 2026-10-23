/**
 * The weekdays a limited run plays (#143, #196), as a page names them: read from a run's own page
 * or its page of performances, and from a list's own date line ("Wednesdays, Oct. 7-28").
 */
import { WEEKDAYS, type Weekday } from "./dataset.js";

/** The days named, in week order and each once, as the dataset carries them. */
export function orderedDays(days: readonly Weekday[]): Weekday[] {
  return WEEKDAYS.filter((d) => days.includes(d));
}

/** Each weekday's names on a page: "Fri", "Friday", "Fridays", "Thurs"; the three-letter form alone needs a word break after it. */
const DAY_NAMES: Record<Weekday, string> = {
  Mon: "mon(?:day)?s?",
  Tue: "tue(?:s|sday)?s?",
  Wed: "wed(?:nesday)?s?",
  Thu: "thu(?:r|rs|rsday)?s?",
  Fri: "fri(?:day)?s?",
  Sat: "sat(?:urday)?s?",
  Sun: "sun(?:day)?s?",
};
const DAY_NAME = new RegExp(`\\b(?:${WEEKDAYS.map((d) => `(${DAY_NAMES[d]})`).join("|")})\\b\\.?`, "gi");
/** What joins two weekdays into a span: "Thursday–Sunday", "Thurs - Sun", "Wednesdays through Saturdays". */
const SPAN_JOIN = /^\s*(?:[-–—]|to|through|thru)\s*$/i;
/** "Weekends", "(Weekend)": Saturday and Sunday. */
const WEEKEND = /\bweekends?\b/i;
/** What follows a weekday that is a date's ("Fri, October 2", "Friday, Sept. 25", "Sat 24"): a month or a day number, after any comma; a clock time ("Sun, 9 a.m.", "Sat 7:30pm") is no date (#218). */
const DATED = /^[\s,]*(?:\d(?!\d?\s*(?:[ap]\.?m\b|:\d))|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

/** A weekday named in a quote: which, where, whether in the plural ("Fridays"), and whether a date follows it. */
interface NamedDay {
  day: Weekday;
  at: number;
  end: number;
  plural: boolean;
  dated: boolean;
}

function namedDays(quote: string): NamedDay[] {
  return [...quote.matchAll(DAY_NAME)].map((m) => {
    const end = m.index + m[0].length;
    const name = m[0].replace(/\.$/, "").toLowerCase();
    return {
      day: WEEKDAYS[m.slice(1).findIndex((g) => g !== undefined)]!,
      at: m.index,
      end,
      plural: name.endsWith("days"),
      dated: DATED.test(quote.slice(end, end + 12)),
    };
  });
}

/** The days a quote covers: each named day that `counts`, every day inside a span of two named days, and the weekend when it says so. */
function coveredDays(quote: string, named: NamedDay[], counts: (n: NamedDay) => boolean): Set<Weekday> {
  const covered = new Set(named.filter(counts).map((n) => n.day));
  for (let i = 1; i < named.length; i++) {
    const [from, to] = [named[i - 1]!, named[i]!];
    if (!SPAN_JOIN.test(quote.slice(from.end, to.at))) continue;
    for (let d = WEEKDAYS.indexOf(from.day); ; d = (d + 1) % WEEKDAYS.length) {
      covered.add(WEEKDAYS[d]!);
      if (WEEKDAYS[d] === to.day) break;
    }
  }
  if (WEEKEND.test(quote)) {
    covered.add("Sat");
    covered.add("Sun");
  }
  return covered;
}

/**
 * Whether a quote from an own page names every one of the days: by name ("Fridays, Saturdays and Sundays", "Fri & Sat"),
 * inside a span of them ("Thursday–Sunday"), as the weekend, or as the weekdays of the performances it lists ("Friday 16
 * October 2026 6:30 pm").
 */
export function givesDays(quote: string, days: readonly Weekday[]): boolean {
  const covered = coveredDays(quote, namedDays(quote), () => true);
  return days.every((d) => covered.has(d));
}

/**
 * Whether a list's date line states every one of the days as the days a run plays (#196): in the plural ("Wednesdays,
 * Oct. 7-28", "Fridays and Saturdays"), inside a span ("Thursday–Sunday"), as the weekend ("(Weekends)"), or by a name
 * with no date after it ("Fri & Sat through Nov 1"). A weekday written beside a date ("Fri, October 2, 2026 – Fri,
 * February 5, 2027", "Friday, Sept. 25 – Wednesday, Nov. 11") is that date's weekday, not a day the run plays, so a
 * list's endpoints never give days as an own page's performances do.
 */
export function statesDays(quote: string, days: readonly Weekday[]): boolean {
  const covered = coveredDays(quote, namedDays(quote), (n) => n.plural || !n.dated);
  return days.every((d) => covered.has(d));
}

/** The days a list's date line states as the days a run plays (statesDays), in week order. */
export function statedDays(quote: string): Weekday[] {
  return WEEKDAYS.filter((d) => statesDays(quote, [d]));
}

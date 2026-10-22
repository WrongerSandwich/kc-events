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

/**
 * Whether a quote names every one of the days: by name ("Fridays, Saturdays and Sundays", "Fri & Sat"), inside a span
 * of them ("Thursday–Sunday"), or as the weekdays of the performances it lists ("Friday 16 October 2026 6:30 pm").
 */
export function givesDays(quote: string, days: readonly Weekday[]): boolean {
  const named = [...quote.matchAll(DAY_NAME)].map((m) => ({ day: WEEKDAYS[m.slice(1).findIndex((g) => g !== undefined)]!, at: m.index, end: m.index + m[0].length }));
  const covered = new Set(named.map((n) => n.day));
  for (let i = 1; i < named.length; i++) {
    const [from, to] = [named[i - 1]!, named[i]!];
    if (!SPAN_JOIN.test(quote.slice(from.end, to.at))) continue;
    for (let d = WEEKDAYS.indexOf(from.day); WEEKDAYS[d] !== to.day; d = (d + 1) % WEEKDAYS.length) covered.add(WEEKDAYS[d]!);
  }
  return days.every((d) => covered.has(d));
}

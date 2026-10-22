import { addDays, comingSunday, weekday } from "./dates";
import { firstDay, isDated, isPast, lastDay, playsOn } from "./events";
import { fold } from "./fold";
import type { Filters, When } from "./query";
import type { PublishedEvent } from "./types";

/** The inclusive local-date range a When means from today; undefined is everything. */
export function dateRange(when: When, today: string): { from: string; to: string } | undefined {
  if ("from" in when) return { from: when.from, to: when.to };
  switch (when.preset) {
    case "all": return undefined;
    case "today": return { from: today, to: today };
    case "fri-sun": {
      // Friday is two days before the coming Sunday; once it has come, the weekend runs from today.
      const sunday = comingSunday(today);
      const friday = addDays(sunday, -2);
      return { from: today > friday ? today : friday, to: sunday };
    }
    case "weekend": return { from: today, to: comingSunday(today) };
    // Seven days and thirty days, today among them; the range is inclusive at both ends.
    case "7d": return { from: today, to: addDays(today, 6) };
    case "30d": return { from: today, to: addDays(today, 29) };
  }
}

/**
 * The days the When group offers as one-day presets (#183): from Thursday, each of Friday, Saturday and Sunday still
 * to come, never today ("Today" covers it). Monday through Wednesday, and on Sunday, none.
 */
export function dayPresets(today: string): string[] {
  const day = weekday(today);
  if (day < 4) return []; // Sunday is 0
  const sunday = comingSunday(today);
  const days: string[] = [];
  for (let d = addDays(sunday, -2); d <= sunday; d = addDays(d, 1)) if (d > today) days.push(d);
  return days;
}

/**
 * "Keep going" under a bounded date filter (#183): the same filters through the Sunday after the range's end, the
 * events that adds, and how many every date holds. `nextWeek` when the added days are a whole week (the range ended
 * on a Sunday), else they are the rest of this one. Undefined with no end to extend (every date, a shortlist).
 */
export type KeepGoing = { next: Filters; through: string; nextWeek: boolean; added: number; everyDate: Filters; total: number };

export function keepGoing(events: readonly PublishedEvent[], f: Filters, today: string, saved: ReadonlySet<string>): KeepGoing | undefined {
  const range = dateRange(f.when, today);
  if (range === undefined || f.ids.length > 0) return undefined;
  const through = comingSunday(addDays(range.to, 1));
  const next: Filters = { ...f, when: { from: range.from, to: through } };
  const everyDate: Filters = { ...f, when: { preset: "all" } };
  let added = 0;
  let total = 0;
  for (const e of events) {
    if (!matches(e, everyDate, today, saved)) continue;
    total++;
    if (matches(e, next, today, saved) && !matches(e, f, today, saved)) added++;
  }
  return { next, through, nextWeek: weekday(range.to) === 0, added, everyDate, total };
}

/**
 * The first day from `from` through `to` that a run plays on (playsOn); undefined when it plays on none of them. Here,
 * with the explorer's code, so the front page does not carry it.
 */
export function nextPlayingDay(e: PublishedEvent, from: string, to: string): string | undefined {
  for (let d = from, n = 0; d <= to && n < 7; d = addDays(d, 1), n++) if (playsOn(e, d)) return d;
}

function inRange(e: PublishedEvent, range: { from: string; to: string }): boolean {
  const last = lastDay(e)!;
  const first = firstDay(e) ?? range.from; // a start-less run has been on since before any range
  if (first > range.to || last < range.from) return false;
  // A run with days must play on one of the range's days it is open (#143).
  return e.days === undefined || nextPlayingDay(e, first > range.from ? first : range.from, last < range.to ? last : range.to) !== undefined;
}

/** Everything a search looks in, folded as the terms are, so "cafe" finds "Café" and "johnson county" a region. */
function searchable(e: PublishedEvent): string {
  return fold([e.title, e.venue, e.room ?? "", e.neighborhood, e.region, e.kind, e.whyLine ?? ""].join(" "));
}

/**
 * The explorer's predicate: AND across filters, OR within kind and region, every search term somewhere. A passed event
 * is out, unless it is a save in the saved view, which shows what has passed as passed.
 */
export function matches(e: PublishedEvent, f: Filters, today: string, saved: ReadonlySet<string>): boolean {
  if (isPast(e, today) && !(f.saved && saved.has(e.id))) return false;
  if (f.ids.length > 0 && !f.ids.includes(e.id)) return false;
  if (!isDated(e)) {
    // A shortlist that names an always-there event shows it without the switch.
    if (!f.recurring && f.ids.length === 0) return false;
  } else {
    const range = dateRange(f.when, today);
    if (range !== undefined && !inRange(e, range)) return false;
  }
  if (f.kinds.length > 0 && !f.kinds.includes(e.kind)) return false;
  if (f.regions.length > 0 && !f.regions.includes(e.region)) return false;
  if (f.dontMiss && !e.dontMiss) return false;
  if (f.saved && !saved.has(e.id)) return false;
  const terms = fold(f.q).split(" ").filter((t) => t !== "");
  if (terms.length > 0) {
    const hay = searchable(e);
    if (!terms.every((t) => hay.includes(t))) return false;
  }
  return true;
}

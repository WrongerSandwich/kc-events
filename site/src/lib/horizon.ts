import { addDays, comingSunday, formatDay, formatRange, formatShort, formatTime, isDateOnly, weekday } from "./dates";
import { firstDay, isDated, isOpen, isPast, isUnderway, lastDay, playsOn } from "./events";
import type { PublishedEvent } from "./types";

export type Horizon = "through-sunday" | "next-two-weeks" | "further-out";
export const HORIZONS: readonly Horizon[] = ["through-sunday", "next-two-weeks", "further-out"];

/** The first bucket runs through the coming Sunday; the second through today plus fourteen. */
export function horizonBounds(today: string): { sunday: string; twoWeeks: string } {
  return { sunday: comingSunday(today), twoWeeks: addDays(today, 14) };
}

/**
 * A one-off is placed by its start. A limited run is placed by when you can first go: its opening, or today once
 * it is open, so a run that is on now sits under "This week" whatever its close. The date line carries the close.
 * A run with days is placed on the first of them from then, so a weekend run is not "today" on a Monday.
 */
export function anchorDate(e: PublishedEvent, today: string): string | undefined {
  if (!isDated(e)) return undefined;
  if (e.recurrence !== "limited-run") return firstDay(e) ?? lastDay(e);
  const opens = firstDay(e);
  const from = opens === undefined || opens < today ? today : opens;
  // A week covers every weekday; a run closing before its next day falls back to `from`, as isPast will drop it.
  for (let d = from, n = 0; n < 7 && d <= lastDay(e)!; d = addDays(d, 1), n++) if (playsOn(e, d)) return d;
  return from;
}

/** Total over every non-past dated event: each lands in exactly one bucket. */
export function horizon(e: PublishedEvent, today: string): Horizon | undefined {
  const anchor = anchorDate(e, today);
  if (anchor === undefined) return undefined;
  const { sunday, twoWeeks } = horizonBounds(today);
  if (anchor <= sunday) return "through-sunday";
  if (anchor <= twoWeeks) return "next-two-weeks";
  return "further-out";
}

/**
 * "This weekend" Thursday to Sunday, "This week" Monday to Wednesday, always with the dates. `doneToday`: nothing
 * picked for today is still to come (its timed picks have all begun), so the first bucket's dates start tomorrow, and
 * with Sunday tomorrow it is "Tomorrow, Sun Oct 25": on a Saturday night the section is about the day still ahead.
 */
export function horizonHeading(h: Horizon, today: string, doneToday = false): string {
  const { sunday, twoWeeks } = horizonBounds(today);
  switch (h) {
    case "through-sunday": {
      const from = doneToday && today < sunday ? addDays(today, 1) : today;
      if (from !== today && from === sunday) return `Tomorrow, ${formatDay(sunday)}`;
      // By the day the dates start: a Wednesday night's Thursday to Sunday is a weekend, as every other one is.
      const label = weekday(from) === 0 || weekday(from) >= 4 ? "This weekend" : "This week";
      return from === sunday ? `${label}, ${formatShort(from)}` : `${label}, ${formatRange(from, sunday)}`;
    }
    case "next-two-weeks":
      return `Next two weeks, through ${formatShort(twoWeeks)}`;
    case "further-out":
      return `Later, after ${formatShort(twoWeeks)}`;
  }
}

/**
 * The don't-miss events by bucket, each sorted by anchor, then start time, then title; every bucket present.
 * A run already on that stays open past the bucket's end sorts last in it: it will be there next week too, so the
 * bucket leads with what happens on a date. A run closing inside the bucket keeps its place.
 */
export function bucketDontMiss(events: PublishedEvent[], today: string): Record<Horizon, PublishedEvent[]> {
  const out: Record<Horizon, PublishedEvent[]> = { "through-sunday": [], "next-two-weeks": [], "further-out": [] };
  for (const e of events) {
    if (!e.dontMiss || isPast(e, today)) continue;
    const h = horizon(e, today);
    if (h !== undefined) out[h].push(e);
  }
  const { sunday, twoWeeks } = horizonBounds(today);
  const end: Record<Horizon, string> = { "through-sunday": sunday, "next-two-weeks": twoWeeks, "further-out": "9999-12-31" };
  for (const h of HORIZONS) {
    // Open, not on now: a run with days lingers on the days it does not play too (#143).
    const lingers = (e: PublishedEvent) => (isOpen(e, today) && lastDay(e)! > end[h] ? 1 : 0);
    out[h].sort(
      (a, b) =>
        lingers(a) - lingers(b) ||
        anchorDate(a, today)!.localeCompare(anchorDate(b, today)!) ||
        startTime(a) - startTime(b) ||
        a.title.localeCompare(b.title),
    );
  }
  return out;
}

/** The date line for anything with a span: a run's open/close, or a multi-day one-off's time and last day (throughLine). */
export function closingLine(e: PublishedEvent, today: string): string {
  const first = firstDay(e);
  const last = lastDay(e)!;
  if (first === undefined && !isUnderway(e, today)) return `Closed ${formatDay(last)}`;
  if (e.recurrence === "limited-run") {
    // A run that plays only some weekdays names them, since it is not on every day it is open (#143).
    const days = e.daysLine;
    if (isUnderway(e, today)) return days === undefined ? `Closes ${formatDay(last)}` : `${days} each week, closes ${formatDay(last)}`;
    return `Opens ${formatDay(first!)}, ${days === undefined ? "closes" : `${days} each week, through`} ${formatDay(last)}`;
  }
  return throughLine(e);
}

/**
 * A multi-day one-off's line on every day it is listed, underway or not (#90): "8:30 pm · through Sat Oct 10", or
 * "Through Sun Oct 11" without a start time. The day it is under, a heading or a tile, says the rest.
 */
export function throughLine(e: PublishedEvent): string {
  const last = formatDay(lastDay(e)!);
  return isDateOnly(e.start!) ? `Through ${last}` : `${formatTime(e.start!)} · through ${last}`;
}

/** An event's start instant for ordering within a day; a date-only or missing start sorts first, as "all day". */
function startTime(e: PublishedEvent): number {
  return e.start === undefined || isDateOnly(e.start) ? 0 : Date.parse(e.start);
}

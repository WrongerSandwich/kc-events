import { addDays, comingSunday, formatDay, formatRange, formatShort, weekday } from "./dates";
import { firstDay, isDated, isPast, isUnderway, lastDay } from "./events";
import type { PublishedEvent } from "./types";

export type Horizon = "through-sunday" | "next-two-weeks" | "further-out";
export const HORIZONS: readonly Horizon[] = ["through-sunday", "next-two-weeks", "further-out"];

/** The first bucket runs through the coming Sunday; the second through today plus fourteen. */
export function horizonBounds(today: string): { sunday: string; twoWeeks: string } {
  return { sunday: comingSunday(today), twoWeeks: addDays(today, 14) };
}

/** A one-off is placed by its start; a limited run by its close, because the regret is in missing the close. */
export function anchorDate(e: PublishedEvent): string | undefined {
  if (!isDated(e)) return undefined;
  return e.recurrence === "limited-run" ? lastDay(e) : (firstDay(e) ?? lastDay(e));
}

/** Total over every non-past dated event: each lands in exactly one bucket. */
export function horizon(e: PublishedEvent, today: string): Horizon | undefined {
  const anchor = anchorDate(e);
  if (anchor === undefined) return undefined;
  const { sunday, twoWeeks } = horizonBounds(today);
  if (anchor <= sunday) return "through-sunday";
  if (anchor <= twoWeeks) return "next-two-weeks";
  return "further-out";
}

/** "This weekend" Thursday to Sunday, "This week" Monday to Wednesday, always with the dates. */
export function horizonHeading(h: Horizon, today: string): string {
  const { sunday, twoWeeks } = horizonBounds(today);
  switch (h) {
    case "through-sunday": {
      const label = weekday(today) === 0 || weekday(today) >= 4 ? "This weekend" : "This week";
      return today === sunday ? `${label}, ${formatShort(today)}` : `${label}, ${formatRange(today, sunday)}`;
    }
    case "next-two-weeks":
      return `Next two weeks, through ${formatShort(twoWeeks)}`;
    case "further-out":
      return "Further out";
  }
}

/** The don't-miss events by bucket, each sorted by anchor then title; every bucket present. */
export function bucketDontMiss(events: PublishedEvent[], today: string): Record<Horizon, PublishedEvent[]> {
  const out: Record<Horizon, PublishedEvent[]> = { "through-sunday": [], "next-two-weeks": [], "further-out": [] };
  for (const e of events) {
    if (!e.dontMiss || isPast(e, today)) continue;
    const h = horizon(e, today);
    if (h !== undefined) out[h].push(e);
  }
  for (const h of HORIZONS) out[h].sort((a, b) => anchorDate(a)!.localeCompare(anchorDate(b)!) || a.title.localeCompare(b.title));
  return out;
}

/** The date line for anything with a span: a run's open/close, or a multi-day one-off's range. */
export function closingLine(e: PublishedEvent, today: string): string {
  const first = firstDay(e);
  const last = lastDay(e)!;
  if (e.recurrence === "limited-run") {
    return isUnderway(e, today) ? `On now, closes ${formatDay(last)}` : `Opens ${formatDay(first!)}, runs through ${formatDay(last)}`;
  }
  return isUnderway(e, today) ? `On now, through ${formatDay(last)}` : `${formatDay(first!)}–${formatDay(last)}`;
}

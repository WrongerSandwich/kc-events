import { addDays, comingSunday } from "./dates";
import { firstDay, isDated, isPast, lastDay } from "./events";
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
    case "7d": return { from: today, to: addDays(today, 7) };
    case "30d": return { from: today, to: addDays(today, 30) };
  }
}

function inRange(e: PublishedEvent, range: { from: string; to: string }): boolean {
  const last = lastDay(e)!;
  const first = firstDay(e) ?? range.from; // a start-less run has been on since before any range
  return first <= range.to && last >= range.from;
}

function searchable(e: PublishedEvent): string {
  return [e.title, e.venue, e.neighborhood, e.whyLine ?? ""].join(" ").toLowerCase();
}

/** The explorer's predicate: AND across filters, OR within kind and region, every search term somewhere. */
export function matches(e: PublishedEvent, f: Filters, today: string, saved: ReadonlySet<string>): boolean {
  if (isPast(e, today)) return false;
  if (!isDated(e)) {
    if (!f.recurring) return false;
  } else {
    const range = dateRange(f.when, today);
    if (range !== undefined && !inRange(e, range)) return false;
  }
  if (f.kinds.length > 0 && !f.kinds.includes(e.kind)) return false;
  if (f.regions.length > 0 && !f.regions.includes(e.region)) return false;
  if (f.dontMiss && !e.dontMiss) return false;
  if (f.saved && !saved.has(e.id)) return false;
  const terms = f.q.toLowerCase().split(/\s+/).filter((t) => t !== "");
  if (terms.length > 0) {
    const hay = searchable(e);
    if (!terms.every((t) => hay.includes(t))) return false;
  }
  return true;
}

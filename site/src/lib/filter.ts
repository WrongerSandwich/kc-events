import { addDays, comingSunday } from "./dates";
import { firstDay, isDated, isPast, lastDay } from "./events";
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

function inRange(e: PublishedEvent, range: { from: string; to: string }): boolean {
  const last = lastDay(e)!;
  const first = firstDay(e) ?? range.from; // a start-less run has been on since before any range
  return first <= range.to && last >= range.from;
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

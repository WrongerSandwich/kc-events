import { formatDay, formatTime, isDateOnly } from "./dates";
import { firstDay, isDated, isMultiDay, isUnderway, lastDay } from "./events";
import { matches } from "./filter";
import { closingLine } from "./horizon";
import type { Filters } from "./query";
import type { PublishedEvent } from "./types";

export type ResultGroup = { key: string; heading: string; events: PublishedEvent[] };

/**
 * A row's date line under its group heading: a start time or "All day"; for a span, "On now, closes Tue Oct 20" when
 * underway, else "Runs through Sat Nov 14" (it sits under its opening day); a recurring event's schedule phrase.
 * With `withDay` (the venue sort, which has no day headings), the day comes first: "Fri Oct 9 · 7:00 pm",
 * "Fri Oct 9 · all day", "Tue Oct 20–Sat Nov 14".
 */
export function rowDateLine(e: PublishedEvent, today: string, withDay = false): string {
  if (!isDated(e)) return e.schedule ?? "";
  if (isMultiDay(e)) {
    if (isUnderway(e, today)) return closingLine(e, today);
    const last = formatDay(lastDay(e)!);
    return withDay ? `${formatDay(firstDay(e)!)}–${last}` : `Runs through ${last}`;
  }
  const start = e.start!;
  if (!withDay) return isDateOnly(start) ? "All day" : formatTime(start);
  return `${formatDay(firstDay(e)!)} · ${isDateOnly(start) ? "all day" : formatTime(start)}`;
}

function byStartThenTitle(a: PublishedEvent, b: PublishedEvent): number {
  // Date-only starts sort before timed ones on the same day; a ten-character string is less than a longer one with the same prefix.
  return (a.start ?? "").localeCompare(b.start ?? "") || a.title.localeCompare(b.title);
}

/** The explorer's results: "On now", then one group per day, then "Always there" when recurring events are included. */
export function groupResults(events: PublishedEvent[], f: Filters, today: string, saved: ReadonlySet<string>): ResultGroup[] {
  const hits = events.filter((e) => matches(e, f, today, saved));

  if (f.sort === "venue") {
    const sorted = [...hits].sort((a, b) => a.venue.localeCompare(b.venue) || (firstDay(a) ?? lastDay(a) ?? "").localeCompare(firstDay(b) ?? lastDay(b) ?? "") || a.title.localeCompare(b.title));
    return sorted.length === 0 ? [] : [{ key: "venue", heading: "By venue", events: sorted }];
  }

  const onNow = hits.filter((e) => isUnderway(e, today)).sort((a, b) => lastDay(a)!.localeCompare(lastDay(b)!) || a.title.localeCompare(b.title));
  const byDay = new Map<string, PublishedEvent[]>();
  for (const e of hits) {
    if (!isDated(e) || isUnderway(e, today)) continue;
    const day = firstDay(e)!; // a start-less run is always underway, so never reaches here
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }
  const always = hits.filter((e) => !isDated(e)).sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));

  const groups: ResultGroup[] = [];
  if (onNow.length > 0) groups.push({ key: "on-now", heading: "On now", events: onNow });
  for (const day of [...byDay.keys()].sort()) groups.push({ key: day, heading: formatDay(day), events: byDay.get(day)!.sort(byStartThenTitle) });
  if (always.length > 0) groups.push({ key: "always-there", heading: "Always there", events: always });
  return groups;
}

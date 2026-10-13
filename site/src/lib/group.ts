import { addDays, formatDay, formatTime, isDateOnly } from "./dates";
import { firstDay, isDated, isMultiDay, isOnNow, isPast, lastDay } from "./events";
import { dateRange, matches } from "./filter";
import { throughLine } from "./horizon";
import type { Filters } from "./query";
import type { PublishedEvent } from "./types";

/** The saved view's last group: saves that have passed, listed with their days since no day heading carries them. */
export const PASSED_GROUP = "passed";
/** A shortlist's one group (#132): its events in the link's order, each row carrying its day. */
export const SHORTLIST_GROUP = "shortlist";

/** `collapsed`: shown as one closed line with its count, opening to its rows. */
export type ResultGroup = { key: string; heading: string; events: PublishedEvent[]; collapsed: boolean };

/**
 * A row's date line under its group heading: a start time or "All day"; for a run on now, "Closes Tue Oct 20", under
 * "On now"; for a run not yet open, "Runs through Sat Nov 14" under its opening day; for a multi-day one-off, under
 * each of its days, "8:30 pm · through Sat Oct 10" or "Through Sun Oct 11" (throughLine); a recurring event's
 * schedule phrase. Kept short so the explorer's date column stays narrow; the front page's cards say more (closingLine).
 * With `withDay` (the venue sort, which has no day headings), the day comes first: "Fri Oct 9 · 7:00 pm",
 * "Fri Oct 9 · all day", "Tue Oct 20–Sat Nov 14", "Thu Oct 29, 6:00 pm–Sat Oct 31".
 */
export function rowDateLine(e: PublishedEvent, today: string, withDay = false): string {
  if (!isDated(e)) return e.schedule ?? "";
  if (isMultiDay(e)) {
    const last = formatDay(lastDay(e)!);
    if (isOnNow(e, today)) return `Closes ${last}`;
    const time = isDateOnly(e.start!) ? undefined : formatTime(e.start!);
    if (withDay) return `${formatDay(firstDay(e)!)}${time ? `, ${time}` : ""}–${last}`;
    if (e.recurrence !== "limited-run") return throughLine(e);
    return time ? `${time}–${last}` : `Runs through ${last}`;
  }
  const start = e.start!;
  if (!withDay) return isDateOnly(start) ? "All day" : formatTime(start);
  return `${formatDay(firstDay(e)!)} · ${isDateOnly(start) ? "all day" : formatTime(start)}`;
}

/** The full start (date-only before timed on one day); a start-less run sorts by its last day, a recurring event first. */
function sortStart(e: PublishedEvent): string {
  return e.start ?? lastDay(e) ?? "";
}

/** Within one day's group: all-day first, then by time of day, so a one-off carried over from yesterday sorts by its hour. */
function byTimeThenTitle(a: PublishedEvent, b: PublishedEvent): number {
  return timeOfDay(a).localeCompare(timeOfDay(b)) || a.title.localeCompare(b.title);
}

/** "" for a date-only start, else the start from its time on; the same zone's wall times compare as strings. */
function timeOfDay(e: PublishedEvent): string {
  return isDateOnly(e.start!) ? "" : e.start!.slice(11);
}

/** The days a dated event is listed under: a one-off's every day from today within the when-filter, else its first day. */
function listedDays(e: PublishedEvent, today: string, range: { from: string; to: string } | undefined): string[] {
  const first = firstDay(e)!; // a start-less run is always on now, so never reaches here
  if (e.recurrence === "limited-run" || !isMultiDay(e)) return [first];
  const from = [first, today, range?.from ?? first].reduce((a, b) => (a > b ? a : b));
  const to = range !== undefined && range.to < lastDay(e)! ? range.to : lastDay(e)!;
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Every event in the groups once, in order: a multi-day one-off is under each of its days but is one event to count or export. */
export function resultEvents(groups: readonly ResultGroup[]): PublishedEvent[] {
  const seen = new Set<string>();
  return groups.flatMap((g) => g.events).filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

/**
 * The explorer's results: "On now" (limited runs open today), then one group per day, a multi-day one-off under each of
 * its days (#90), then "Always there" when recurring events are included, then, in the saved view, "Already happened";
 * sorted by venue, one group per venue instead (a passed save among them, its row marked).
 * Under the date sort, with no when-filter, "On now" is collapsed: its runs (often dozens of exhibitions closing months out) would
 * otherwise push the first dated day off the first screen. A when-filter slice is short enough to show it open.
 */
export function groupResults(events: PublishedEvent[], f: Filters, today: string, saved: ReadonlySet<string>): ResultGroup[] {
  const hits = events.filter((e) => matches(e, f, today, saved));

  // A shortlist keeps the order its sender gave it; the venue sort still groups it by venue.
  if (f.ids.length > 0 && f.sort === "date") {
    const byId = new Map(hits.map((e) => [e.id, e]));
    const listed = f.ids.map((id) => byId.get(id)).filter((e): e is PublishedEvent => e !== undefined);
    if (listed.length === 0) return [];
    return [{ key: SHORTLIST_GROUP, heading: `Shortlist · ${listed.length} ${listed.length === 1 ? "event" : "events"}`, events: listed, collapsed: false }];
  }

  if (f.sort === "venue") {
    const sorted = [...hits].sort((a, b) => a.venue.localeCompare(b.venue) || sortStart(a).localeCompare(sortStart(b)) || a.title.localeCompare(b.title));
    const byVenue = new Map<string, PublishedEvent[]>();
    for (const e of sorted) {
      const list = byVenue.get(e.venue);
      if (list) list.push(e);
      else byVenue.set(e.venue, [e]);
    }
    return [...byVenue].map(([venue, events]) => ({ key: `venue:${venue}`, heading: venue, events, collapsed: false }));
  }

  const onNow = hits.filter((e) => isOnNow(e, today)).sort((a, b) => lastDay(a)!.localeCompare(lastDay(b)!) || a.title.localeCompare(b.title));
  const range = dateRange(f.when, today);
  const byDay = new Map<string, PublishedEvent[]>();
  for (const e of hits) {
    if (!isDated(e) || isOnNow(e, today) || isPast(e, today)) continue;
    for (const day of listedDays(e, today, range)) byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }
  const always = hits.filter((e) => !isDated(e)).sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
  // Only the saved view lets a passed event through (matches); the latest to have passed first.
  const passed = hits.filter((e) => isPast(e, today)).sort((a, b) => lastDay(b)!.localeCompare(lastDay(a)!) || sortStart(b).localeCompare(sortStart(a)) || a.title.localeCompare(b.title));

  const groups: ResultGroup[] = [];
  const noWhenFilter = "preset" in f.when && f.when.preset === "all";
  // Collapsed only when dated days follow it to lead instead; alone, a closed line would hide every result.
  if (onNow.length > 0) groups.push({ key: "on-now", heading: "On now", events: onNow, collapsed: noWhenFilter && byDay.size > 0 });
  for (const day of [...byDay.keys()].sort()) groups.push({ key: day, heading: formatDay(day), events: byDay.get(day)!.sort(byTimeThenTitle), collapsed: false });
  if (always.length > 0) groups.push({ key: "always-there", heading: "Always there", events: always, collapsed: false });
  if (passed.length > 0) groups.push({ key: PASSED_GROUP, heading: "Already happened", events: passed, collapsed: false });
  return groups;
}

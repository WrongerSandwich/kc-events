import { dayOfMonth, formatDay, formatShort, formatTime, isDateOnly, localDate } from "./dates";
import { firstDay, isMultiDay, isUnderway, lastDay } from "./events";
import { closingLine } from "./horizon";
import type { PublishedEvent } from "./types";

/**
 * A card's calendar tile, read top to bottom: a small label, the day of the month large, the month; plus `detail`,
 * the one fact the tile cannot show (a time, a span), for the line under the title. `label` is the whole date in
 * words, for screen readers, since the tile itself is visual. `today` marks a one-off whose first day, or a
 * later day of whose span, is the visitor's today; `started`, a timed one-off today whose start has passed.
 */
export type Tile = { top: string; day: string; month: string; detail?: string; label: string; today?: true; started?: true };

const parts = (date: string) => ({ day: String(dayOfMonth(date)), month: formatShort(date).split(" ")[0]! });

/**
 * `now` is the visitor's wall clock in the site's zone (nowIn's form), known only once the page runs in a browser.
 * Without it the tile shows no Today or Started state, so built HTML never claims a day or an hour it cannot see.
 */
export function dateTile(e: PublishedEvent, today: string, now?: string): Tile {
  const first = firstDay(e);
  const last = lastDay(e)!;
  if (e.recurrence === "limited-run") {
    // A run that plays only some weekdays shows them where another says "On now" or "Through" (#143).
    const days = e.daysLine;
    if (isUnderway(e, today) || first === undefined) {
      return { top: "Until", ...parts(last), detail: days ?? "On now", label: closingLine(e, today) };
    }
    const through = days === undefined ? `Through ${formatDay(last)}` : `${days} through ${formatDay(last)}`;
    return { top: "Opens", ...parts(first), detail: through, label: closingLine(e, today) };
  }
  // A multi-day one-off underway shows today, the day the explorer lists it under (#90), not its first day gone by.
  const day = isUnderway(e, today) && first! < today ? today : first!;
  if (now !== undefined && day === localDate(now)) return todayTile(e, day, today, now);
  const weekday = formatDay(day).split(" ")[0]!;
  if (isMultiDay(e)) return { top: weekday, ...parts(day), detail: closingLine(e, today), label: spanLabel(e, formatDay(day)) };
  const time = isDateOnly(e.start!) ? undefined : formatTime(e.start!);
  return { top: weekday, ...parts(day), detail: time, label: time ? `${formatDay(day)}, ${time}` : formatDay(day) };
}

/** A multi-day one-off in words, from `day`: "Fri Oct 9, 8:30 pm, through Sat Oct 10", "Today through Sun Oct 11". */
function spanLabel(e: PublishedEvent, day: string): string {
  const time = isDateOnly(e.start!) ? "" : `, ${formatTime(e.start!)},`;
  return `${day}${time} through ${formatDay(lastDay(e)!)}`;
}

/** A one-off on the visitor's today, `day`: its first day, or a later day of its span. */
function todayTile(e: PublishedEvent, day: string, today: string, now: string): Tile {
  const tile = { top: "Today", ...parts(day), today: true as const };
  if (isMultiDay(e)) return { ...tile, detail: closingLine(e, today), label: spanLabel(e, "Today") };
  if (isDateOnly(e.start!)) return { ...tile, detail: undefined, label: "Today" };
  const time = formatTime(e.start!);
  // Both are wall time in the site's zone, so the strings compare; the dataset's offset is not needed.
  if (now < e.start!.slice(0, 16)) return { ...tile, detail: time, label: `Today, ${time}` };
  return { ...tile, detail: `Started ${time}`, label: `Today, started ${time}`, started: true };
}

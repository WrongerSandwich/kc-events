import { dayOfMonth, formatDay, formatShort, formatTime, isDateOnly, localDate } from "./dates";
import { firstDay, isMultiDay, isUnderway, lastDay } from "./events";
import { closingLine } from "./horizon";
import type { PublishedEvent } from "./types";

/**
 * A card's calendar tile, read top to bottom: a small label, the day of the month large, the month; plus `detail`,
 * the one fact the tile cannot show (a time, a span), for the line under the title. `label` is the whole date in
 * words, for screen readers, since the tile itself is visual. `today` marks a one-off whose first day is the
 * visitor's today; `started`, a timed one-off today whose start has passed.
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
    if (isUnderway(e, today) || first === undefined) {
      return { top: "Until", ...parts(last), detail: "On now", label: closingLine(e, today) };
    }
    return { top: "Opens", ...parts(first), detail: `Through ${formatDay(last)}`, label: closingLine(e, today) };
  }
  if (now !== undefined && first === localDate(now)) return todayTile(e, today, now);
  const weekday = formatDay(first!).split(" ")[0]!;
  if (isMultiDay(e)) return { top: weekday, ...parts(first!), detail: closingLine(e, today), label: closingLine(e, today) };
  const time = isDateOnly(e.start!) ? undefined : formatTime(e.start!);
  return { top: weekday, ...parts(first!), detail: time, label: time ? `${formatDay(first!)}, ${time}` : formatDay(first!) };
}

/** A one-off whose first day is the visitor's today. */
function todayTile(e: PublishedEvent, today: string, now: string): Tile {
  const tile = { top: "Today", ...parts(firstDay(e)!), today: true as const };
  if (isMultiDay(e)) return { ...tile, detail: closingLine(e, today), label: `Today through ${formatDay(lastDay(e)!)}` };
  if (isDateOnly(e.start!)) return { ...tile, detail: undefined, label: "Today" };
  const time = formatTime(e.start!);
  // Both are wall time in the site's zone, so the strings compare; the dataset's offset is not needed.
  if (now < e.start!.slice(0, 16)) return { ...tile, detail: time, label: `Today, ${time}` };
  return { ...tile, detail: `Started ${time}`, label: `Today, started ${time}`, started: true };
}

import { formatDay, formatShort, formatTime, isDateOnly, localDate } from "./dates";
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

const parts = (date: string) => ({ day: String(Number(date.slice(8, 10))), month: formatShort(date).split(" ")[0]! });

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
  const isToday = now !== undefined && first === localDate(now);
  const top = isToday ? "Today" : formatDay(first!).split(" ")[0]!;
  const mark = isToday ? { today: true as const } : {};
  if (isMultiDay(e)) return { top, ...parts(first!), detail: closingLine(e, today), label: closingLine(e, today), ...mark };
  const time = isDateOnly(e.start!) ? undefined : formatTime(e.start!);
  const when = isToday ? "Today" : formatDay(first!);
  if (!time) return { top, ...parts(first!), detail: undefined, label: when, ...mark };
  // Both are wall time in the site's zone, so the strings compare; the dataset's offset is not needed.
  if (isToday && now >= e.start!.slice(0, 16)) {
    return { top, ...parts(first!), detail: `Started ${time}`, label: `${when}, started ${time}`, today: true, started: true };
  }
  return { top, ...parts(first!), detail: time, label: `${when}, ${time}`, ...mark };
}

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
    // A run that plays only some weekdays shows them where another says "On now" or "Closes" (#143). A run's close is
    // "Closes", pairing with "Opens"; "through" is a one-off's span, or the end of a run's weekdays (#184).
    const days = e.daysLine;
    if (isUnderway(e, today) || first === undefined) {
      return { top: "Closes", ...parts(last), detail: days ?? "On now", label: closingLine(e, today) };
    }
    const close = days === undefined ? `Closes ${formatDay(last)}` : `${days}, through ${formatDay(last)}`;
    return { top: "Opens", ...parts(first), detail: close, label: closingLine(e, today) };
  }
  // A multi-day one-off underway shows today, the day the explorer lists it under (#90), not its first day gone by.
  const day = isUnderway(e, today) && first! < today ? today : first!;
  if (now !== undefined && day === localDate(now)) return todayTile(e, day, today, now);
  const weekday = formatDay(day).split(" ")[0]!;
  if (isMultiDay(e)) return { top: weekday, ...parts(day), detail: spanDetail(e, day, today), label: spanLabel(e, formatDay(day), day) };
  const time = isDateOnly(e.start!) ? undefined : formatTime(e.start!);
  return { top: weekday, ...parts(day), detail: time, label: time ? `${formatDay(day)}, ${time}` : formatDay(day) };
}

/**
 * A multi-day one-off's line under the title, on the tile's `day`. On its last day the tile already shows that day,
 * so "through" it would say the date twice ("Today 24", "7:00 pm · through Sat Oct 24"): it says "last day" instead.
 */
function spanDetail(e: PublishedEvent, day: string, today: string): string {
  if (lastDay(e) !== day) return closingLine(e, today);
  return isDateOnly(e.start!) ? "Last day" : `${formatTime(e.start!)} · last day`;
}

/**
 * A multi-day one-off in words, `said` being the tile's `day` in words: "Fri Oct 9, 8:30 pm, through Sat Oct 10",
 * "Today through Sun Oct 11", and on its last day "Today, 8:30 pm, the last day".
 */
function spanLabel(e: PublishedEvent, said: string, day: string): string {
  const time = isDateOnly(e.start!) ? "" : `, ${formatTime(e.start!)}`;
  if (lastDay(e) === day) return `${said}${time}, the last day`;
  return `${said}${time && `${time},`} through ${formatDay(lastDay(e)!)}`;
}

/** A one-off on the visitor's today, `day`: its first day, or a later day of its span. */
function todayTile(e: PublishedEvent, day: string, today: string, now: string): Tile {
  const tile = { top: "Today", ...parts(day), today: true as const };
  if (isMultiDay(e)) return { ...tile, detail: spanDetail(e, day, today), label: spanLabel(e, "Today", day) };
  if (isDateOnly(e.start!)) return { ...tile, detail: undefined, label: "Today" };
  const time = formatTime(e.start!);
  // Both are wall time in the site's zone, so the strings compare; the dataset's offset is not needed.
  if (now < e.start!.slice(0, 16)) return { ...tile, detail: time, label: `Today, ${time}` };
  return { ...tile, detail: `Started ${time}`, label: `Today, started ${time}`, started: true };
}

import { formatDay, formatShort, formatTime, isDateOnly } from "./dates";
import { firstDay, isMultiDay, isUnderway, lastDay } from "./events";
import { closingLine } from "./horizon";
import type { PublishedEvent } from "./types";

/**
 * A card's calendar tile, read top to bottom: a small label, the day of the month large, the month; plus `detail`,
 * the one fact the tile cannot show (a time, a span), for the line under the title. `label` is the whole date in
 * words, for screen readers, since the tile itself is visual.
 */
export type Tile = { top: string; day: string; month: string; detail?: string; label: string };

const parts = (date: string) => ({ day: String(Number(date.slice(8, 10))), month: formatShort(date).split(" ")[0]! });

export function dateTile(e: PublishedEvent, today: string): Tile {
  const first = firstDay(e);
  const last = lastDay(e)!;
  if (e.recurrence === "limited-run") {
    if (isUnderway(e, today) || first === undefined) {
      return { top: "Until", ...parts(last), detail: "On now", label: closingLine(e, today) };
    }
    return { top: "Opens", ...parts(first), detail: `Through ${formatDay(last)}`, label: closingLine(e, today) };
  }
  const weekday = formatDay(first!).split(" ")[0]!;
  if (isMultiDay(e)) return { top: weekday, ...parts(first!), detail: closingLine(e, today), label: closingLine(e, today) };
  const time = isDateOnly(e.start!) ? undefined : formatTime(e.start!);
  return { top: weekday, ...parts(first!), detail: time, label: time ? `${formatDay(first!)}, ${time}` : formatDay(first!) };
}

import { formatLong, formatTime, isDateOnly } from "./dates";
import { firstDay, isDated, isMultiDay, isOnNow, isUnderway, lastDay } from "./events";
import type { PublishedEvent } from "./types";

/**
 * The event page's date line, in full (spec section 7): "Friday, October 9, 7:00 pm"; a run on now "Closes Saturday,
 * November 14", one not yet open "Opens Tuesday, October 20, closes Saturday, November 14", one gone "Closed Saturday,
 * October 31"; a multi-day one-off "Friday, October 9 through Sunday, October 11", its time after its first day when it
 * has one; a run that plays only some weekdays with them first, "Fri–Sun each week, through Sunday, November 1" (#143,
 * #184); a recurring event's schedule phrase.
 */
export function longDateLine(e: PublishedEvent, today: string): string {
  if (!isDated(e)) return e.schedule ?? "";
  const first = firstDay(e);
  const last = lastDay(e)!;
  if (isMultiDay(e)) {
    if (e.recurrence === "limited-run") {
      // "Closes" for a run, pairing with the tile's "Opens"; "through" only ends its weekdays (#184).
      if (last < today) return `Closed ${formatLong(last)}`;
      const days = e.daysLine;
      if (days !== undefined) {
        // A run that plays only some weekdays says which (#143), whether or not it plays today.
        const from = first === undefined || isUnderway(e, today) ? "" : `${formatLong(first)} `;
        return `${days} each week, ${from}through ${formatLong(last)}`;
      }
      if (first === undefined || isOnNow(e, today)) return `Closes ${formatLong(last)}`;
      return `Opens ${formatLong(first)}, closes ${formatLong(last)}`;
    }
    // A one-off keeps its first day and time while underway (#90): it is three days at most, and the time matters.
    const time = isDateOnly(e.start!) ? "" : `, ${formatTime(e.start!)}`;
    return `${formatLong(first!)}${time} through ${formatLong(last)}`;
  }
  const day = formatLong(first!);
  return isDateOnly(e.start!) ? day : `${day}, ${formatTime(e.start!)}`;
}

import { formatLong, formatTime, isDateOnly } from "./dates";
import { firstDay, isDated, isMultiDay, isOnNow, lastDay } from "./events";
import type { PublishedEvent } from "./types";

/**
 * The event page's date line, in full (spec section 7): "Friday, October 9, 7:00 pm"; a span on now "Through
 * Saturday, November 14"; a span not yet begun, or a multi-day one-off, "Tuesday, October 20 through Saturday, November
 * 14", a one-off's time after its first day when it has one; a recurring event's schedule phrase.
 */
export function longDateLine(e: PublishedEvent, today: string): string {
  if (!isDated(e)) return e.schedule ?? "";
  const first = firstDay(e);
  const last = lastDay(e)!;
  if (isMultiDay(e)) {
    if (first === undefined || isOnNow(e, today)) return `Through ${formatLong(last)}`;
    // A one-off keeps its first day and time while underway (#90): it is three days at most, and the time matters.
    const time = e.recurrence === "limited-run" || isDateOnly(e.start!) ? "" : `, ${formatTime(e.start!)}`;
    return `${formatLong(first)}${time} through ${formatLong(last)}`;
  }
  const day = formatLong(first!);
  return isDateOnly(e.start!) ? day : `${day}, ${formatTime(e.start!)}`;
}

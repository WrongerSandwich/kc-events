import { addDays, daysBetween, hourOf, minuteOfDay } from "./dates";
import type { PublishedTonight } from "./types";

/** The start, in a day's table, of an event on all day: after every minute, so it counts until midnight. */
export const ALL_DAY = 1440;

/** The hour, local, from which the header looks to tomorrow: what is left of tonight is mostly under way. */
const TOMORROW_FROM = 22;

/**
 * The header's line (#134): what is still to start tonight by the visitor's clock, or from 10 pm all of tomorrow, with
 * the explorer's link for that day. `now` is the visitor's local "YYYY-MM-DDTHH:MM", undefined before the clock is
 * read (the build renders the whole of its day). Undefined for a day the table does not cover. (Ternaries, not a
 * lookup per day: the island is on every page's budget.)
 */
export function tonightLine(table: PublishedTonight, today: string, now?: string): { text: string; href: string } | undefined {
  const late = now !== undefined && hourOf(now) >= TOMORROW_FROM;
  const day = late ? addDays(today, 1) : today;
  const starts = day < table.from ? undefined : table.starts[daysBetween(table.from, day)];
  if (starts === undefined) return undefined;
  const after = late || now === undefined ? -1 : minuteOfDay(now);
  const n = starts.filter((m) => m > after).length;
  const text = n > 0 ? `${late ? "Tomorrow" : "Tonight"}: ${n} event${n === 1 ? "" : "s"}` : `Nothing ${starts.length > 0 ? "more " : ""}listed ${late ? "tomorrow" : "tonight"}`;
  return { text, href: `/explore?when=${late ? "tomorrow" : "today"}` };
}

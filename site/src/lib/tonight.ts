import { addDays, daysBetween, hourOf } from "./dates";
import type { PublishedTonight } from "./types";

/** The hour, local, from which the header looks to tomorrow: what is left of tonight is mostly under way. */
const TOMORROW_FROM = 22;

/**
 * The header's line (#134): tonight's count, or from 10 pm tomorrow's, with the explorer's link for that day.
 * `now` is the visitor's local "YYYY-MM-DDTHH:MM", undefined before the clock is read (the build renders today).
 * Undefined for a day the table does not cover. (Ternaries, not a lookup per day: the island is on every page's budget.)
 */
export function tonightLine(table: PublishedTonight, today: string, now?: string): { text: string; href: string } | undefined {
  const late = now !== undefined && hourOf(now) >= TOMORROW_FROM;
  const day = late ? addDays(today, 1) : today;
  const n = day < table.from ? undefined : table.counts[daysBetween(table.from, day)];
  if (n === undefined) return undefined;
  const text = n === 0 ? `Nothing listed ${late ? "tomorrow" : "tonight"}` : `${late ? "Tomorrow" : "Tonight"}: ${n} event${n === 1 ? "" : "s"}`;
  return { text, href: `/explore?when=${late ? "tomorrow" : "today"}` };
}

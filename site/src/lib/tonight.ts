import { addDays, daysBetween } from "./dates";

/** Each day's count of events on it, from `from` (dayCounts in filter.ts, at build). */
export type DayCounts = { from: string; counts: readonly number[] };

/** The hour, local, from which the header looks to tomorrow: what is left of tonight is mostly under way. */
const TOMORROW_FROM = 22;

/**
 * The header's line (#134): tonight's count, or from 10 pm tomorrow's, with the explorer's link for that day.
 * `now` is the visitor's local "YYYY-MM-DDTHH:MM", undefined before the clock is read (the build renders today).
 * Undefined for a day the table does not cover.
 */
export function tonightLine(table: DayCounts, today: string, now?: string): { text: string; href: string } | undefined {
  const late = now !== undefined && Number(now.slice(11, 13)) >= TOMORROW_FROM;
  const day = late ? addDays(today, 1) : today;
  const n = day < table.from ? undefined : table.counts[daysBetween(table.from, day)];
  if (n === undefined) return undefined;
  const word = late ? "tomorrow" : "tonight";
  const text = n === 0 ? `Nothing listed ${word}` : `${late ? "Tomorrow" : "Tonight"}: ${n} event${n === 1 ? "" : "s"}`;
  return { text, href: `/explore?when=${late ? "tomorrow" : "today"}` };
}

import { addDays, formatDay } from "./dates";
import { firstDay, lastDay } from "./events";
import type { PublishedEvent } from "./types";

export type WeekDay = { date: string; weekday: string; day: string; picks: PublishedEvent[] };

/**
 * The days from `today` through `sunday`, each with the picks that happen on it, in the order given. A one-off is on
 * every day it spans. A limited run counts only on the days that matter, its opening and its closing, so a long
 * exhibition does not fill every column.
 */
export function weekDays(picks: readonly PublishedEvent[], today: string, sunday: string): WeekDay[] {
  const days: WeekDay[] = [];
  for (let date = today; date <= sunday; date = addDays(date, 1)) {
    const [weekday, , day] = formatDay(date).split(" ");
    days.push({ date, weekday: weekday!, day: day!, picks: picks.filter((e) => isOn(e, date)) });
  }
  return days;
}

function isOn(e: PublishedEvent, date: string): boolean {
  const first = firstDay(e);
  const last = lastDay(e);
  if (e.recurrence === "limited-run") return date === first || date === last;
  return first !== undefined && last !== undefined && first <= date && date <= last;
}

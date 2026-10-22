import { addDays, formatDay } from "./dates";
import { firstDay, isOnNow, lastDay } from "./events";
import type { PublishedEvent } from "./types";

/** A day of the strip: `picks` happen on it; `running` are the limited runs open that day, its picks or not. */
export type WeekDay = { date: string; weekday: string; day: string; picks: PublishedEvent[]; running: PublishedEvent[] };

/**
 * The days from `today` through `sunday`, each with the picks that happen on it, in the order given. A one-off is on
 * every day it spans. A limited run is a pick only on the days that matter, its opening and its closing, so a long
 * exhibition does not fill every column. Every day a run is open, it is also among that day's `running`, which the strip
 * draws as a band, so a day is never called empty while a run is open.
 */
export function weekDays(picks: readonly PublishedEvent[], today: string, sunday: string): WeekDay[] {
  const days: WeekDay[] = [];
  for (let date = today; date <= sunday; date = addDays(date, 1)) {
    const [weekday, , day] = formatDay(date).split(" ");
    days.push({
      date, weekday: weekday!, day: day!,
      picks: picks.filter((e) => isOn(e, date)),
      running: picks.filter((e) => isOnNow(e, date)),
    });
  }
  return days;
}

/**
 * The card a day's column jumps to: the first pick that starts that day, else the first pick on it (a one-off that
 * opened earlier, whose card sits under its first day), else a run open that day; undefined for an empty day. A day
 * with a start of its own must not land on an earlier day's card (audit 2026-10-21, B3).
 */
export function dayTarget(d: WeekDay): PublishedEvent | undefined {
  return d.picks.find((e) => firstDay(e) === d.date) ?? d.picks[0] ?? d.running[0];
}

function isOn(e: PublishedEvent, date: string): boolean {
  const first = firstDay(e);
  const last = lastDay(e);
  if (e.recurrence === "limited-run") return date === first || date === last;
  return first !== undefined && last !== undefined && first <= date && date <= last;
}

import { dayOfMonth, formatDay, formatShort } from "./dates";
import { firstDay, isMultiDay, isOpen, isUnderway, lastDay } from "./events";
import { anchorDate, horizonBounds } from "./horizon";
import type { PublishedEvent } from "./types";

// The front page's alone, apart from horizon.ts, which the explorer's chunk shares: what is here costs the front page
// only.

/**
 * The date on a front page row after this week, the day the row is sorted by (anchorDate). A run with days can wait
 * there while open, for its next weekday after Sunday or for its closing day, so it is never "From" an opening that
 * has passed; one still to open is "From" the first day it plays.
 */
export function rowWhen(e: PublishedEvent, today: string): string {
  if (!isMultiDay(e)) return formatDay(firstDay(e)!);
  if (e.recurrence !== "limited-run") return `${formatDay(firstDay(e)!)}–${spanEnd(firstDay(e)!, lastDay(e)!)}`;
  const day = anchorDate(e, today)!;
  if (!isUnderway(e, today)) return `From ${formatDay(day)}`;
  return day === lastDay(e) ? `Closes ${formatDay(day)}` : formatDay(day);
}

/** A span's last day after its first: "6" in the same month ("Fri Dec 4–6"), "Jan 2" in another. */
function spanEnd(first: string, last: string): string {
  return first.slice(0, 7) === last.slice(0, 7) ? String(dayOfMonth(last)) : formatShort(last);
}

/**
 * A run already open today that stays open past the coming Sunday: on the front page it leaves This week for On now,
 * since a run on all week is not the week's news, and its tile could only give a close weeks off ("Closes 3 Jan"). A
 * run that opens or closes by Sunday stays a card in This week (the front page critique of 2026-11-24).
 */
export function isOnNowPick(e: PublishedEvent, today: string): boolean {
  return e.recurrence === "limited-run" && isOpen(e, today) && lastDay(e)! > horizonBounds(today).sunday;
}

/** This week's picks that are on now (isOnNowPick), the soonest to close first. */
export function onNowPicks(week: PublishedEvent[], today: string): PublishedEvent[] {
  return week
    .filter((e) => isOnNowPick(e, today))
    .sort((a, b) => lastDay(a)!.localeCompare(lastDay(b)!) || a.title.localeCompare(b.title));
}

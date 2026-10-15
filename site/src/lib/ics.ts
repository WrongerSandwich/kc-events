import { addDays, formatDay, formatShort, isDateOnly, localDate } from "./dates";
import { firstDay, isDated, lastDay, detailsUrl } from "./events";
import { nextPlayingDay } from "./filter";
import type { Geo, PublishedEvent } from "./types";

/**
 * An event as its calendar file has it: the build adds its venue's street address and position from the venue table
 * (#137), for LOCATION and GEO; the explorer's export has neither, and LOCATION is the venue and neighborhood.
 */
export type IcsEvent = PublishedEvent & { addressLine?: string; geo?: Geo };

/** RFC 5545 TEXT escaping: backslash first, then semicolon, comma, and newline. */
function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n?|\n/g, "\\n");
}

const encoder = new TextEncoder();

/** RFC 5545 folding: lines of at most 75 octets, continuations begin with one space. TextEncoder, not Buffer, so this runs in the browser too. */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const b = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + b > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += b;
  }
  out.push(current);
  return out.map((l, i) => (i === 0 ? l : ` ${l}`)).join("\r\n");
}

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 weekday codes by weekday() number, 0 being Sunday, as a run's published days are (#143). */
const ICS_WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function dateStamp(date: string): string {
  return date.replace(/-/g, "");
}

function vevent(e: IcsEvent, siteName: string, stamp: string): string[] {
  const lines = [`UID:${e.id}@kc-events`, `DTSTAMP:${utcStamp(stamp)}`];
  const notes: string[] = [];
  const first = firstDay(e);
  const last = lastDay(e)!;

  if (first === undefined) {
    // A run read after it began: the one day we can stand behind is its last.
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(last)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(last, 1))}`);
    notes.push("Last day.");
  } else if (isDateOnly(e.start!) || (e.end !== undefined && isDateOnly(e.end) && e.recurrence === "limited-run")) {
    const playing = e.days === undefined ? undefined : nextPlayingDay(e, first, last);
    if (playing !== undefined) {
      // A run with days (#143) is one all-day event a week on each of them, from the first it plays through its last day;
      // DTSTART is itself an instance, so it is a day the rule names.
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(playing)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(playing, 1))}`);
      lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${e.days!.map((n) => ICS_WEEKDAYS[n]).join(",")};UNTIL=${dateStamp(last)}`);
    } else {
      // A date-only start, or a run's date end, makes the whole event all-day; a date end is exclusive.
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(first)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(last, 1))}`);
    }
  } else {
    // A one-off's date-only end does not say when it ends (#90): it keeps its start time, with the two-hour
    // placeholder an end-less event gets, and its last day goes in the notes.
    const timedEnd = e.end !== undefined && !isDateOnly(e.end) ? e.end : undefined;
    const end = timedEnd ?? new Date(new Date(e.start!).getTime() + 2 * 3_600_000).toISOString();
    lines.push(`DTSTART:${utcStamp(e.start!)}`, `DTEND:${utcStamp(end)}`);
    if (e.end !== undefined && timedEnd === undefined) notes.push(`Through ${formatDay(last)}.`);
  }

  lines.push(`SUMMARY:${escapeText(e.title)}`, `LOCATION:${escapeText(`${e.venue}, ${e.addressLine ?? e.neighborhood}`)}`, `URL:${detailsUrl(e)}`);
  if (e.geo) lines.push(`GEO:${e.geo.lat};${e.geo.lng}`);
  if (e.whyLine) notes.push(e.whyLine);
  notes.push(`Verified ${formatShort(localDate(e.lastVerified))} by ${siteName}; details at ${detailsUrl(e)}.`);
  lines.push(`DESCRIPTION:${escapeText(notes.join("\n\n"))}`);
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
}

/**
 * An RFC 5545 calendar of the dated events; recurring events are skipped (a schedule phrase is not an RRULE).
 * Published; `calendarName` names it, so Outlook and Google import an export as a calendar of that name, not an
 * unnamed one. A single event's file goes without, so adding it does not offer to make a calendar for one event.
 */
export function toIcs(events: IcsEvent[], opts: { siteName: string; stamp: string; calendarName?: string }): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${opts.siteName}//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  if (opts.calendarName !== undefined) lines.push(`X-WR-CALNAME:${escapeText(opts.calendarName)}`);
  for (const e of events) if (isDated(e)) lines.push(...vevent(e, opts.siteName, opts.stamp));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

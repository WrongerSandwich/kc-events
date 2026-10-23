import { addDays, formatDay, formatShort, formatTime, isDateOnly, localDate } from "./dates";
import { firstDay, isDated, lastDay, detailsUrl } from "./events";
import { nextPlayingDay } from "./filter";
import { kindName } from "./landing";
import type { Geo, PublishedEvent, PublishedVenue } from "./types";
import { addressLine, venueNamed } from "./venues";
import { siteConfig } from "../site.config";

/**
 * An event as its calendar file has it: the build adds its venue's street address and position from the venue table
 * (#137), for LOCATION and GEO; the explorer's export has neither, and LOCATION is the venue and neighborhood. That is
 * decided (#190): the table would add about 3 KB gzipped to the explorer for a file whose every event links its page,
 * and the feeds and each event's own file, which a reader keeps, carry the address. A
 * feed's events (#136) carry `pageUrl`, their page on this site, as URL in place of the event's own page, which the
 * notes still give.
 */
export type IcsEvent = PublishedEvent & { addressLine?: string; geo?: Geo; pageUrl?: string };

/** An event with its venue's street address and position, when the venue has a row; build-time callers only. */
export function locatedForCalendar(venues: readonly PublishedVenue[], e: PublishedEvent): IcsEvent {
  const venue = venueNamed(venues, e.venue);
  return { ...e, ...(venue?.address && { addressLine: addressLine(venue.address) }), ...(venue?.geo && { geo: venue.geo }) };
}

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

/** "Starts Fri Oct 23 at 7:45 pm; ends Sun Oct 25 at 1:45 pm.": a timed start the all-day form would otherwise lose. */
function spanNote(start: string, end: string | undefined, last: string): string {
  const from = `Starts ${formatDay(localDate(start))} at ${formatTime(start)}`;
  return end !== undefined && !isDateOnly(end) ? `${from}; ends ${formatDay(last)} at ${formatTime(end)}.` : `${from}; through ${formatDay(last)}.`;
}

function vevent(e: IcsEvent, siteName: string, stamp: string): string[] {
  const lines = [`UID:${e.id}@kc-events`, `DTSTAMP:${utcStamp(stamp)}`];
  const notes: string[] = [];
  const first = firstDay(e);
  const last = lastDay(e)!;
  let allDay = true;

  if (first === undefined) {
    // A run read after it began: the one day we can stand behind is its last.
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(last)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(last, 1))}`);
    notes.push("Last day.");
  } else if (isDateOnly(e.start!) || (e.end !== undefined && isDateOnly(e.end) && e.recurrence === "limited-run") || last > first) {
    // A date-only start, a run's date end, or a span over more than one day (#190: a timed one-off that ends on a later
    // day is listed on the site under each of its days, so one timed block of 42 hours says less) makes the whole event
    // all-day; a date end is exclusive. A timed start goes in the notes, and with it a timed end.
    const playing = e.days === undefined ? undefined : nextPlayingDay(e, first, last);
    if (playing !== undefined) {
      // A run with days (#143) is one all-day event a week on each of them, from the first it plays through its last day;
      // DTSTART is itself an instance, so it is a day the rule names.
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(playing)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(playing, 1))}`);
      lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${e.days!.map((n) => ICS_WEEKDAYS[n]).join(",")};UNTIL=${dateStamp(last)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(first)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(last, 1))}`);
    }
    if (!isDateOnly(e.start!)) notes.push(spanNote(e.start!, e.end, last));
    // A date-only start means the page gave no time, not that the event runs all day (F3); a run's dates are its point.
    else if (e.recurrence !== "limited-run") notes.push("No time listed on the venue's page; check before you go.");
  } else {
    // One day, or one night past midnight: the stated end, else the two-hour placeholder, which the notes own up to (#190).
    allDay = false;
    const timedEnd = e.end !== undefined && !isDateOnly(e.end) ? e.end : undefined;
    const end = timedEnd ?? new Date(new Date(e.start!).getTime() + 2 * 3_600_000).toISOString();
    lines.push(`DTSTART:${utcStamp(e.start!)}`, `DTEND:${utcStamp(end)}`);
    if (timedEnd === undefined) notes.push("End time not listed; shown as two hours.");
  }

  // The catch-all region's name ("Elsewhere in the metro") is no place: with no street address, an event there is at its venue alone.
  const place = e.addressLine ?? (siteConfig.regionAddress[e.region] === undefined ? undefined : e.neighborhood);
  lines.push(`SUMMARY:${escapeText(e.title)}`, `LOCATION:${escapeText(place === undefined ? e.venue : `${e.venue}, ${place}`)}`, `URL:${e.pageUrl ?? detailsUrl(e)}`);
  if (e.geo) lines.push(`GEO:${e.geo.lat};${e.geo.lng}`);
  // The kind as a category, which Apple Calendar and Thunderbird can colour by, the site's own idiom (#190).
  lines.push(`CATEGORIES:${escapeText(kindName(e.kind))}`);
  // An all-day entry is a span to know about, not a day taken: a seven-week exhibition is not seven weeks busy.
  if (allDay) lines.push("TRANSP:TRANSPARENT");
  lines.push(`LAST-MODIFIED:${utcStamp(e.lastVerified)}`);
  if (e.whyLine) notes.push(e.whyLine);
  notes.push(`Verified ${formatShort(localDate(e.lastVerified))} by ${siteName}; details at ${detailsUrl(e)}.`);
  lines.push(`DESCRIPTION:${escapeText(notes.join("\n\n"))}`);
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
}

/**
 * An RFC 5545 calendar of the dated events; recurring events are skipped (a schedule phrase is not an RRULE).
 * Published; `calendarName` names it, so Outlook and Google import an export as a calendar of that name, not an
 * unnamed one. A single event's file goes without, so adding it does not offer to make a calendar for one event.
 * The name goes as RFC 7986's NAME and the older X-WR-CALNAME most clients read; `description` likewise as DESCRIPTION
 * and X-WR-CALDESC (#190). `properties` are more of the calendar's own, after those: a feed's refresh interval (#136).
 */
export function toIcs(
  events: IcsEvent[],
  opts: { siteName: string; stamp: string; calendarName?: string; description?: string; properties?: string[] },
): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${opts.siteName}//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  if (opts.calendarName !== undefined) lines.push(`NAME:${escapeText(opts.calendarName)}`, `X-WR-CALNAME:${escapeText(opts.calendarName)}`);
  if (opts.description !== undefined) lines.push(`DESCRIPTION:${escapeText(opts.description)}`, `X-WR-CALDESC:${escapeText(opts.description)}`);
  lines.push(...(opts.properties ?? []));
  for (const e of events) if (isDated(e)) lines.push(...vevent(e, opts.siteName, opts.stamp));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

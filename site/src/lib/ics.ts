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
 * and the feeds and each event's own file, which a reader keeps, carry the address. A feed's events (#136) carry
 * `pageUrl`, their page on this site, as URL in place of the event's own page, which the notes still give.
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

/**
 * When an event goes in a calendar, and the notes that go with it: the .ics file's DTSTART, DTEND and RRULE, and the
 * same for Google Calendar's template link (#188), so the two never disagree. Stamps are RFC 5545's: a date for an
 * all-day event, whose end is exclusive, else a UTC instant.
 */
function calendarTimes(e: PublishedEvent, visitFrom?: string): { allDay: boolean; start: string; end: string; rrule?: string; notes: string[] } {
  const notes: string[] = [];
  const first = firstDay(e);
  const last = lastDay(e)!;

  const from = visitFrom === undefined || (first !== undefined && first > visitFrom) ? first : visitFrom;
  // A day it plays, when it has days; none left (or a run already closed) leaves the span, as before.
  const day = from === undefined || from > last ? undefined : e.days === undefined ? from : nextPlayingDay(e, from, last);
  if (visitFrom !== undefined && e.recurrence === "limited-run" && (first === undefined || last > first) && day !== undefined) {
    // One event's own file, from a card or its page: a run goes in as one day to go, the first it is open from
    // `visitFrom`, not as its whole span, which would lay an exhibition months long across the calendar from a day
    // already gone. A feed or an export keeps the span: there it is a run to know about. `visitFrom` is the build's
    // day, so between midnight and the daily rebuild (or after a failed one) it is a day behind.
    if (e.start !== undefined && !isDateOnly(e.start)) notes.push(spanNote(e.start, e.end, last));
    else notes.push(first === undefined ? `Runs through ${formatDay(last)}.` : `Runs ${formatDay(first)} through ${formatDay(last)}.`);
    if (e.daysLine !== undefined) notes.push(`${e.daysLine} each week.`);
    notes.push("Set on one day of the run; move it to the day you go.");
    return { allDay: true, start: dateStamp(day), end: dateStamp(addDays(day, 1)), notes };
  }

  if (first === undefined) {
    // A run read after it began: the one day we can stand behind is its last.
    notes.push("Last day.");
    return { allDay: true, start: dateStamp(last), end: dateStamp(addDays(last, 1)), notes };
  }
  if (isDateOnly(e.start!) || (e.end !== undefined && isDateOnly(e.end) && e.recurrence === "limited-run") || last > first) {
    // A date-only start, a run's date end, or a span over more than one day (#190: a timed one-off that ends on a later
    // day is listed on the site under each of its days, so one timed block of 42 hours says less) makes the whole event
    // all-day; a date end is exclusive. A timed start goes in the notes, and with it a timed end.
    if (!isDateOnly(e.start!)) notes.push(spanNote(e.start!, e.end, last));
    // A date-only start means the page gave no time, not that the event runs all day (F3); a run's dates are its point.
    else if (e.recurrence !== "limited-run") notes.push("No time listed on the venue's page; check before you go.");
    const playing = e.days === undefined ? undefined : nextPlayingDay(e, first, last);
    if (playing !== undefined) {
      // A run with days (#143) is one all-day event a week on each of them, from the first it plays through its last day;
      // DTSTART is itself an instance, so it is a day the rule names.
      const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${e.days!.map((n) => ICS_WEEKDAYS[n]).join(",")};UNTIL=${dateStamp(last)}`;
      return { allDay: true, start: dateStamp(playing), end: dateStamp(addDays(playing, 1)), rrule, notes };
    }
    return { allDay: true, start: dateStamp(first), end: dateStamp(addDays(last, 1)), notes };
  }
  // One day, or one night past midnight: the stated end, else the two-hour placeholder, which the notes own up to (#190).
  const timedEnd = e.end !== undefined && !isDateOnly(e.end) ? e.end : undefined;
  const end = timedEnd ?? new Date(new Date(e.start!).getTime() + 2 * 3_600_000).toISOString();
  if (timedEnd === undefined) notes.push("End time not listed; shown as two hours.");
  return { allDay: false, start: utcStamp(e.start!), end: utcStamp(end), notes };
}

/** Where the event is, for a calendar: its venue, then its street address, else its neighborhood. */
function calendarLocation(e: IcsEvent): string {
  // The catch-all region's name ("Elsewhere in the metro") is no place: with no street address, an event there is at its venue alone.
  const place = e.addressLine ?? (siteConfig.regionAddress[e.region] === undefined ? undefined : e.neighborhood);
  return place === undefined ? e.venue : `${e.venue}, ${place}`;
}

/** The notes after the times: the why-line, then where it was verified and where the details are. */
function calendarNotes(e: IcsEvent, siteName: string, timeNotes: string[]): string {
  const notes = [...timeNotes];
  if (e.whyLine) notes.push(e.whyLine);
  notes.push(`Verified ${formatShort(localDate(e.lastVerified))} by ${siteName}; details at ${detailsUrl(e)}.`);
  return notes.join("\n\n");
}

function vevent(e: IcsEvent, siteName: string, stamp: string, visitFrom?: string): string[] {
  const t = calendarTimes(e, visitFrom);
  const lines = [`UID:${e.id}@kc-events`, `DTSTAMP:${utcStamp(stamp)}`];
  if (t.allDay) lines.push(`DTSTART;VALUE=DATE:${t.start}`, `DTEND;VALUE=DATE:${t.end}`);
  else lines.push(`DTSTART:${t.start}`, `DTEND:${t.end}`);
  if (t.rrule !== undefined) lines.push(t.rrule);
  lines.push(`SUMMARY:${escapeText(e.title)}`, `LOCATION:${escapeText(calendarLocation(e))}`, `URL:${e.pageUrl ?? detailsUrl(e)}`);
  if (e.geo) lines.push(`GEO:${e.geo.lat};${e.geo.lng}`);
  // The kind as a category, which Apple Calendar and Thunderbird can colour by, the site's own idiom (#190).
  lines.push(`CATEGORIES:${escapeText(kindName(e.kind))}`);
  // An all-day entry is a span to know about, not a day taken: a seven-week exhibition is not seven weeks busy.
  if (t.allDay) lines.push("TRANSP:TRANSPARENT");
  lines.push(`LAST-MODIFIED:${utcStamp(e.lastVerified)}`);
  lines.push(`DESCRIPTION:${escapeText(calendarNotes(e, siteName, t.notes))}`);
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
}

/**
 * Google Calendar's event template for a dated event (#188): Google Calendar on Android does not open a downloaded
 * .ics, so the event page links this beside Add to calendar. A plain link, so nothing goes to Google until it is
 * tapped; the times, place and notes are the calendar file's, so it takes the same `visitFrom`.
 */
export function googleCalendarUrl(e: IcsEvent, siteName: string, visitFrom?: string): string {
  const t = calendarTimes(e, visitFrom);
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${t.start}/${t.end}`, details: calendarNotes(e, siteName, t.notes), location: calendarLocation(e) });
  if (t.rrule !== undefined) p.set("recur", t.rrule);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/**
 * An RFC 5545 calendar of the dated events; recurring events are skipped (a schedule phrase is not an RRULE).
 * Published; `calendarName` names it, so Outlook and Google import an export as a calendar of that name, not an
 * unnamed one. A single event's file goes without, so adding it does not offer to make a calendar for one event.
 * The name goes as RFC 7986's NAME and the older X-WR-CALNAME most clients read; `description` likewise as DESCRIPTION
 * and X-WR-CALDESC (#190). `properties` are more of the calendar's own, after those: a feed's refresh interval (#136).
 * `visitFrom`, for one event's own file, puts a run in as one day to go from that day on (calendarTimes).
 */
export function toIcs(
  events: IcsEvent[],
  opts: { siteName: string; stamp: string; calendarName?: string; description?: string; properties?: string[]; visitFrom?: string },
): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${opts.siteName}//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  if (opts.calendarName !== undefined) lines.push(`NAME:${escapeText(opts.calendarName)}`, `X-WR-CALNAME:${escapeText(opts.calendarName)}`);
  if (opts.description !== undefined) lines.push(`DESCRIPTION:${escapeText(opts.description)}`, `X-WR-CALDESC:${escapeText(opts.description)}`);
  lines.push(...(opts.properties ?? []));
  for (const e of events) if (isDated(e)) lines.push(...vevent(e, opts.siteName, opts.stamp, opts.visitFrom));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
